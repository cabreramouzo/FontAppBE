import Fluent

struct CreateFontComment: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("font_comments")
            .id()
            .field("font_id", .uuid, .required, .references("fonts", "id", onDelete: .cascade))
            // Autor: opcional, setNull si se borra el usuario.
            .field("user_id", .uuid, .references("users", "id", onDelete: .setNull))
            .field("body", .string, .required)
            // Campos de "reseña / actualización de estado" (todos opcionales).
            .field("rating", .int)
            .field("water_status", .string)
            .field("image", .string)
            .field("created_at", .datetime)
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("font_comments").delete()
    }
}
