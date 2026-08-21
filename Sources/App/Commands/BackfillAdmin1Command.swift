import Fluent
import SQLKit
import Vapor

/// Completa `fonts.admin1` a partir de country/region. Sin `--apply` solo audita.
/// Si hay una sola combinación desconocida no escribe nada, incluso con `--apply`.
struct BackfillAdmin1Command: AsyncCommand {
    struct Signature: CommandSignature {
        @Flag(name: "apply", help: "Escribe los valores. Sin esta opción solo muestra el plan")
        var apply: Bool
    }

    var help: String { "Audita o completa admin1 con una tabla ISO 3166-2 estricta" }

    func run(using context: CommandContext, signature: Signature) async throws {
        let db = context.application.db
        let fonts = try await Font.query(on: db).filter(\.$region != nil).all()
        var groups: [String: [UUID]] = [:]
        var unknown: [String: Int] = [:]
        for font in fonts {
            guard let id = font.id else { continue }
            guard let code = Admin1.code(country: font.country, region: font.region) else {
                unknown["\(font.country ?? "(sin país)") / \(font.region ?? "(sin región)")", default: 0] += 1
                continue
            }
            groups[code, default: []].append(id)
        }

        context.console.info("Fuentes clasificables: \(groups.values.reduce(0) { $0 + $1.count }) · admin1: \(groups.count) · desconocidas: \(unknown.values.reduce(0, +))")
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

        if db is any SQLDatabase {
            let updateGroups = groups
            try await db.transaction { transaction in
                guard let sql = transaction as? any SQLDatabase else { return }
                for (code, ids) in updateGroups {
                    try await sql.raw("UPDATE fonts SET admin1 = \(bind: code) WHERE id = ANY(\(bind: ids))").run()
                }
            }
        } else {
            for font in fonts {
                font.admin1 = Admin1.code(country: font.country, region: font.region)
                try await font.save(on: db)
            }
        }
        context.console.info("admin1 actualizado correctamente.")
    }
}
