import Fluent

struct CreateFontReport: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("font_reports")
            .id()
            .field("font_id", .uuid, .required, .references("fonts", "id", onDelete: .cascade))
            .field("message", .string, .required)
            .field("created_at", .datetime)
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("font_reports").delete()
    }
}
