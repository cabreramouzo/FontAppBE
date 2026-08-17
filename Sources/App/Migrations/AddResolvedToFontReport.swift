import Fluent

/// Dar por resuelta una incidencia, en vez de borrarla.
///
/// Hasta ahora una incidencia solo se podía **borrar**, y eso pierde información: que una
/// fuente estuvo rota tres meses y se arregló es parte de su historia, y es justo lo que
/// mira quien duda si acercarse. Marcarla resuelta lo conserva y además es **reversible**,
/// que es la condición para poder abrirlo por nivel.
struct AddResolvedToFontReport: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("font_reports")
            .field("resolved_at", .datetime)
            .field("resolved_by", .uuid, .references("users", "id", onDelete: .setNull))
            .update()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("font_reports")
            .deleteField("resolved_at")
            .deleteField("resolved_by")
            .update()
    }
}
