import Fluent
import SQLKit

/// Fotos secundarias de una fuente, con su tipo.
///
/// La portada sigue viviendo en `fonts.image` y esto **no la sustituye**: el mapa y
/// `GET /fonts` devuelven miles de fuentes y no pueden pagar un join por la galería de
/// cada una. Aquí solo está lo que se pide al abrir «otras fotos».
struct CreateFontPhoto: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("font_photos")
            .id()
            .field("font_id", .uuid, .required, .references("fonts", "id", onDelete: .cascade))
            .field("url", .string, .required)
            // `fountain` · `document` · `context`. Se guarda como texto y no como enum de
            // Postgres para poder añadir un tipo nuevo sin una migración de tipo, que en
            // Fluent es incómoda y aquí no compra nada.
            .field("kind", .string, .required)
            .field("uploaded_by", .uuid, .references("users", "id", onDelete: .setNull))
            .field("caption", .string)
            .field("created_at", .datetime)
            .create()

        // La galería se lee siempre por fuente y ordenada por fecha; sin este índice es
        // un recorrido de la tabla entera cada vez que alguien abre una ficha.
        guard let sql = database as? SQLDatabase else { return }
        try await sql.raw(
            "CREATE INDEX IF NOT EXISTS font_photos_font_created_idx ON font_photos (font_id, created_at DESC)"
        ).run()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("font_photos").delete()
    }
}
