import Fluent

/// Añade la fuente asociada a una denuncia (para enlazar directamente desde moderación).
struct AddFontToContentFlag: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("content_flags")
            .field("font_id", .uuid)
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("content_flags")
            .deleteField("font_id")
            .update()
    }
}
