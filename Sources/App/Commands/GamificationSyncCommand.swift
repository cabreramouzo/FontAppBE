import Fluent
import Foundation
import Vapor

/// Fase 2: pone al día el registro de aportaciones y liquida lo que ha cumplido las 72
/// horas. Pensado para un cron frecuente (cada 15 min o cada hora; ver DEPLOY.md).
///
/// ```
/// swift run App gamification-sync              # sincroniza y liquida
/// swift run App gamification-sync --dry-run    # dice qué haría, sin tocar nada
/// swift run App gamification-sync --user marc  # además, el marcador de una persona
/// ```
///
/// Es un comando y no un temporizador dentro del servidor por lo mismo que el resumen
/// semanal: con varias instancias, un temporizador en proceso lo ejecutaría tantas veces
/// como instancias haya. Aquí las escrituras son idempotentes, así que no rompería nada,
/// pero sería trabajo repetido contra la base de datos cada pocos minutos.
struct GamificationSyncCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Flag(name: "dry-run", help: "Calcula y muestra qué cambiaría, sin escribir nada.")
        var dryRun: Bool

        @Option(name: "user", help: "Enseña también el marcador de este username.")
        var user: String?

        @Flag(name: "rescore", help: "Recalcula el histórico provisional con el baremo de hoy. Destructivo.")
        var rescore: Bool

        @Flag(name: "yes", help: "No preguntar (para --rescore).")
        var yes: Bool
    }

    let help = "Registra las aportaciones nuevas y liquida las que llevan 72 h sin incidencias."

    func run(using context: CommandContext, signature: Signature) async throws {
        let db = context.application.db
        let console = context.console

        // Estado del baremo: es lo primero que hay que saber antes de mirar ninguna cifra.
        if let linea = ContributionLedger.epoch {
            let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: "UTC")
            console.print("Puntos definitivos desde el \(f.string(from: linea)). Lo anterior sigue siendo provisional.")
        } else {
            console.print("GAMIFICATION_EPOCH sin definir: TODOS los puntos son provisionales y se pueden recalcular.")
        }

        if signature.rescore {
            try await recalcula(db: db, console: console, sinPreguntar: signature.yes)
            return
        }

        let r = try await ContributionLedger.sync(on: db, dryRun: signature.dryRun)

        let verbo = signature.dryRun ? "se registrarían" : "registradas"
        console.info("\nAportaciones \(verbo): \(r.inserted)  ·  ya conocidas: \(r.alreadyKnown)")
        console.print("Liquidadas: \(r.settled)  ·  anuladas: \(r.voided) (de ellas \(r.overCap) por techo diario)")
        for (razon, n) in r.voidReasons.sorted(by: { $0.value > $1.value }) where n > 0 {
            console.print("  anuladas por \(razon): \(n)")
        }

        if !r.awarded.isEmpty {
            console.info("\nInsignias especiales \(signature.dryRun ? "que se concederían" : "concedidas"):")
            for (clave, n) in r.awarded.sorted(by: { $0.key < $1.key }) where n > 0 {
                let nombre = SpecialBadges.find(clave)?.name ?? clave
                console.print("  \(nombre): \(n)")
            }
        }
        // El cupo importa mientras queda; cuando se agota, deja de ser una noticia.
        for (clave, quedan) in try await SpecialBadges.remaining(on: db).sorted(by: { $0.key < $1.key }) {
            let nombre = SpecialBadges.find(clave)?.name ?? clave
            let total = SpecialBadges.find(clave)?.limit ?? 0
            console.print(quedan > 0
                ? "  \(nombre): quedan \(quedan) de \(total) plazas"
                : "  \(nombre): plazas agotadas")
        }

        if !signature.dryRun {
            let pendientes = try await ContributionEvent.query(on: db).filter(\.$status == .pending).count()
            let liquidadas = try await ContributionEvent.query(on: db).filter(\.$status == .settled).count()
            let anuladas = try await ContributionEvent.query(on: db).filter(\.$status == .void).count()
            console.print("\nEn el registro: \(liquidadas) liquidadas · \(pendientes) pendientes · \(anuladas) anuladas")
        }

        if let username = signature.user {
            guard let u = try await User.query(on: db).filter(\.$username == username).first(),
                  let uid = u.id else {
                console.warning("No existe ningún usuario «\(username)».")
                return
            }
            let t = try await ContributionLedger.totals(for: uid, on: db)
            console.info("\n\(username): \(t.settled) gotas · nivel \(t.level.name)")
            if t.pending > 0 {
                console.print("  \(t.pending) gotas en camino (liquidan a las 72 h de cada aportación)")
            }
        }

        if signature.dryRun {
            console.warning("\nDry-run: no se ha escrito nada.")
        }
    }

    /// Reconstruye lo provisional con el baremo de hoy. Borra filas, así que pregunta.
    private func recalcula(db: any Database, console: any Console, sinPreguntar: Bool) async throws {
        let provisionales: Int
        if let linea = ContributionLedger.epoch {
            provisionales = try await ContributionEvent.query(on: db).filter(\.$occurredAt < linea).count()
            let protegidas = try await ContributionEvent.query(on: db).filter(\.$occurredAt >= linea).count()
            console.warning("\nSe van a borrar y recalcular \(provisionales) aportaciones provisionales.")
            console.print("\(protegidas) posteriores a la fecha de corte NO se tocan.")
        } else {
            provisionales = try await ContributionEvent.query(on: db).count()
            console.warning("\nSe van a borrar y recalcular las \(provisionales) aportaciones del registro.")
            console.print("No hay fecha de corte, así que no queda ninguna protegida.")
        }
        guard provisionales > 0 else {
            console.print("No hay nada provisional que recalcular.")
            return
        }
        if !sinPreguntar && !console.confirm("¿Continuar?") {
            console.print("Cancelado.")
            return
        }

        let r = try await ContributionLedger.rescore(on: db)
        console.info("\nBorradas \(r.deleted) · protegidas \(r.protected) · recalculadas \(r.rebuilt)")
        if r.deleted != r.rebuilt {
            console.warning("Las cifras no cuadran: \(r.deleted) borradas frente a \(r.rebuilt) recalculadas.")
            console.print("Es esperado si además cambió el contenido (reseñas borradas, ediciones revertidas).")
        }
    }
}
