import Fluent
import SQLKit

struct CreateInteractionAnalytics: AsyncMigration {
    func prepare(on db: Database) async throws {
        try await db.schema("interaction_analytics").id()
            .field("event", .string, .required)
            .field("day", .date, .required)
            .field("session_id", .uuid, .required)
            .field("hits", .int, .required)
            .unique(on: "event", "day", "session_id")
            .create()
        if let sql = db as? SQLDatabase {
            try await sql.raw("CREATE INDEX interaction_analytics_day_idx ON interaction_analytics (day)").run()
        }
    }
    func revert(on db: Database) async throws {
        try await db.schema("interaction_analytics").delete()
    }
}
