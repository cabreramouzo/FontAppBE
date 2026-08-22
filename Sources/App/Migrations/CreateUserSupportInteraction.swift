import Fluent
import SQLKit

/// Interacciones de apoyo asociadas a una cuenta autenticada. Se mantienen separadas
/// de la analítica general para que esta última continúe siendo anónima y agregable.
struct CreateUserSupportInteraction: AsyncMigration {
    func prepare(on db: Database) async throws {
        try await db.schema("user_support_interactions").id()
            .field("user_id", .uuid, .required,
                   .references("users", "id", onDelete: .cascade))
            .field("event", .string, .required)
            .field("first_clicked_at", .datetime, .required)
            .field("last_clicked_at", .datetime, .required)
            .field("hits", .int, .required)
            .unique(on: "user_id", "event")
            .create()
        if let sql = db as? SQLDatabase {
            try await sql.raw("CREATE INDEX user_support_interactions_last_clicked_idx ON user_support_interactions (last_clicked_at)").run()
        }
    }

    func revert(on db: Database) async throws {
        try await db.schema("user_support_interactions").delete()
    }
}
