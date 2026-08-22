import Fluent
import SQLKit
import Vapor

/// Analítica propia de interacciones, deliberadamente pequeña: evento cerrado + día +
/// sesión aleatoria de pestaña. No guarda usuario, IP, URL, user-agent ni parámetros.
struct InteractionAnalyticsController: RouteCollection {
    static let allowed: Set<String> = [
        "support_heart", "support_view", "support_share", "support_whatsapp",
        "support_feedback", "support_aixeta", "support_stripe_once", "support_btc_copy",
    ]

    func boot(routes: RoutesBuilder) throws {
        routes.grouped(RateLimitMiddleware(scope: "interaction-analytics", max: 120, window: 5 * 60))
            .post("analytics", use: record)
        routes.grouped("admin", "analytics")
            .grouped(UserToken.authenticator(), User.guardMiddleware())
            .get(use: summary)
    }

    @Sendable func record(req: Request) async throws -> HTTPStatus {
        let dto = try req.content.decode(InteractionDTO.self)
        guard Self.allowed.contains(dto.event), let sessionID = UUID(uuidString: dto.session),
              let sql = req.db as? SQLDatabase else { throw Abort(.badRequest) }
        try await sql.raw("""
            INSERT INTO interaction_analytics (id, event, day, session_id, hits)
            VALUES (\(bind: UUID()), \(bind: dto.event), CURRENT_DATE, \(bind: sessionID), 1)
            ON CONFLICT (event, day, session_id)
            DO UPDATE SET hits = interaction_analytics.hits + 1
            """).run()
        // Retención acotada: suficiente para tendencias, sin identificadores eternos.
        try await sql.raw("DELETE FROM interaction_analytics WHERE day < CURRENT_DATE - 180").run()
        return .noContent
    }

    @Sendable func summary(req: Request) async throws -> [InteractionSummary] {
        let user = try req.auth.require(User.self)
        guard user.isAdmin, let sql = req.db as? SQLDatabase else { throw Abort(.forbidden) }
        return try await sql.raw("""
            SELECT event, SUM(hits)::int AS clicks, COUNT(*)::int AS sessions
            FROM interaction_analytics
            WHERE day >= CURRENT_DATE - 29
            GROUP BY event ORDER BY clicks DESC
            """).all(decoding: InteractionSummary.self)
    }
}

struct InteractionDTO: Content { let event: String; let session: String }
struct InteractionSummary: Content { let event: String; let clicks: Int; let sessions: Int }
