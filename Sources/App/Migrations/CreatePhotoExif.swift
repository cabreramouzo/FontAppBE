import Fluent

struct CreatePhotoExif: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("photo_exif")
            .id()
            // Único: una foto se sube una vez. Si el mismo identificador llegara dos
            // veces sería un fallo, y es mejor que lo diga la base que descubrirlo luego
            // con dos verdades distintas sobre la misma imagen.
            .field("photo_id", .uuid, .required)
            .unique(on: "photo_id")
            .field("taken_at", .datetime)
            .field("latitude", .double)
            .field("longitude", .double)
            .field("uploaded_by", .uuid, .references("users", "id", onDelete: .setNull))
            .field("created_at", .datetime)
            .create()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("photo_exif").delete()
    }
}
