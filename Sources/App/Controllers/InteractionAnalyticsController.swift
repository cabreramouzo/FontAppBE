import Fluent
import SQLKit
import Vapor

/// Analítica propia de interacciones, deliberadamente pequeña: evento cerrado + día +
/// sesión aleatoria de pestaña. No guarda usuario, IP, URL, user-agent ni parámetros.
struct InteractionAnalyticsController: RouteCollection {
    static let allowed: Set<String> = [
        "support_heart", "support_view", "support_share", "support_whatsapp",
        "support_feedback", "support_aixeta", "support_stripe_once", "support_btc_copy",
        "page_map", "page_fountain", "page_activity", "page_zones", "page_gamification",
        "page_profile", "page_support", "page_install", "page_login", "page_register",
        "nav_map", "nav_activity", "nav_zones", "nav_profile", "nav_login",
        "map_filters", "map_missions", "map_locate", "map_add_font",
        "font_favorite", "font_directions", "font_share", "font_update",
        "auth_google", "auth_passkey", "auth_password", "auth_register", "install_start",
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
        // A los 180 días se conserva el total diario, pero desaparece el UUID de sesión.
        // DELETE ... RETURNING + INSERT es una sola sentencia atómica: nunca duplica
        // históricos aunque el proceso se corte entre compactar y borrar.
        try await sql.raw("""
            WITH moved AS (
                DELETE FROM interaction_analytics WHERE day < CURRENT_DATE - 180
                RETURNING event, day, hits
            ), totals AS (
                SELECT event, day, SUM(hits)::int AS clicks, COUNT(*)::int AS sessions
                FROM moved GROUP BY event, day
            )
            INSERT INTO interaction_analytics_daily (id, event, day, clicks, sessions)
            SELECT gen_random_uuid(), event, day, clicks, sessions FROM totals
            ON CONFLICT (event, day) DO UPDATE SET
                clicks = interaction_analytics_daily.clicks + EXCLUDED.clicks,
                sessions = interaction_analytics_daily.sessions + EXCLUDED.sessions
            """).run()
        return .noContent
    }

    @Sendable func summary(req: Request) async throws -> [InteractionSummary] {
        let user = try req.auth.require(User.self)
        guard user.isAdmin, let sql = req.db as? SQLDatabase else { throw Abort(.forbidden) }
        let requested = req.query[Int.self, at: "days"]
        guard requested == nil || requested == 30 || requested == 180 else { throw Abort(.badRequest) }
        if let days = requested {
            return try await sql.raw("""
                SELECT event, SUM(clicks)::int AS clicks, SUM(sessions)::int AS sessions FROM (
                    SELECT event, SUM(hits)::int AS clicks, COUNT(*)::int AS sessions
                    FROM interaction_analytics WHERE day >= CURRENT_DATE - (\(bind: days - 1))::int GROUP BY event
                    UNION ALL
                    SELECT event, SUM(clicks)::int, SUM(sessions)::int
                    FROM interaction_analytics_daily WHERE day >= CURRENT_DATE - (\(bind: days - 1))::int GROUP BY event
                ) totals GROUP BY event ORDER BY clicks DESC
                """).all(decoding: InteractionSummary.self)
        }
        return try await sql.raw("""
            SELECT event, SUM(clicks)::int AS clicks, SUM(sessions)::int AS sessions FROM (
                SELECT event, SUM(hits)::int AS clicks, COUNT(*)::int AS sessions
                FROM interaction_analytics GROUP BY event
                UNION ALL
                SELECT event, SUM(clicks)::int, SUM(sessions)::int
                FROM interaction_analytics_daily GROUP BY event
            ) totals GROUP BY event ORDER BY clicks DESC
            """).all(decoding: InteractionSummary.self)
    }
}

struct InteractionDTO: Content { let event: String; let session: String }
struct InteractionSummary: Content { let event: String; let clicks: Int; let sessions: Int }
