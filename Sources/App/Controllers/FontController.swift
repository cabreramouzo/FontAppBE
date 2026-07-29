import Fluent
import Vapor

// CRUD de fuentes + búsqueda por cercanía — ver definitions.md (Fonts management).
struct FontController: RouteCollection {
    /// Tope de resultados devueltos por `/fonts/near` (evita respuestas ilimitadas).
    static let maxNearQuantity = 100
    /// Tope de marcadores de `/fonts/in-bounds` (el mapa; markercluster agrupa el resto).
    static let maxInBoundsResults = 3000

    func boot(routes: RoutesBuilder) throws {
        let fonts = routes.grouped("fonts")

        // Lectura pública.
        fonts.get(use: index)
        fonts.get("near", use: near)
        fonts.get("near", "download", use: nearDownload)
        fonts.get("in-bounds", use: inBounds)
        fonts.get(":fontID", use: show)

        // Escritura: requiere token Bearer válido.
        let protected = fonts.grouped(UserToken.authenticator(), User.guardMiddleware())
        protected.post(use: create)
        protected.group(":fontID") { font in
            font.put(use: update)
            font.delete(use: destroy)
        }
    }

    @Sendable func create(req: Request) async throws -> Response {
        try CreateFontDTO.validate(content: req)
        let dto = try req.content.decode(CreateFontDTO.self)
        let font = Font(name: dto.name, latitude: dto.latitude, longitude: dto.longitude, image: dto.image, description: dto.description, source: dto.source, drinkable: dto.drinkable)
        try await font.save(on: req.db)

        let response = Response(status: .created)
        try response.content.encode(font)
        return response
    }

    /// GET /fonts?page=&per=&search= — listado paginado; `search` filtra por nombre (ILIKE, insensible a mayúsculas).
    @Sendable func index(req: Request) async throws -> Page<Font> {
        let query = Font.query(on: req.db).sort(\.$name)
        if let search = req.query[String.self, at: "search"], !search.isEmpty {
            query.filter(\.$name, .custom("ILIKE"), "%\(search)%")
        }
        return try await query.paginate(for: req)
    }

    @Sendable func show(req: Request) async throws -> Font {
        try await find(req)
    }

    @Sendable func update(req: Request) async throws -> Font {
        try CreateFontDTO.validate(content: req)
        let font = try await find(req)
        let dto = try req.content.decode(CreateFontDTO.self)
        let oldImage = font.image
        font.name = dto.name
        font.latitude = dto.latitude
        font.longitude = dto.longitude
        font.image = dto.image
        font.description = dto.description
        font.source = dto.source
        font.drinkable = dto.drinkable
        try await font.save(on: req.db)
        if let oldImage, oldImage != dto.image { try? await req.imageStorage.delete(oldImage) }
        return font
    }

    @Sendable func destroy(req: Request) async throws -> HTTPStatus {
        let font = try await find(req)
        // Limpia las imágenes asociadas (de la fuente y de sus reseñas) antes de borrar.
        if let image = font.image { try? await req.imageStorage.delete(image) }
        let commentImages = try await FontComment.query(on: req.db)
            .filter(\.$font.$id == font.requireID())
            .all()
            .compactMap(\.image)
        for image in commentImages { try? await req.imageStorage.delete(image) }
        try await font.delete(on: req.db)
        return .noContent
    }

    /// GET /fonts/near?lat={}&long={}&quantity={}
    /// Prefiltro por bounding box (indexado por lat/long) + haversine + orden por distancia.
    /// TODO: a escala real, sustituir por PostGIS (columna `geography` + índice GiST).
    @Sendable func near(req: Request) async throws -> [FontSummary] {
        try NearQuery.validate(query: req)
        let params = try req.query.decode(NearQuery.self)
        let quantity = min(max(1, params.quantity ?? 10), Self.maxNearQuantity)
        let delta = 0.5 // ~55 km a nivel del ecuador; suficiente como prefiltro.

        let candidates = try await Font.query(on: req.db)
            .filter(\.$latitude >= params.lat - delta)
            .filter(\.$latitude <= params.lat + delta)
            .filter(\.$longitude >= params.long - delta)
            .filter(\.$longitude <= params.long + delta)
            .limit(Self.maxNearQuantity * 5) // cota de seguridad sobre el candidate set en memoria.
            .all()

        let sorted = candidates
            .sorted {
                haversineKm(params.lat, params.long, $0.latitude, $0.longitude)
                    < haversineKm(params.lat, params.long, $1.latitude, $1.longitude)
            }
            .prefix(quantity)
            .map { $0 }
        return try await Font.summaries(for: sorted, on: req.db)
    }

    /// GET /fonts/near/download — mismo conjunto que `near`, pensado para cachear offline en el cliente.
    @Sendable func nearDownload(req: Request) async throws -> [FontSummary] {
        try await near(req: req)
    }

    /// GET /fonts/in-bounds?minLat=&maxLat=&minLong=&maxLong=
    /// Fuentes dentro del área visible de un mapa. Indexado por (latitude, longitude).
    @Sendable func inBounds(req: Request) async throws -> [FontSummary] {
        try BoundsQuery.validate(query: req)
        let b = try req.query.decode(BoundsQuery.self)
        let fonts = try await Font.query(on: req.db)
            .filter(\.$latitude >= b.minLat)
            .filter(\.$latitude <= b.maxLat)
            .filter(\.$longitude >= b.minLong)
            .filter(\.$longitude <= b.maxLong)
            .limit(Self.maxInBoundsResults)
            .all()
        return try await Font.summaries(for: fonts, on: req.db)
    }

    private func find(_ req: Request) async throws -> Font {
        guard let font = try await Font.find(req.parameters.get("fontID"), on: req.db) else {
            throw Abort(.notFound)
        }
        return font
    }
}

struct CreateFontDTO: Content {
    let name: String
    let latitude: Double
    let longitude: Double
    let image: String?
    let description: String?
    let source: WaterSource?
    let drinkable: Drinkable?
}

extension CreateFontDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("name", as: String.self, is: !.empty)
        validations.add("latitude", as: Double.self, is: .range(-90...90))
        validations.add("longitude", as: Double.self, is: .range(-180...180))
    }
}

struct NearQuery: Content {
    let lat: Double
    let long: Double
    let quantity: Int?
}

struct BoundsQuery: Content {
    let minLat: Double
    let maxLat: Double
    let minLong: Double
    let maxLong: Double
}

extension BoundsQuery: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("minLat", as: Double.self, is: .range(-90...90))
        validations.add("maxLat", as: Double.self, is: .range(-90...90))
        validations.add("minLong", as: Double.self, is: .range(-180...180))
        validations.add("maxLong", as: Double.self, is: .range(-180...180))
    }
}

extension NearQuery: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("lat", as: Double.self, is: .range(-90...90))
        validations.add("long", as: Double.self, is: .range(-180...180))
        validations.add("quantity", as: Int.self, is: .range(1...), required: false)
    }
}
