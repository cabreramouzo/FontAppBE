import Fluent
import Vapor

// CRUD de fuentes + búsqueda por cercanía — ver definitions.md (Fonts management).
struct FontController: RouteCollection {
    /// Tope de resultados devueltos por `/fonts/near` (evita respuestas ilimitadas).
    static let maxNearQuantity = 100

    func boot(routes: RoutesBuilder) throws {
        let fonts = routes.grouped("fonts")
        fonts.post(use: create)
        fonts.get("near", use: near)
        fonts.get("near", "download", use: nearDownload)
        fonts.group(":fontID") { font in
            font.get(use: show)
            font.put(use: update)
            font.delete(use: destroy)
        }
    }

    @Sendable func create(req: Request) async throws -> Response {
        try CreateFontDTO.validate(content: req)
        let dto = try req.content.decode(CreateFontDTO.self)
        let font = Font(name: dto.name, latitude: dto.latitude, longitude: dto.longitude, image: dto.image, description: dto.description)
        try await font.save(on: req.db)

        let response = Response(status: .created)
        try response.content.encode(font)
        return response
    }

    @Sendable func show(req: Request) async throws -> Font {
        try await find(req)
    }

    @Sendable func update(req: Request) async throws -> Font {
        try CreateFontDTO.validate(content: req)
        let font = try await find(req)
        let dto = try req.content.decode(CreateFontDTO.self)
        font.name = dto.name
        font.latitude = dto.latitude
        font.longitude = dto.longitude
        font.image = dto.image
        font.description = dto.description
        try await font.save(on: req.db)
        return font
    }

    @Sendable func destroy(req: Request) async throws -> HTTPStatus {
        let font = try await find(req)
        try await font.delete(on: req.db)
        return .noContent
    }

    /// GET /fonts/near?lat={}&long={}&quantity={}
    /// Prefiltro por bounding box (indexado por lat/long) + haversine + orden por distancia.
    /// TODO: a escala real, sustituir por PostGIS (columna `geography` + índice GiST).
    @Sendable func near(req: Request) async throws -> [Font] {
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

        return candidates
            .sorted {
                haversineKm(params.lat, params.long, $0.latitude, $0.longitude)
                    < haversineKm(params.lat, params.long, $1.latitude, $1.longitude)
            }
            .prefix(quantity)
            .map { $0 }
    }

    /// GET /fonts/near/download — mismo conjunto que `near`, pensado para cachear offline en el cliente.
    @Sendable func nearDownload(req: Request) async throws -> [Font] {
        try await near(req: req)
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

extension NearQuery: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("lat", as: Double.self, is: .range(-90...90))
        validations.add("long", as: Double.self, is: .range(-180...180))
        validations.add("quantity", as: Int.self, is: .range(1...), required: false)
    }
}
