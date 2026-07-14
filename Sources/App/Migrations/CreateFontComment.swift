import Fluent

struct CreateFontComment: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("font_comments")
            .id()
            .field("font_id", .uuid, .required, .references("fonts", "id", onDelete: .cascade))
            .field("body", .string, .required)
            .field("created_at", .datetime)
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("font_comments").delete()
    }
}
