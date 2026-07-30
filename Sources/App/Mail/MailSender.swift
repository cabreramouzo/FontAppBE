import Vapor

/// Envío de correo. Desacopla el "cómo" (log en dev, proveedor en prod) del resto del
/// código, igual que `ImageStorage` con las imágenes. Recibe el `Client` de Vapor para
/// no guardar estado de red en el propio sender.
protocol MailSender: Sendable {
    func send(to: String, subject: String, html: String, on client: any Client) async throws
}

/// Dev / sin proveedor configurado: no envía nada, solo registra el correo en el log.
struct LogMailSender: MailSender {
    let logger: Logger

    func send(to: String, subject: String, html: String, on client: any Client) async throws {
        logger.info("[mail:dev] to=\(to) subject=\(subject)\n\(html)")
    }
}

/// Producción: envía por la API HTTP de Resend (https://resend.com).
/// Requiere `RESEND_API_KEY` y `MAIL_FROM` (p. ej. "FontApp <no-reply@tudominio>").
struct ResendMailSender: MailSender {
    let apiKey: String
    let from: String

    private struct Payload: Content {
        let from: String
        let to: [String]
        let subject: String
        let html: String
    }

    func send(to: String, subject: String, html: String, on client: any Client) async throws {
        var headers = HTTPHeaders()
        headers.add(name: .authorization, value: "Bearer \(apiKey)")
        let res = try await client.post("https://api.resend.com/emails", headers: headers) { req in
            try req.content.encode(Payload(from: from, to: [to], subject: subject, html: html))
        }
        guard (200..<300).contains(Int(res.status.code)) else {
            throw Abort(.internalServerError, reason: "No se pudo enviar el correo (Resend \(res.status.code))")
        }
    }
}

private struct MailSenderKey: StorageKey {
    typealias Value = any MailSender
}

extension Application {
    var mailSender: any MailSender {
        get { storage[MailSenderKey.self] ?? LogMailSender(logger: logger) }
        set { storage[MailSenderKey.self] = newValue }
    }
}

extension Request {
    var mailSender: any MailSender { application.mailSender }
}
