import Fluent

struct CreateFontEdit: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("font_edits")
            .id()
            .field("font_id", .uuid, .required, .references("fonts", "id", onDelete: .cascade))
            .field("editor_id", .uuid, .references("users", "id", onDelete: .setNull))
            .field("before", .json, .required)
            .field("after", .json, .required)
            .field("created_at", .datetime)
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("font_edits").delete()
    }
}
