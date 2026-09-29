import Fluent
import SQLKit
import Vapor

/// Moderation lane for reviews written far from the fountain.
///
/// When the web app sees that the person is clearly more than a kilometre from the fountain
/// (with location permission already granted and allowing for the GPS accuracy), it asks
/// "did you see it recently?" and, if they go ahead, sends the approximate distance with the
/// review (`font_comments.remote_distance_m`). This lane lists them so a moderator can look.
///
/// It is **vigilance, not accusation** — the same stance as the new-accounts lane. Reviewing
/// from elsewhere is often honest: after a ride, from a queue sent later, with a bad GPS.
/// Nothing here hides a review or voids its drops; a moderator who finds a real problem uses
/// the tools that already exist (delete the review, restrict the account). "Checked" only
/// takes it out of the lane.
///
/// Each row carries how many remote reviews the same person wrote in the window: a single
/// one says little, thirty in a week is the pattern worth a look.
struct RemoteReviewController: RouteCollection {
    /// How far back the lane looks.
    static let windowDays = 30

    func boot(routes: any RoutesBuilder) throws {
        let mod = routes.grouped("moderation", "remote-reviews")
            .grouped(UserToken.authenticator(), User.guardMiddleware())
        mod.get(use: index)
        mod.get("summary", use: summary)
        mod.post(":commentID", "checked", use: markChecked)
    }

    struct Row: Content {
        let commentID: UUID
        let fontID: UUID
        let fontName: String?
        let username: String?
        let waterStatus: String?
        let body: String
        let image: String?
        let distanceM: Int
        let queuedOffline: Bool
        let createdAt: Date
        /// Remote reviews by the same person in the window, this one included.
        let authorRemoteCount: Int
    }

    /// How common it is, not who: the lane lists rows, this answers "how many people
    /// review from the sofa?" before looking at any one of them.
    struct Summary: Content {
        let windowDays: Int
        /// Status reviews in the window, remote or not: what the share is of.
        let reviews: Int
        let remote: Int
        let remoteAuthors: Int
        /// Remote reviews still in the lane.
        let unchecked: Int
        /// The people with most remote reviews in the window, most first (at most 10).
        let topAuthors: [Author]
        struct Author: Content {
            let username: String?
            let remote: Int
            let reviews: Int
        }
    }

    /// GET /moderation/remote-reviews/summary
    @Sendable func summary(req: Request) async throws -> Summary {
        let actor = try req.auth.require(User.self)
        guard actor.canModerate else { throw Abort(.forbidden) }
        guard let sql = req.db as? SQLDatabase else { throw Abort(.internalServerError) }
        let cutoff = Date().addingTimeInterval(-Double(Self.windowDays) * 86_400)
        struct Totals: Decodable { let reviews: Int; let remote: Int; let authors: Int; let unchecked: Int }
        let totals = try await sql.raw("""
            SELECT count(*)::int AS "reviews",
                   count(remote_distance_m)::int AS "remote",
                   count(DISTINCT user_id) FILTER (WHERE remote_distance_m IS NOT NULL)::int AS "authors",
                   count(*) FILTER (WHERE remote_distance_m IS NOT NULL AND remote_checked_at IS NULL)::int AS "unchecked"
            FROM font_comments
            WHERE water_status IS NOT NULL AND created_at >= \(bind: cutoff)
            """).first(decoding: Totals.self)
        let top = try await sql.raw("""
            SELECT u.username AS "username",
                   count(c.remote_distance_m)::int AS "remote",
                   count(*)::int AS "reviews"
            FROM font_comments c
            LEFT JOIN users u ON u.id = c.user_id
            WHERE c.water_status IS NOT NULL AND c.created_at >= \(bind: cutoff)
            GROUP BY c.user_id, u.username
            HAVING count(c.remote_distance_m) > 0
            ORDER BY count(c.remote_distance_m) DESC, count(*) DESC
            LIMIT 10
            """).all(decoding: Summary.Author.self)
        return Summary(windowDays: Self.windowDays, reviews: totals?.reviews ?? 0, remote: totals?.remote ?? 0,
                       remoteAuthors: totals?.authors ?? 0, unchecked: totals?.unchecked ?? 0, topAuthors: top)
    }

    /// GET /moderation/remote-reviews — unchecked remote reviews of the last 30 days.
    @Sendable func index(req: Request) async throws -> [Row] {
        let actor = try req.auth.require(User.self)
        guard actor.canModerate else { throw Abort(.forbidden) }
        guard let sql = req.db as? SQLDatabase else { throw Abort(.internalServerError) }
        let cutoff = Date().addingTimeInterval(-Double(Self.windowDays) * 86_400)
        return try await sql.raw("""
            SELECT c.id AS "commentID", c.font_id AS "fontID", f.name AS "fontName",
                   u.username AS "username", c.water_status AS "waterStatus", c.body AS "body",
                   c.image AS "image", c.remote_distance_m AS "distanceM",
                   c.queued_offline AS "queuedOffline", c.created_at AS "createdAt",
                   (SELECT count(*)::int FROM font_comments c2
                     WHERE c2.user_id = c.user_id
                       AND c2.remote_distance_m IS NOT NULL
                       AND c2.created_at >= \(bind: cutoff)) AS "authorRemoteCount"
            FROM font_comments c
            JOIN fonts f ON f.id = c.font_id
            LEFT JOIN users u ON u.id = c.user_id
            WHERE c.remote_distance_m IS NOT NULL
              AND c.remote_checked_at IS NULL
              AND c.created_at >= \(bind: cutoff)
            ORDER BY c.created_at DESC
            LIMIT 100
            """).all(decoding: Row.self)
    }

    /// POST /moderation/remote-reviews/:commentID/checked — out of the lane, review untouched.
    @Sendable func markChecked(req: Request) async throws -> HTTPStatus {
        let actor = try req.auth.require(User.self)
        guard actor.canModerate else { throw Abort(.forbidden) }
        guard let id = req.parameters.get("commentID", as: UUID.self),
              let comment = try await FontComment.find(id, on: req.db) else { throw Abort(.notFound) }
        comment.remoteCheckedAt = Date()
        try await comment.save(on: req.db)
        return .noContent
    }
}
