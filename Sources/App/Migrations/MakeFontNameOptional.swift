import Fluent
import SQLKit

/// `fonts.name` pasa a admitir nulos: «no tiene nombre» es un dato, no un hueco a rellenar.
///
/// Antes, un punto importado sin `name` en OSM —tres de cada cuatro— se guardaba con un
/// relleno en el idioma del territorio: «Font», «Fuente», «Fontaine», «Vattenpost». El
/// razonamiento era que el dato debía estar en el idioma de donde sale, y **confunde el
/// idioma del territorio con el de quien lee**. Medido sobre producción, el 47 % del mapa
/// mostraba una palabra que el lector podía no entender.
///
/// Esta migración **solo toca el esquema**. Vaciar los rellenos que ya están escritos es
/// una pasada aparte (`clear-placeholder-names`), por la misma razón que
/// `adopt-cover-photos`: una migración se ejecuta sola al desplegar y no se puede ensayar,
/// y esto reescribe decenas de miles de filas de producción. Un comando con `--dry-run` se
/// mira antes de lanzarlo.
///
/// El revert vuelve a poner `NOT NULL`, y para eso necesita que no quede ningún nulo: lo
/// rellena con «Font», que es lo que había por defecto. No recupera el idioma original —no
/// puede— pero deja la columna en un estado válido, que es lo que un revert tiene que
/// garantizar.
struct MakeFontNameOptional: AsyncMigration {
    func prepare(on database: any Database) async throws {
        guard let sql = database as? SQLDatabase else { return }
        try await sql.raw("ALTER TABLE fonts ALTER COLUMN name DROP NOT NULL").run()
        // La campana guarda **una copia** del nombre, no una referencia, porque un aviso
        // es la foto de lo que pasó. Esa copia hereda el problema: si la fuente no tiene
        // nombre, no hay nada que copiar. Va en la misma migración porque es la misma
        // decisión, y separarlas dejaría un despliegue intermedio donde el avisador no
        // puede escribir.
        try await sql.raw("ALTER TABLE notifications ALTER COLUMN font_name DROP NOT NULL").run()
    }

    func revert(on database: any Database) async throws {
        guard let sql = database as? SQLDatabase else { return }
        try await sql.raw("UPDATE fonts SET name = 'Font' WHERE name IS NULL").run()
        try await sql.raw("ALTER TABLE fonts ALTER COLUMN name SET NOT NULL").run()
        try await sql.raw("UPDATE notifications SET font_name = 'Font' WHERE font_name IS NULL").run()
        try await sql.raw("ALTER TABLE notifications ALTER COLUMN font_name SET NOT NULL").run()
    }
}
