import Fluent
import SQLKit

/// Índices en las columnas de clave foránea que se usan como filtro en las rutas
/// calientes. Postgres NO indexa las FKs automáticamente, así que sin esto las
/// consultas (reseñas/incidencias de una fuente, actividad de un usuario) hacen
/// seq scan; con datos crecidos eso son los "un par de segundos" al cargar.
///
/// `font_confirmations` ya está cubierta por su índice único (comment_id, user_id),
/// así que no se añade aquí. Idempotente (IF NOT EXISTS) por si se re-aplica.
struct AddForeignKeyIndexes: AsyncMigration {
    private static let indexes: [(name: String, table: String, column: String)] = [
        ("idx_font_comments_font_id", "font_comments", "font_id"),   // reseñas de una fuente
        ("idx_font_comments_user_id", "font_comments", "user_id"),   // reseñas de un usuario
        ("idx_font_reports_font_id", "font_reports", "font_id"),      // incidencias de una fuente
        ("idx_fonts_created_by", "fonts", "created_by"),             // fuentes creadas por un usuario
    ]

    func prepare(on database: Database) async throws {
        guard let sql = database as? SQLDatabase else { return }
        for idx in Self.indexes {
            try await sql.raw("CREATE INDEX IF NOT EXISTS \(unsafeRaw: idx.name) ON \(unsafeRaw: idx.table) (\(unsafeRaw: idx.column))").run()
        }
    }

    func revert(on database: Database) async throws {
        guard let sql = database as? SQLDatabase else { return }
        for idx in Self.indexes {
            try await sql.raw("DROP INDEX IF EXISTS \(unsafeRaw: idx.name)").run()
        }
    }
}
