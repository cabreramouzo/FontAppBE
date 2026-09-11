import Fluent
import SQLKit

/// La extensión `unaccent` de PostgreSQL, para que los acentos NO cuenten al buscar:
/// `unaccent('Moià')` = `Moia`, así que "moia" encuentra "Moià" y "sant marti" encuentra
/// "Sant Martí". El buscador la usa en las dos partes: `unaccent(name) ILIKE unaccent(patrón)`.
///
/// Idempotente (`IF NOT EXISTS`). `unaccent` es una extensión **de confianza** (PG13+) y la
/// soporta Neon, así que el rol de la app puede crearla; en CI el rol `vapor` es superusuario.
/// El `guard` solo cubre que la BD sea SQL. Si algún día el rol no tuviera permiso, la
/// migración falla A PROPÓSITO y de forma visible —mejor eso que un `unaccent()` inexistente
/// devolviendo 500 en cada búsqueda—; se arregla creando la extensión una vez a mano.
struct EnableUnaccent: AsyncMigration {
    func prepare(on database: Database) async throws {
        guard let sql = database as? SQLDatabase else { return }
        try await sql.raw("CREATE EXTENSION IF NOT EXISTS unaccent").run()
    }

    func revert(on database: Database) async throws {
        guard let sql = database as? SQLDatabase else { return }
        try await sql.raw("DROP EXTENSION IF EXISTS unaccent").run()
    }
}
