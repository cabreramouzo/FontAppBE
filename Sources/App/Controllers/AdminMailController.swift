import Fluent
import Vapor

/// Envío manual del resumen semanal desde el panel de administración: primero una
/// vista previa (equivalente a `send-weekly-digest --dry-run`) y luego el envío.
///
/// **Solo el propietario.** Es la acción con más alcance de toda la app —escribe a
/// TODOS los usuarios a la vez y no se puede deshacer—, así que no basta con ser admin.
struct AdminMailController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let admin = routes.grouped("admin", "weekly-digest")
            .grouped(UserToken.authenticator(), User.guardMiddleware())
        admin.get(use: preview)
        admin.post(use: send)
    }

    /// GET /admin/weekly-digest — a quién se le enviaría y con cuánto contenido.
    /// No envía nada ni tiene efectos: se puede pulsar tantas veces como haga falta.
    @Sendable func preview(req: Request) async throws -> WeeklyDigestSender.Result {
        try requireOwner(req)
        return try await WeeklyDigestSender.run(
            dryRun: true, db: req.db, client: req.client, mailSender: req.mailSender, logger: req.logger
        )
    }

    /// POST /admin/weekly-digest — envía de verdad, ahora.
    @Sendable func send(req: Request) async throws -> WeeklyDigestSender.Result {
        let me = try requireOwner(req)
        req.logger.notice("Resum setmanal: enviament manual iniciat per \(me.username)")
        return try await WeeklyDigestSender.run(
            dryRun: false, db: req.db, client: req.client, mailSender: req.mailSender, logger: req.logger
        )
    }

    @discardableResult
    private func requireOwner(_ req: Request) throws -> User {
        let me = try req.auth.require(User.self)
        guard me.isOwner else { throw Abort(.forbidden, reason: "Solo el propietario") }
        return me
    }
}
