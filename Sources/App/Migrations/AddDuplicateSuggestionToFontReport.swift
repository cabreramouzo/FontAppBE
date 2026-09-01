import Fluent

/// «Esta fuente es la misma que aquella», dicho por cualquiera.
///
/// Marcar un duplicado de verdad es del nivel 5 (`Capabilities.markDuplicate`) y hoy lo
/// alcanza **una sola persona** que no sea del equipo: medido en producción, 7 llegan a
/// las gotas de Riachuelo y solo 1 a los ocho días. Quien ve el duplicado casi nunca es
/// esa persona — es quien conoce el pueblo, que no tenía botón ninguno y acababa
/// escribiendo un correo. Pasó de verdad, con una fuente triplicada en Castellcir.
///
/// ## Por qué una columna aquí y no una tabla nueva ni una incidencia
///
/// Es una fila de `font_reports` **sin marcar como incidencia**, así que nace inerte: no
/// cuenta como avería abierta en el informe municipal, no sale en novedades, no paga
/// gotas de incidencia y no avisa con urgencia — los cuatro filtran por `is_incident`.
/// Meterla en `IncidentKind` habría sido lo cómodo y habría enseñado a un ayuntamiento
/// tres averías que no existen, que es justo lo que la bandera de incidencias vino a
/// arreglar.
///
/// Y una tabla propia sería duplicar autor, texto, fecha, edición, borrado y moderación
/// para añadir un UUID.
struct AddDuplicateSuggestionToFontReport: AsyncMigration {
    func prepare(on db: Database) async throws {
        try await db.schema("font_reports")
            // A qué fuente se parece. `.setNull` y no `.cascade`: si la buena desaparece,
            // el comentario de esa persona sigue siendo suyo y sigue diciendo algo.
            .field("duplicate_of", .uuid, .references("fonts", "id", onDelete: .setNull))
            .update()
    }
    func revert(on db: Database) async throws {
        try await db.schema("font_reports").deleteField("duplicate_of").update()
    }
}
