import Fluent

struct CreateFontConfirmation: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("font_confirmations")
            .id()
            .field("comment_id", .uuid, .required, .references("font_comments", "id", onDelete: .cascade))
            .field("user_id", .uuid, .required, .references("users", "id", onDelete: .cascade))
            .field("created_at", .datetime)
            // Un usuario confirma un mismo comentario una única vez.
            .unique(on: "comment_id", "user_id")
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("font_confirmations").delete()
    }
}
