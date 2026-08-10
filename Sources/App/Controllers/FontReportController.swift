import Fluent
import Vapor

// Reportes de problemas sobre una fuente — ver definitions.md (Fonts problem management).
// Un "report" avisa de una INCIDENCIA en la fuente (avería, sin agua, sucia, grifo roto…).
struct FontReportController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let reports = routes.grouped("fonts", ":fontID", "report")
        reports.get(use: index) // lectura pública
        let auth = reports.grouped(UserToken.authenticator(), User.guardMiddleware())
        auth.grouped(RateLimitMiddleware(scope: "report", max: 20, window: 60 * 60)).post(use: create)
        auth.group(":reportID") { r in
            r.delete(use: destroy)
        }
    }

    /// GET /fonts/:fontID/report — lista los problemas reportados en la fuente.
    @Sendable func index(req: Request) async throws -> [ReportResponse] {
        let fontID = try await requireFontID(req)
        let reports = try await FontReport.query(on: req.db)
            .filter(\.$font.$id == fontID)
            .sort(\.$createdAt, .descending)
            .all()
        let names = try await User.usernames(for: reports.compactMap { $0.$user.id }, on: req.db)
        return reports.map { ReportResponse($0, username: $0.$user.id.flatMap { names[$0] }) }
    }

    /// POST /fonts/:fontID/report — reporta un problema en la fuente.
    @Sendable func create(req: Request) async throws -> Response {
        let user = try req.auth.require(User.self)
        let fontID = try await requireFontID(req)
        try CreateReportDTO.validate(content: req)
        let dto = try req.content.decode(CreateReportDTO.self)

        let report = FontReport(fontID: fontID, userID: try user.requireID(), message: dto.message)
        try await report.save(on: req.db)

        let response = Response(status: .created)
        try response.content.encode(ReportResponse(report, username: user.username))
        return response
    }

    /// Verifica que la fuente existe (404 si no) y devuelve su id.
    private func requireFontID(_ req: Request) async throws -> UUID {
        guard let font = try await Font.find(req.parameters.get("fontID"), on: req.db) else {
            throw Abort(.notFound, reason: "No existe la fuente indicada")
        }
        return try font.requireID()
    }

    /// DELETE /fonts/:fontID/report/:reportID — borra una incidencia propia.
    @Sendable func destroy(req: Request) async throws -> HTTPStatus {
        let user = try req.auth.require(User.self)
        guard let report = try await FontReport.find(req.parameters.get("reportID"), on: req.db) else {
            throw Abort(.notFound)
        }
        guard user.canModerate || report.$user.id == user.id else {
            throw Abort(.forbidden, reason: "Solo puedes borrar tus propias incidencias")
        }
        try await report.delete(on: req.db)
        return .noContent
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
    let userID: UUID?
    let username: String?
    let message: String
    let createdAt: Date?

    init(_ report: FontReport, username: String?) {
        self.id = report.id
        self.fontID = report.$font.id
        self.userID = report.$user.id
        self.username = username
        self.message = report.message
        self.createdAt = report.createdAt
    }
}
