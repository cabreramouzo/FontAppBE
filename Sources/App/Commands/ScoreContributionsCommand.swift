import Fluent
import Foundation
import Vapor

/// Fase 1 de la gamificación: puntúa el historial y lo enseña, **sin escribir nada**.
///
/// Sirve para responder la pregunta que decide todo lo demás — ¿cuánta gente tendría algo
/// el día 1, y con qué baremo? — antes de crear ninguna tabla. El diseño está en
/// `docs/gamificacion.md`; la lógica, en `ContributionScore`.
///
/// ```
/// swift run App score-contributions                 # tabla de todos
/// swift run App score-contributions --user miguel   # desglose de una persona
/// swift run App score-contributions --detail        # cada aportación
/// swift run App score-contributions --json          # a una hoja de cálculo
/// ```
struct ScoreContributionsCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Option(name: "user", help: "Desglose de un solo usuario (username).")
        var user: String?

        @Flag(name: "detail", help: "Lista cada aportación, línea a línea.")
        var detail: Bool

        @Flag(name: "json", help: "Salida en JSON en vez de tabla.")
        var json: Bool

        @Option(name: "top", help: "Cuántos usuarios mostrar en la tabla (por defecto 25).")
        var top: Int?
    }

    let help = "Calcula puntos e insignias sobre el historial existente. Solo lectura: no modifica nada."

    func run(using context: CommandContext, signature: Signature) async throws {
        let console = context.console
        let informe = try await ContributionScore.compute(on: context.application.db)

        if signature.json {
            console.output(try jsonOutput(informe).consoleText())
            return
        }

        if let username = signature.user {
            try imprimeUsuario(username, informe, console: console)
            return
        }

        // --- Tabla general -------------------------------------------------
        console.info("\nGotas por usuario — \(informe.users.count) personas con alguna aportación\n")
        console.print(fila("#", "usuario", "gotas", "nivel", "insignias"))
        console.print(String(repeating: "─", count: 74))
        for (i, u) in informe.users.prefix(signature.top ?? 25).enumerated() {
            let insignias = u.badges.isEmpty
                ? "—"
                : u.badges.map { "\($0.family) (\($0.tier))" }.joined(separator: ", ")
            console.print(fila("\(i + 1)", u.username, "\(u.gotes)", u.level.name, insignias))
        }

        imprimeCalibrado(informe, console: console)

        if signature.detail {
            console.info("\nAportaciones, de la más reciente a la más antigua\n")
            let nombres = Dictionary(uniqueKeysWithValues: informe.users.map { ($0.userID, $0.username) })
            for c in informe.contributions {
                let mult = c.multiplier == 1.0 ? "" : String(format: " ×%.2f", c.multiplier)
                let nota = c.note.isEmpty ? "" : "  (\(c.note))"
                console.print("\(fecha(c.at))  \((nombres[c.userID] ?? "?").padding(toLength: 14, withPad: " ", startingAt: 0))"
                    + "\(c.kind.label.padding(toLength: 18, withPad: " ", startingAt: 0))"
                    + "\(String(c.gotes).leftPad(4)) gotas\(mult)  \(c.fontName)\(nota)")
            }
        }

        imprimeAvisos(informe, console: console)
    }

    // MARK: - Salidas

    private func imprimeUsuario(_ username: String, _ informe: ContributionScore.Report,
                                console: any Console) throws {
        guard let u = informe.users.first(where: { $0.username == username }) else {
            console.warning("«\(username)» no tiene ninguna aportación puntuable (o no existe).")
            return
        }
        console.info("\n\(u.username) — \(u.gotes) gotas · nivel \(u.level.name)\n")

        console.print("Por tipo de aportación:")
        for kind in ContributionScore.Kind.allCases {
            guard let d = u.byKind[kind], d.count > 0 else { continue }
            console.print("  \(kind.label.padding(toLength: 20, withPad: " ", startingAt: 0))"
                + "\(String(d.count).leftPad(4)) ×   \(String(d.gotes).leftPad(6)) gotas")
        }

        console.print("\nInsignias:")
        if u.badges.isEmpty {
            console.print("  ninguna todavía")
        } else {
            for b in u.badges {
                console.print("  \(b.family) — \(b.tier)  (\(b.progress) / \(b.threshold) para el siguiente)")
            }
        }

        let zonas = u.regions.sorted().joined(separator: ", ")
        console.print("\nZonas con aportaciones: \(zonas.isEmpty ? "— (las fuentes tocadas no tienen región)" : zonas)")

        let mias = informe.contributions.filter { $0.userID == u.userID }
        console.print("\nSus 15 aportaciones mejor pagadas:")
        for c in mias.sorted(by: { $0.gotes > $1.gotes }).prefix(15) {
            let mult = c.multiplier == 1.0 ? "" : String(format: " ×%.2f", c.multiplier)
            let nota = c.note.isEmpty ? "" : "  (\(c.note))"
            console.print("  \(fecha(c.at))  \(String(c.gotes).leftPad(4)) gotas\(mult)  "
                + "\(c.kind.label) · \(c.fontName)\(nota)")
        }
        imprimeAvisos(informe, console: console)
    }

    /// Lo que de verdad se viene a mirar: si el baremo reparte de forma razonable o si hay
    /// que mover constantes antes de crear ninguna tabla.
    private func imprimeCalibrado(_ informe: ContributionScore.Report, console: any Console) {
        let total = informe.contributions.reduce(0) { $0 + $1.gotes }
        console.info("\nCalibrado\n")
        console.print("  aportaciones puntuables   \(informe.contributions.count)")
        console.print("  gotas repartidas          \(total)")
        if let mejor = informe.users.first {
            console.print("  quien más tiene           \(mejor.username), \(mejor.gotes) gotas")
        }
        if !informe.users.isEmpty {
            let mediana = informe.users[informe.users.count / 2].gotes
            console.print("  mediana                   \(mediana) gotas")
            let concentracion = Double(informe.users.first?.gotes ?? 0) / Double(max(total, 1)) * 100
            console.print(String(format: "  se lleva el primero       %.0f %% del total", concentracion))
        }

        console.print("\n  reparto por nivel:")
        for nivel in ContributionScore.levels.reversed() {
            let n = informe.users.filter { $0.level.key == nivel.key }.count
            console.print("    \(nivel.name.padding(toLength: 12, withPad: " ", startingAt: 0))\(String(n).leftPad(4))")
        }

        console.print("\n  a cuánta gente le tocaría cada insignia:")
        var cuenta: [String: Int] = [:]
        for u in informe.users { for b in u.badges { cuenta[b.family, default: 0] += 1 } }
        if cuenta.isEmpty {
            console.print("    a nadie — los umbrales están altos para los datos que hay")
        } else {
            for (familia, n) in cuenta.sorted(by: { $0.value > $1.value }) {
                console.print("    \(familia.padding(toLength: 16, withPad: " ", startingAt: 0))\(String(n).leftPad(4))")
            }
        }

        // Con qué frecuencia salta cada multiplicador. Es la lectura más accionable de
        // todo el informe: uno que se aplica a casi todo no está premiando una excepción,
        // está subiendo el baremo base por la puerta de atrás.
        let conMultiplicador = informe.contributions.filter { $0.multiplier != 1.0 }.count
        if conMultiplicador > 0 {
            console.print("\n  con qué frecuencia salta cada multiplicador:")
            var veces: [String: Int] = [:]
            for c in informe.contributions { for r in c.reasons { veces[r, default: 0] += 1 } }
            let n = max(informe.contributions.count, 1)
            for (razon, k) in veces.sorted(by: { $0.value > $1.value }) {
                let pct = Double(k) / Double(n) * 100
                let aviso = pct >= 60 ? "   ← salta casi siempre; revisar el umbral" : ""
                console.print(String(format: "    %@%@ de %d  (%.0f %%)%@",
                                     razon.padding(toLength: 12, withPad: " ", startingAt: 0),
                                     String(k).leftPad(5), n, pct, aviso))
            }
        }

        console.print("\n  gotas por tipo de aportación:")
        var porTipo: [ContributionScore.Kind: (Int, Int)] = [:]
        for c in informe.contributions {
            let p = porTipo[c.kind] ?? (0, 0)
            porTipo[c.kind] = (p.0 + 1, p.1 + c.gotes)
        }
        for kind in ContributionScore.Kind.allCases {
            guard let d = porTipo[kind] else { continue }
            let pct = Double(d.1) / Double(max(total, 1)) * 100
            console.print(String(format: "    %@%@ ×  %@ gotas  (%.0f %%)",
                                 kind.label.padding(toLength: 18, withPad: " ", startingAt: 0),
                                 String(d.0).leftPad(5), String(d.1).leftPad(7), pct))
        }
    }

    private func imprimeAvisos(_ informe: ContributionScore.Report, console: any Console) {
        guard !informe.caveats.isEmpty else { return }
        console.warning("\nLo que estas cifras NO saben:")
        for c in informe.caveats { console.print("  · \(c)") }
        console.print("\nSon para calibrar, no para publicar. La fase 2 registra el evento cuando ocurre y")
        console.print("resuelve todo lo anterior.\n")
    }

    // MARK: - Utilidades

    private func fila(_ a: String, _ b: String, _ c: String, _ d: String, _ e: String) -> String {
        a.leftPad(3) + "  " + b.padding(toLength: 16, withPad: " ", startingAt: 0)
            + c.leftPad(7) + "  " + d.padding(toLength: 10, withPad: " ", startingAt: 0) + e
    }

    private func fecha(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: d)
    }

    private func jsonOutput(_ informe: ContributionScore.Report) throws -> String {
        struct Salida: Content {
            struct U: Content {
                let username: String, gotes: Int, level: String
                let badges: [String], regions: [String]
                let byKind: [String: Int]
            }
            let users: [U]
            let caveats: [String]
        }
        let salida = Salida(
            users: informe.users.map { u in
                Salida.U(username: u.username, gotes: u.gotes, level: u.level.key,
                         badges: u.badges.map { "\($0.family):\($0.tier)" },
                         regions: u.regions.sorted(),
                         byKind: Dictionary(uniqueKeysWithValues: u.byKind.map { ($0.key.rawValue, $0.value.gotes) }))
            },
            caveats: informe.caveats)
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        return String(decoding: try enc.encode(salida), as: UTF8.self)
    }
}

private extension String {
    /// Alinea números a la derecha para que las columnas cuadren en el terminal.
    func leftPad(_ n: Int) -> String {
        count >= n ? self : String(repeating: " ", count: n - count) + self
    }
}
