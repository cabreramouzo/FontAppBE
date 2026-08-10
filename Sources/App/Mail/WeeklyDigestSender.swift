import Fluent
import Foundation
import Vapor

/// Cálculo y envío del resumen semanal, compartido por el comando de consola
/// (`send-weekly-digest`, para el cron) y el panel de administración. Así el botón de
/// la web y el cron hacen EXACTAMENTE lo mismo: la vista previa que ve el admin no
/// puede desviarse de lo que se acaba enviando.
enum WeeklyDigestSender {
    /// Evita mandar el resumen dos veces. Dos escenarios reales: doble clic (o dos
    /// pestañas) lanzando envíos a la vez, y volver al panel al rato y pulsar otra vez
    /// sin recordar que ya se envió. En ambos casos el usuario recibiría el correo
    /// duplicado, y eso no se puede deshacer.
    ///
    /// En memoria y por instancia: suficiente para el envío manual desde el panel (una
    /// sola máquina). El cron no pasa por aquí, así que no interfiere.
    actor SendGate {
        static let shared = SendGate()
        private var sending = false
        private var lastSentAt: Date?

        /// Cuánto tiempo se rechaza un segundo envío manual.
        static let cooldown: TimeInterval = 6 * 60 * 60

        func begin() throws {
            if sending {
                throw Abort(.conflict, reason: "Ya se está enviando el resumen ahora mismo")
            }
            if let last = lastSentAt, Date().timeIntervalSince(last) < Self.cooldown {
                let minutes = Int((Self.cooldown - Date().timeIntervalSince(last)) / 60)
                throw Abort(.conflict, reason: "El resumen ya se envió hace poco. Podrás repetirlo en \(minutes) min.")
            }
            sending = true
        }

        func end(sent: Bool) {
            sending = false
            if sent { lastSentAt = Date() }
        }
    }

    /// Una línea del resumen: a quién le tocaría y con cuánto contenido.
    struct Recipient: Content {
        let username: String
        let email: String
        let activityCount: Int
        let nearbyCount: Int
    }

    struct Result: Content {
        /// Usuarios con el resumen activado y correo (antes de mirar si hay novedades).
        let candidates: Int
        /// A quién se le enviaría (o se le ha enviado).
        let recipients: [Recipient]
        /// Cuántos se saltan por no tener novedades esta semana.
        let skipped: Int
        /// Fallos del proveedor de correo (siempre 0 en la vista previa).
        let failed: Int
        /// `false` en la vista previa: no se ha enviado nada.
        let sent: Bool
    }

    /// - Parameters:
    ///   - dryRun: `true` calcula y devuelve el resumen sin enviar nada.
    ///   - username: limita a un usuario (pruebas).
    static func run(dryRun: Bool, days: Int = 7, username: String? = nil,
                    db: any Database, client: any Client, mailSender: any MailSender,
                    logger: Logger) async throws -> Result {
        // Solo el envío real pasa por el cerrojo; la vista previa no manda nada.
        if !dryRun { try await SendGate.shared.begin() }
        defer { if !dryRun { Task { await SendGate.shared.end(sent: true) } } }

        let since = Date().addingTimeInterval(-Double(days) * 86_400)
        let base = Environment.get("WEB_ORIGIN")?.split(separator: ",").first.map(String.init)
            ?? "http://localhost:5174"

        // Solo quien tiene correo, no está anonimizado y no se ha dado de baja.
        var query = User.query(on: db)
            .filter(\.$weeklyDigest == true)
            .filter(\.$email != nil)
            .filter(\.$anonymizedAt == nil)
        if let username {
            query = query.filter(\.$username == username)
        }
        let users = try await query.all()

        var recipients: [Recipient] = []
        var skipped = 0, failed = 0

        for user in users {
            guard let email = user.email, let id = user.id else { continue }
            let digest = try await WeeklyDigest.build(for: user, since: since, on: db)
            // Una semana sin novedades no se envía: un correo vacío solo enseña a ignorarlos.
            guard digest.isWorthSending else {
                skipped += 1
                continue
            }
            let unsubscribe = "\(base)/unsubscribe?u=\(id.uuidString)&t=\(UnsubscribeToken.make(userID: id))"
            let mail = WeeklyDigestEmail.build(
                lang: user.lang, name: user.name, digest: digest,
                weekStart: since, weekEnd: Date(), webOrigin: base, unsubscribeURL: unsubscribe
            )

            if !dryRun {
                do {
                    try await mailSender.send(to: email, subject: mail.subject, html: mail.html, text: mail.text, on: client)
                } catch {
                    // Un fallo con un usuario no puede tumbar el envío del resto.
                    failed += 1
                    logger.warning("Resum setmanal: no s'ha pogut enviar a \(user.username): \(error)")
                    continue
                }
            }
            recipients.append(Recipient(username: user.username, email: email,
                                        activityCount: digest.activity.count, nearbyCount: digest.nearby.count))
        }

        return Result(candidates: users.count, recipients: recipients, skipped: skipped, failed: failed, sent: !dryRun)
    }
}
