import Fluent

/// Respuestas: un comentario puede colgar de otro.
///
/// **`onDelete: .setNull` y no `.cascade`.** Al borrar tu comentario, las respuestas son
/// palabras de otras personas y no se las puede llevar por delante — es la misma regla que
/// impide que borrar una fuente se lleve las reseñas ajenas. La respuesta sobrevive como
/// comentario suelto, que es el precio honesto: pierde el hilo, no el contenido.
///
/// **Un solo nivel.** El controlador rechaza responder a una respuesta: dos niveles ya
/// obligan a plegar, a paginar y a decidir qué se enseña, y esta caja tiene hoy once
/// comentarios en toda su historia. Cuando haga falta, la columna ya está.
struct AddParentToFontReport: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema(FontReport.schema)
            .field("parent_id", .uuid, .references(FontReport.schema, "id", onDelete: .setNull))
            .update()
    }

    func revert(on database: any Database) async throws {
        try await database.schema(FontReport.schema)
            .deleteField("parent_id")
            .update()
    }
}
