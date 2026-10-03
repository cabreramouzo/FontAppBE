import Fluent
import SQLKit

/// One row per signed-in person, day and client platform (web, ios, android), and whether
/// they contributed from it that day. Written by `ClientActivityMiddleware`; read by
/// `GET /admin/analytics/clients`. Kept 180 days, like the rest of the analytics.
struct CreateClientDays: AsyncMigration {
    func prepare(on db: Database) async throws {
        try await db.schema("client_days").id()
            .field("day", .date, .required)
            .field("platform", .string, .required)
            .field("user_id", .uuid, .required, .references("users", "id", onDelete: .cascade))
            .field("version", .string)
            .field("contributed", .bool, .required, .sql(.default(false)))
            .unique(on: "day", "platform", "user_id")
            .create()
        if let sql = db as? SQLDatabase {
            try await sql.raw("CREATE INDEX client_days_day_idx ON client_days (day)").run()
        }
    }

    func revert(on db: Database) async throws {
        try await db.schema("client_days").delete()
    }
}
