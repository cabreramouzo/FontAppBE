import Fluent
import Vapor

/// Avisa por correo a quien has mencionado con `@sunombre`.
///
/// ## Por qué correo y no un aviso dentro de la app
///
/// Porque no hay tal cosa, y montarla —tabla, endpoint, campana, estado de leído— es una
/// funcionalidad entera. Pero sobre todo porque el caso que lo pide es «voy a borrar tu
/// fuente duplicada y perderás las gotas»: eso hay que decírselo a alguien **aunque no
/// vuelva a abrir la app**, que es justo lo que un aviso dentro de la app no consigue.
///
/// ## Lo que se cuida
///
/// - Nunca a ti mismo. Mencionarte en tu propia reseña no es una noticia.
/// - Como mucho `Mentions.maxPerMessage` personas por mensaje: sin tope, un mensaje con
///   cincuenta nombres es un envío masivo gratis desde una cuenta recién creada.
/// - Solo a quien lo tenga encendido y tenga correo (es opcional en esta app).
/// - En **su** idioma (`users.lang`), no en el de quien escribe: el correo no nace de una
///   petición suya. Es la regla que ya siguen la bienvenida y el resumen semanal.
/// - Y no puede romper nada aguas arriba: se lanza **después** de guardar y con todo
///   envuelto en `try?`. Perder un aviso es molesto; perder la reseña por no poder
///   mandarlo sería absurdo.
enum MentionNotifier {

    /// Cuánto del mensaje se cita en el correo. Lo bastante para saber si urge sin
    /// convertir el aviso en una copia del contenido.
    static let excerptLimit = 240

    /// Lanza los avisos en segundo plano. No espera y no lanza.
    static func notify(text: String, by author: User, fontID: UUID, on req: Request) {
        let nombres = Mentions.names(in: text)
        guard !nombres.isEmpty else { return }
        let autorNombre = author.username
        let autorID = author.id
        let app = req.application
        let extracto = recorta(text)

        // `Task.detached`, como `FontController.inheritZone`: no cuelga de la petición, así
        // que la respuesta sale sin esperar al correo y un fallo de red del proveedor no
        // llega nunca al usuario.
        Task.detached {
            try? await enviar(nombres: nombres, autorNombre: autorNombre, autorID: autorID,
                              fontID: fontID, excerpt: extracto, app: app)
        }
    }

    private static func recorta(_ s: String) -> String {
        let limpio = s.trimmingCharacters(in: .whitespacesAndNewlines)
        guard limpio.count > excerptLimit else { return limpio }
        return String(limpio.prefix(excerptLimit)) + "…"
    }

    private static func enviar(nombres: [String], autorNombre: String, autorID: UUID?,
                               fontID: UUID, excerpt: String, app: Application) async throws {
        let db = app.db
        // Insensible a mayúsculas: quien escribe `@Nuria_F` está nombrando a `nuria_f`.
        let bajos = nombres.map { $0.lowercased() }
        let destinatarios = try await User.query(on: db)
            .filter(\.$mentionEmails == true)
            .filter(\.$anonymizedAt == nil)
            .all()
            .filter { bajos.contains($0.username.lowercased()) && $0.id != autorID }

        guard !destinatarios.isEmpty else { return }
        let nombreFuente = try await Font.find(fontID, on: db)?.name ?? "una font"
        let base = Environment.get("WEB_ORIGIN")?.split(separator: ",").first.map(String.init)
            ?? "http://localhost:5173"
        let origen = base.hasSuffix("/") ? String(base.dropLast()) : base

        for u in destinatarios {
            guard let email = u.email, let uid = u.id else { continue }
            let baja = "\(origen)/unsubscribe?u=\(uid)&t=\(UnsubscribeToken.make(userID: uid))&k=mentions"
            let mail = MentionEmail.build(
                lang: u.lang, by: autorNombre, fontName: nombreFuente, excerpt: excerpt,
                fontURL: "\(origen)/fonts/\(fontID)", unsubscribeURL: baja)
            do {
                try await app.mailSender.send(to: email, subject: mail.subject,
                                              html: mail.html, text: mail.text, on: app.client)
            } catch {
                app.logger.error("No s'ha pogut avisar \(u.username) de la menció: \(error)")
            }
        }
    }
}
