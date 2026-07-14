import Fluent
import Vapor

// CRUD de fuentes + búsqueda por cercanía — ver definitions.md (Fonts management).
struct FontController: RouteCollection {
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

    @Sendable func create(req: Request) async throws -> Font {
        let dto = try req.content.decode(CreateFontDTO.self)
        let font = Font(name: dto.name, latitude: dto.latitude, longitude: dto.longitude, image: dto.image, description: dto.description)
        try await font.save(on: req.db)
        return font
    }

    @Sendable func show(req: Request) async throws -> Font {
        try await find(req)
    }

    @Sendable func update(req: Request) async throws -> Font {
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
    /// Prefiltro por bounding box para no traer toda la tabla; luego haversine + orden por distancia.
    /// TODO: a escala real, sustituir por PostGIS (columna `geography` + índice GiST).
    @Sendable func near(req: Request) async throws -> [Font] {
        let params = try req.query.decode(NearQuery.self)
        let quantity = max(1, params.quantity ?? 10)
        let delta = 0.5 // ~55 km a nivel del ecuador; suficiente como prefiltro.

        let candidates = try await Font.query(on: req.db)
            .filter(\.$latitude >= params.lat - delta)
            .filter(\.$latitude <= params.lat + delta)
            .filter(\.$longitude >= params.long - delta)
            .filter(\.$longitude <= params.long + delta)
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

struct NearQuery: Content {
    let lat: Double
    let long: Double
    let quantity: Int?
}
