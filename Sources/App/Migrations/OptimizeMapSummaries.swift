import Fluent
import SQLKit

/// El mapa busca el último parte de agua para hasta 3.000 fuentes en cada viewport.
/// El índice simple por `font_id` obliga a ordenar todas las reseñas encontradas; éste
/// entrega ya el orden necesario y excluye comentarios que nunca pueden ser un estado.
struct OptimizeMapSummaries: AsyncMigration {
    func prepare(on database: any Database) async throws {
        guard let sql = database as? SQLDatabase else { return }
        try await sql.raw("""
            CREATE INDEX IF NOT EXISTS idx_font_comments_map_summary
            ON font_comments (font_id, created_at DESC)
            WHERE water_status IS NOT NULL
            """).run()
    }

    func revert(on database: any Database) async throws {
        guard let sql = database as? SQLDatabase else { return }
        try await sql.raw("DROP INDEX IF EXISTS idx_font_comments_map_summary").run()
    }
}
