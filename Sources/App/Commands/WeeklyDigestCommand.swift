import Fluent
import Foundation
import Vapor

/// Envía el resumen semanal de actividad. Pensado para un cron semanal
/// (`swift run App send-weekly-digest`); ver DEPLOY.md.
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
        let days = signature.days ?? 7
        let since = Date().addingTimeInterval(-Double(days) * 86_400)
        let base = Environment.get("WEB_ORIGIN")?.split(separator: ",").first.map(String.init)
            ?? "http://localhost:5174"

        // Solo quien tiene correo, no está anonimizado y no se ha dado de baja.
        var query = User.query(on: app.db)
            .filter(\.$weeklyDigest == true)
            .filter(\.$email != nil)
            .filter(\.$anonymizedAt == nil)
        if let username = signature.user {
            query = query.filter(\.$username == username)
        }
        let users = try await query.all()

        context.console.info("Candidatos: \(users.count) (ventana: \(days) días)")
        var sent = 0, skipped = 0, failed = 0

        for user in users {
            guard let email = user.email else { continue }
            let digest = try await WeeklyDigest.build(for: user, since: since, on: app.db)
            // Una semana sin novedades no se envía: un correo vacío solo enseña a ignorarlos.
            guard digest.isWorthSending else {
                skipped += 1
                continue
            }
            let unsubscribe = unsubscribeURL(base: base, user: user)
            let mail = WeeklyDigestEmail.build(
                lang: user.lang, name: user.name, digest: digest,
                weekStart: since, weekEnd: Date(), webOrigin: base, unsubscribeURL: unsubscribe
            )

            if signature.dryRun {
                context.console.print("• \(user.username) <\(email)> — \(digest.activity.count) novedades en sus fuentes, \(digest.nearby.count) fuentes nuevas cerca")
                sent += 1
                continue
            }
            do {
                try await app.mailSender.send(to: email, subject: mail.subject, html: mail.html, text: mail.text, on: app.client)
                sent += 1
            } catch {
                // Un fallo con un usuario no puede tumbar el envío del resto.
                failed += 1
                context.console.warning("No se pudo enviar a \(user.username): \(error)")
            }
        }

        let verb = signature.dryRun ? "se enviarían" : "enviados"
        context.console.info("Resumen semanal: \(verb) \(sent) · sin novedades \(skipped) · fallidos \(failed)")
    }

    private func unsubscribeURL(base: String, user: User) -> String {
        guard let id = user.id else { return base }
        let token = UnsubscribeToken.make(userID: id)
        return "\(base)/unsubscribe?u=\(id.uuidString)&t=\(token)"
    }
}
