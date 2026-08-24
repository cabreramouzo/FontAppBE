import Fluent
import SQLKit

/// Cuarentena reversible para fuentes y sanciones de escritura para cuentas.
/// El historial separado permite restaurar sin perder quién tomó cada decisión.
struct AddAbuseModeration: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("fonts")
            .field("moderation_state", .string, .required, .sql(.default("visible")))
            .field("moderation_reason", .string)
            .field("moderated_at", .datetime)
            .field("moderated_by", .uuid, .references("users", "id", onDelete: .setNull))
            .update()
        try await database.schema("users")
            .field("moderation_strikes", .int, .required, .sql(.default(0)))
            .field("posting_restricted_until", .datetime)
            .update()
        try await database.schema("moderation_actions")
            .id()
            .field("font_id", .uuid, .references("fonts", "id", onDelete: .setNull))
            .field("subject_user_id", .uuid, .references("users", "id", onDelete: .setNull))
            .field("actor_id", .uuid, .references("users", "id", onDelete: .setNull))
            .field("action", .string, .required)
            .field("reason", .string)
            .field("created_at", .datetime, .required)
            .create()
        if let sql = database as? SQLDatabase {
            try await sql.raw("CREATE INDEX IF NOT EXISTS fonts_moderation_hidden_idx ON fonts (id) WHERE moderation_state <> 'visible'").run()
            try await sql.raw("CREATE INDEX IF NOT EXISTS moderation_actions_subject_idx ON moderation_actions (subject_user_id, created_at DESC)").run()
        }
    }

    func revert(on database: any Database) async throws {
        try await database.schema("moderation_actions").delete()
        try await database.schema("users")
            .deleteField("moderation_strikes")
            .deleteField("posting_restricted_until")
            .update()
        try await database.schema("fonts")
            .deleteField("moderation_state")
            .deleteField("moderation_reason")
            .deleteField("moderated_at")
            .deleteField("moderated_by")
            .update()
    }
}
