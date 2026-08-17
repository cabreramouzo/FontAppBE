import Fluent
import SQLKit

/// Dos formas de que una fuente deje de salir en el mapa **sin borrarla**.
///
/// - `duplicate_of`: es la misma agua que otra ficha. Apunta a la buena.
/// - `retired_at`: ya no existe sobre el terreno (el pilón se quitó, la casa la cerró).
///
/// Se esconden en vez de borrarse porque las dos decisiones son opinables y las toma
/// alguien por nivel, no un admin: tiene que haber vuelta atrás. Y porque borrar se lleva
/// por delante las reseñas y las fotos, que son trabajo de otras personas y siguen siendo
/// ciertas — la fuente estuvo ahí y alguien fue a verla.
///
/// Ojo al añadirlas: **toda consulta que devuelva fuentes al público tiene que
/// filtrarlas** (`Font.visible`). El mapa, el listado, la cercanía, las rutas y las
/// estadísticas de zona. Una fuente retirada que se cuela en el mapa es exactamente el
/// paseo en balde que esto viene a evitar.
struct AddHiddenToFont: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("fonts")
            // `setNull` y no `cascade`: si se borra la fuente buena, la duplicada deja de
            // apuntar a nadie y **vuelve al mapa**, que es mejor que desaparecer las dos.
            .field("duplicate_of", .uuid, .references("fonts", "id", onDelete: .setNull))
            .field("retired_at", .datetime)
            .field("retired_by", .uuid, .references("users", "id", onDelete: .setNull))
            .update()

        guard let sql = database as? SQLDatabase else { return }
        // El mapa filtra por esto en cada consulta. Índice parcial: lo escondido es una
        // minoría diminuta y es lo único que hace falta localizar.
        try await sql.raw(
            "CREATE INDEX IF NOT EXISTS fonts_hidden_idx ON fonts (id) WHERE duplicate_of IS NOT NULL OR retired_at IS NOT NULL"
        ).run()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("fonts")
            .deleteField("duplicate_of")
            .deleteField("retired_at")
            .deleteField("retired_by")
            .update()
    }
}
