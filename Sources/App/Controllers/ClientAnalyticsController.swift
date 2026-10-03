import Fluent
import SQLKit
import Vapor

/// `GET /admin/analytics/clients?days=30|180` — per platform (web, ios, android): people
/// who used FontApp signed in, people who contributed, and people who came back on at
/// least two different days. The last one is the question the native app has to answer
/// (FA-09): installs say nothing, coming back and contributing does.
///
/// Counts people per platform; one person on the web and on iOS counts in both.
struct ClientAnalyticsController: RouteCollection {
    struct PlatformSummary: Content, Sendable, Equatable {
        let platform: String
        let people: Int
        let contributors: Int
        let returning: Int
        let today: Int
    }

    func boot(routes: any RoutesBuilder) throws {
        routes.grouped("admin", "analytics", "clients")
            .grouped(UserToken.authenticator(), User.guardMiddleware())
            .get(use: summary)
    }

    @Sendable func summary(req: Request) async throws -> [PlatformSummary] {
        let user = try req.auth.require(User.self)
        guard user.isAdmin, let sql = req.db as? SQLDatabase else { throw Abort(.forbidden) }
        let days = req.query[Int.self, at: "days"] ?? 30
        guard days == 30 || days == 180 else { throw Abort(.badRequest) }
        return try await sql.raw("""
            WITH period AS (
                SELECT * FROM client_days WHERE day >= CURRENT_DATE - (\(bind: days - 1))::int
            ), per_person AS (
                SELECT platform, user_id, COUNT(DISTINCT day) AS days FROM period GROUP BY platform, user_id
            )
            SELECT p.platform,
                   COUNT(DISTINCT p.user_id)::int AS people,
                   COUNT(DISTINCT p.user_id) FILTER (WHERE p.contributed)::int AS contributors,
                   (SELECT COUNT(*)::int FROM per_person pp WHERE pp.platform = p.platform AND pp.days >= 2) AS returning,
                   COUNT(DISTINCT p.user_id) FILTER (WHERE p.day = CURRENT_DATE)::int AS today
            FROM period p
            GROUP BY p.platform
            ORDER BY people DESC
            """).all(decoding: PlatformSummary.self)
    }
}
