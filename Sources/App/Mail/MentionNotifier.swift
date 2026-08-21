import Fluent
import Vapor

/// Avisa a quien has mencionado con `@sunombre`: campana siempre, correo solo si hace falta.
///
/// ## Los dos canales, y cuál manda
///
/// **La campana primero** (`Notification`). No cuesta nada, no interrumpe y es donde lo va
/// a ver la mayoría, porque la mayoría de las menciones las lee alguien que ya usa la app.
///
/// **El correo solo para quien no anda por aquí** (`User.isAround`). El caso que dio origen
/// a esto es «voy a borrar tu fuente duplicada y perderás las gotas»: eso hay que decírselo
/// a alguien **aunque no vuelva a abrir la app**, y ahí la campana no llega. Pero mandarle
/// un correo a quien está mirando la pantalla es pagar por molestar, así que se calla.
///
/// ## Lo que se cuida
///
/// - Nunca a ti mismo. Mencionarte en tu propia reseña no es una noticia.
/// - Como mucho `Mentions.maxPerMessage` personas por mensaje: sin tope, un mensaje con
///   cincuenta nombres es un envío masivo gratis desde una cuenta recién creada.
/// - Solo a quien lo tenga encendido y tenga correo (es opcional en esta app).
/// - En **su** idioma (`users.lang`), no en el de quien escribe: el correo no nace de una
///   petición suya. Es la regla que ya siguen la bienvenida y el resumen semanal.
/// - Y no puede romper nada aguas arriba: se lanza **después** de guardar, en una tarea
///   suelta. Perder un aviso es molesto; perder la reseña por no poder mandarlo sería
///   absurdo. Pero lo que falle **se registra**: un aviso perdido en silencio no deja
///   rastro y depurarlo después es adivinar.
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
            do {
                try await enviar(nombres: nombres, autorNombre: autorNombre, autorID: autorID,
                                 fontID: fontID, excerpt: extracto, app: app)
            } catch {
                // Se registra en vez de tragárselo con `try?`. Falle lo que falle aquí, la
                // reseña ya está guardada y el usuario no se entera — pero si esto revienta
                // en silencio, un aviso perdido no deja ni rastro y depurarlo es adivinar.
                app.logger.error("No s'han pogut enviar els avisos de menció: \(error)")
            }
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
        // Sin filtrar por `mentionEmails` aquí: esa preferencia es **del correo**, y
        // colarla en la consulta dejaba sin campana a quien solo había pedido no recibir
        // correos. La campana no interrumpe a nadie y por eso no se apaga.
        let destinatarios = try await User.query(on: db)
            .filter(\.$anonymizedAt == nil)
            .all()
            .filter { bajos.contains($0.username.lowercased()) && $0.id != autorID }

        guard !destinatarios.isEmpty else { return }
        let nombreFuente = try await Font.find(fontID, on: db)?.name
        let base = Environment.get("WEB_ORIGIN")?.split(separator: ",").first.map(String.init)
            ?? "http://localhost:5173"
        let origen = base.hasSuffix("/") ? String(base.dropLast()) : base

        // La campana primero y siempre: no cuesta nada, no molesta y es donde lo va a ver
        // la mayoría. El correo queda para quien no anda por aquí.
        for u in destinatarios {
            guard let uid = u.id else { continue }
            let aviso = Notification(userID: uid, kind: .mention, actorID: autorID,
                                     actorName: autorNombre, fontID: fontID,
                                     fontName: nombreFuente, excerpt: excerpt)
            try? await aviso.save(on: db)
        }

        for u in destinatarios {
            guard u.mentionEmails, let email = u.email, let uid = u.id else { continue }
            // Quien ha pasado por la app hace poco ya tiene el aviso en la campana; el
            // correo solo repetiría lo mismo, y cada uno cuesta dinero. Es toda la razón
            // de ser de la campana, así que la regla vive aquí y en un solo sitio.
            if u.isAround { continue }
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
