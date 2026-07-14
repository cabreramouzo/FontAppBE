import Fluent
import Vapor

// Reportes de problemas sobre una fuente — ver definitions.md (Fonts problem management).
// Un "report" avisa de una INCIDENCIA en la fuente (avería, sin agua, sucia, grifo roto…).
// TODO: cuando exista auth, asociar cada report al usuario que lo crea (user_id) y añadir estado.
struct FontReportController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let reports = routes.grouped("fonts", ":fontID", "report")
        reports.get(use: index) // lectura pública
        reports.grouped(UserToken.authenticator(), User.guardMiddleware()).post(use: create)
    }

    /// GET /fonts/:fontID/report — lista los problemas reportados en la fuente.
    @Sendable func index(req: Request) async throws -> [ReportResponse] {
        let fontID = try await requireFontID(req)
        let reports = try await FontReport.query(on: req.db)
            .filter(\.$font.$id == fontID)
            .sort(\.$createdAt, .descending)
            .all()
        return reports.map(ReportResponse.init)
    }

    /// POST /fonts/:fontID/report — reporta un problema en la fuente.
    @Sendable func create(req: Request) async throws -> Response {
        let fontID = try await requireFontID(req)
        try CreateReportDTO.validate(content: req)
        let dto = try req.content.decode(CreateReportDTO.self)

        let report = FontReport(fontID: fontID, message: dto.message)
        try await report.save(on: req.db)

        let response = Response(status: .created)
        try response.content.encode(ReportResponse(report))
        return response
    }

    /// Verifica que la fuente existe (404 si no) y devuelve su id.
    private func requireFontID(_ req: Request) async throws -> UUID {
        guard let font = try await Font.find(req.parameters.get("fontID"), on: req.db) else {
            throw Abort(.notFound, reason: "No existe la fuente indicada")
        }
        return try font.requireID()
    }
}

struct CreateReportDTO: Content {
    let message: String
}

extension CreateReportDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("message", as: String.self, is: .count(1...1000))
    }
}

/// Representación pública de un reporte (evita el `{"font":{"id":…}}` del @Parent).
struct ReportResponse: Content {
    let id: UUID?
    let fontID: UUID
    let message: String
    let createdAt: Date?

    init(_ report: FontReport) {
        self.id = report.id
        self.fontID = report.$font.id
        self.message = report.message
        self.createdAt = report.createdAt
    }
}
