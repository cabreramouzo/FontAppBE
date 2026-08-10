import Fluent
import Foundation
import Vapor

/// Envía el resumen semanal de actividad. Pensado para un cron semanal
/// (`swift run App send-weekly-digest`); ver DEPLOY.md. La lógica vive en
/// `WeeklyDigestSender`, compartida con el botón del panel de administración.
///
/// Es un comando y no una tarea periódica dentro del servidor a propósito: con varias
/// instancias, un temporizador en proceso mandaría el correo tantas veces como
/// instancias haya. Un cron externo lo dispara una sola vez.
struct WeeklyDigestCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Flag(name: "dry-run", help: "Calcula y muestra a quién se enviaría, sin enviar nada.")
        var dryRun: Bool

        @Option(name: "user", help: "Solo para este username (pruebas).")
        var user: String?

        @Option(name: "days", help: "Ventana en días (por defecto 7).")
        var days: Int?
    }

    let help = "Envía el resumen semanal de actividad a los usuarios que lo tengan activado."

    func run(using context: CommandContext, signature: Signature) async throws {
        let app = context.application
        let result = try await WeeklyDigestSender.run(
            dryRun: signature.dryRun,
            days: signature.days ?? 7,
            username: signature.user,
            db: app.db, client: app.client, mailSender: app.mailSender, logger: app.logger
        )

        context.console.info("Candidatos: \(result.candidates)")
        for r in result.recipients {
            context.console.print("• \(r.username) <\(r.email)> — \(r.activityCount) novedades en sus fuentes, \(r.nearbyCount) fuentes nuevas cerca")
        }
        let verb = signature.dryRun ? "se enviarían" : "enviados"
        context.console.info("Resumen semanal: \(verb) \(result.recipients.count) · sin novedades \(result.skipped) · fallidos \(result.failed)")
    }
}
