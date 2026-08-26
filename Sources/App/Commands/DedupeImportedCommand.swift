import Fluent
import SQLKit
import Vapor

/// Borra fuentes **importadas** que son un duplicado exacto de otra más antigua.
///
/// ## Por qué existe
///
/// `import-fonts` no deduplica: lo único que tiene es `--replace`, que borra la base
/// entera. Eso está bien mientras cada lote se importe una sola vez, y basta un resbalón
/// para que no sea así — pasó con Italia: la subida del fichero falló («remote file already
/// exists»), el comando se ejecutó igual sobre el fichero anterior, y 8.728 fuentes
/// entraron por segunda vez. El error de la subida no detuvo la importación porque son dos
/// órdenes distintas.
///
/// ## Qué borra, y todo lo que NO borra
///
/// Solo filas que cumplen **las cuatro** condiciones:
///
/// - **Sin creador** (`created_by IS NULL`): son importadas. Una fuente que puso una
///   persona no se toca aunque coincida con otra.
/// - **Coordenadas idénticas** a las de otra fuente más antigua. No es un radio: dos
///   fuentes a 3 m son dos fuentes, y decidir eso es del `--dedupe` del importador, no de
///   aquí. Idéntico hasta el último decimal solo pasa si es la misma fila importada dos
///   veces.
/// - **Se queda la más antigua** (`created_at`, y el `id` como desempate para que el
///   resultado no dependa del orden en que Postgres devuelva las filas).
/// - **Sin nada colgando**: ni reseñas, ni incidencias, ni fotos, ni favoritos, ni
///   ediciones, ni denuncias. Si alguien ya ha aportado algo sobre una de las copias, esa
///   copia deja de ser un duplicado inerte y pasa a ser trabajo de una persona. Se queda,
///   y se dice.
struct DedupeImportedCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Flag(name: "dry-run", help: "Cuenta lo que borraría y no borra nada")
        var dryRun: Bool
        init() {}
    }

    var help: String { "Borra fuentes importadas que son duplicado exacto de otra más antigua" }

    /// Las copias sobrantes: mismas coordenadas, sin creador, y no la más antigua.
    ///
    /// `row_number()` sobre la partición de coordenadas es lo que elige a la superviviente
    /// sin traerse nada a memoria.
    private static let sobrantes = """
        SELECT id FROM (
          SELECT id, row_number() OVER (
            PARTITION BY latitude, longitude
            ORDER BY created_at ASC, id ASC
          ) AS n
          FROM fonts
          WHERE created_by IS NULL
        ) t WHERE t.n > 1
        """

    /// De las sobrantes, las que además no tienen NADA de nadie colgando.
    private static func borrables(_ sql: any SQLDatabase) -> SQLQueryString {
        """
        \(unsafeRaw: sobrantes)
        AND id NOT IN (SELECT font_id FROM font_comments)
        AND id NOT IN (SELECT font_id FROM font_reports)
        AND id NOT IN (SELECT font_id FROM font_favorites)
        AND id NOT IN (SELECT font_id FROM font_edits)
        AND id NOT IN (SELECT font_id FROM font_photos)
        """
    }

    func run(using context: CommandContext, signature: Signature) async throws {
        guard let sql = context.application.db as? any SQLDatabase else {
            context.console.error("Hace falta una base de datos SQL.")
            return
        }
        struct Cuenta: Decodable { let n: Int }

        let total = try await sql.raw("SELECT count(*)::int AS n FROM (\(unsafeRaw: Self.sobrantes)) x")
            .first(decoding: Cuenta.self)?.n ?? 0
        let limpias = try await sql.raw("SELECT count(*)::int AS n FROM (\(Self.borrables(sql))) x")
            .first(decoding: Cuenta.self)?.n ?? 0

        context.console.info("Duplicados exactos de fuentes importadas: \(total)")
        context.console.info("  borrables (sin reseñas, fotos ni nada de nadie): \(limpias)")
        if total > limpias {
            context.console.warning("  se quedan \(total - limpias): alguien ya aportó algo sobre esa copia")
        }
        guard limpias > 0 else { return }

        if signature.dryRun {
            context.console.warning("Ensayo en seco: no se ha borrado nada.")
            return
        }
        try await sql.raw("DELETE FROM fonts WHERE id IN (\(Self.borrables(sql)))").run()
        context.console.info("Borradas \(limpias).")
    }
}
