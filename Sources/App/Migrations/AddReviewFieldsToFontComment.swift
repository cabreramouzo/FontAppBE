import Fluent

// Convierte los comentarios en "actualizaciones de estado / reseñas":
// puntuación de estrellas, estado del agua y foto, todo opcional.
struct AddReviewFieldsToFontComment: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("font_comments")
            .field("rating", .int)
            .field("water_status", .string)
            .field("image", .string)
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("font_comments")
            .deleteField("rating")
            .deleteField("water_status")
            .deleteField("image")
            .update()
    }
}
