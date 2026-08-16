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
    }

    let help = "Registra las aportaciones nuevas y liquida las que llevan 72 h sin incidencias."

    func run(using context: CommandContext, signature: Signature) async throws {
        let db = context.application.db
        let console = context.console

        let r = try await ContributionLedger.sync(on: db, dryRun: signature.dryRun)

        let verbo = signature.dryRun ? "se registrarían" : "registradas"
        console.info("\nAportaciones \(verbo): \(r.inserted)  ·  ya conocidas: \(r.alreadyKnown)")
        console.print("Liquidadas: \(r.settled)  ·  anuladas: \(r.voided) (de ellas \(r.overCap) por techo diario)")
        for (razon, n) in r.voidReasons.sorted(by: { $0.value > $1.value }) where n > 0 {
            console.print("  anuladas por \(razon): \(n)")
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
            console.info("\n\(username): \(t.settled) gotas · nivel \(t.level)")
            if t.pending > 0 {
                console.print("  \(t.pending) gotas en camino (liquidan a las 72 h de cada aportación)")
            }
        }

        if signature.dryRun {
            console.warning("\nDry-run: no se ha escrito nada.")
        }
    }
}
