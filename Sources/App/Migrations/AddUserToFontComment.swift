import Fluent

// Asocia cada comentario al usuario que lo escribe. Columna opcional con
// ON DELETE SET NULL (si se borra el usuario, el comentario queda sin autor).
struct AddUserToFontComment: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("font_comments")
            .field("user_id", .uuid, .references("users", "id", onDelete: .setNull))
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("font_comments")
            .deleteField("user_id")
            .update()
    }
}
