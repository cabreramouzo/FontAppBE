import Fluent
import SQLKit
import Vapor

/// Completa `fonts.admin1` a partir de country/region. Sin `--apply` solo audita.
/// Si hay una sola combinación desconocida no escribe nada, incluso con `--apply`.
///
/// Works on the distinct (country, region) pairs, never on the fountains themselves.
/// It used to load every fountain as a Fluent model: in production that is ~170,000 rows,
/// and on 25/09/2026 the run was OOM-killed on a 512 MB machine and left the web server on
/// the same machine failing its health check for four minutes. There are only a few hundred
/// pairs, and the table maps a pair to a code, so the pairs are all it needs.
struct BackfillAdmin1Command: AsyncCommand {
    struct Signature: CommandSignature {
        @Flag(name: "apply", help: "Escribe los valores. Sin esta opción solo muestra el plan")
        var apply: Bool
    }

    var help: String { "Audita o completa admin1 con una tabla ISO 3166-2 estricta" }

    private struct Pair: Decodable {
        let country: String?
        let region: String
        let n: Int
    }

    func run(using context: CommandContext, signature: Signature) async throws {
        guard let sql = context.application.db as? any SQLDatabase else {
            throw Abort(.internalServerError, reason: "backfill-admin1 necesita una base SQL")
        }
        let pairs = try await sql.raw("""
            SELECT country, region, count(*)::int AS n FROM fonts
            WHERE region IS NOT NULL GROUP BY country, region
            """).all(decoding: Pair.self)

        var known: [(pair: Pair, code: String)] = []
        var unknown: [String: Int] = [:]
        for pair in pairs {
            if let code = Admin1.code(country: pair.country, region: pair.region) {
                known.append((pair, code))
            } else {
                unknown["\(pair.country ?? "(sin país)") / \(pair.region)", default: 0] += pair.n
            }
        }

        let codes = Set(known.map(\.code)).count
        context.console.info("Fuentes clasificables: \(known.reduce(0) { $0 + $1.pair.n }) · admin1: \(codes) · desconocidas: \(unknown.values.reduce(0, +))")
        if !unknown.isEmpty {
            for (name, count) in unknown.sorted(by: { $0.key < $1.key }) {
                context.console.error("  SIN MAPEO \(name): \(count)")
            }
            throw Abort(.unprocessableEntity, reason: "Hay demarcaciones sin mapeo; no se ha escrito nada")
        }
        guard signature.apply else {
            context.console.info("Auditoría correcta. Repite con --apply para escribir.")
            return
        }
        let updates = known.map { (country: $0.pair.country, region: $0.pair.region, code: $0.code) }
        try await context.application.db.transaction { transaction in
            guard let sql = transaction as? any SQLDatabase else { return }
            for (country, region, code) in updates {
                // IS NOT DISTINCT FROM so a pair with a null country still matches itself.
                try await sql.raw("""
                    UPDATE fonts SET admin1 = \(bind: code)
                    WHERE country IS NOT DISTINCT FROM \(bind: country) AND region = \(bind: region)
                      AND admin1 IS DISTINCT FROM \(bind: code)
                    """).run()
            }
        }
        context.console.info("admin1 actualizado correctamente.")
    }
}
