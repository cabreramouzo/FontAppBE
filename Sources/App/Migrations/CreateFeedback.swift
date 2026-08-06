import Fluent

struct CreateFeedback: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("feedback")
            .id()
            // Autor opcional; setNull si se borra el usuario.
            .field("user_id", .uuid, .references("users", "id", onDelete: .setNull))
            .field("message", .string, .required)
            .field("country", .string)
            .field("email", .string)
            .field("created_at", .datetime)
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("feedback").delete()
    }
}
