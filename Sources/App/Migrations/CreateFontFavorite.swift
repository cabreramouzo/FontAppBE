import Fluent

struct CreateFontFavorite: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("font_favorites")
            .id()
            .field("font_id", .uuid, .required, .references("fonts", "id", onDelete: .cascade))
            .field("user_id", .uuid, .required, .references("users", "id", onDelete: .cascade))
            .field("created_at", .datetime)
            // Un usuario guarda una misma fuente una única vez.
            .unique(on: "font_id", "user_id")
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("font_favorites").delete()
    }
}
