import Fluent

/// Un comentario se puede corregir durante la primera hora, y queda dicho que se editó.
///
/// La columna es **explícita** y no se deduce de un `updated_at`: Fluent pone el
/// `@Timestamp(on: .update)` también al crear, así que «editado» habría que adivinarlo
/// comparando dos fechas casi iguales con alguna tolerancia — y eso falla en silencio el
/// día que una escritura de otra cosa (marcar como incidencia, resolver) toque la fila.
/// Aquí solo la escribe la edición del texto, y por eso significa exactamente eso.
///
/// Nace nula: lo escrito hasta hoy no se ha editado.
struct AddEditedAtToFontReport: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema(FontReport.schema)
            .field("edited_at", .datetime)
            .update()
    }

    func revert(on database: any Database) async throws {
        try await database.schema(FontReport.schema)
            .deleteField("edited_at")
            .update()
    }
}
