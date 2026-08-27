import Fluent
import Foundation
import Vapor

/// Avisa a quien sigue una fuente de que ha cambiado algo en ella.
///
/// ## Por qué NO hay una tabla de suscripciones
///
/// Porque la relación ya existía: `FontFavorite`, el botón de guardar de la ficha y la
/// lista de `/me`. Guardar una fuente y querer saber si se seca son la misma intención
/// dicha dos veces, y separarlas obligaría a la persona a elegir entre dos palabras para
/// lo mismo. GitHub distingue *star* de *watch* porque un repo se mueve cada día; aquí
/// una fuente cambia unas pocas veces al año.
///
/// Si algún día el volumen molesta, la salida no es una tabla nueva sino un interruptor
/// por fuente sobre la que ya hay.
///
/// ## El texto no se escribe aquí
///
/// El aviso guarda un **código** (`review:dry`, `report`, `retired`) y no una frase. Es la
/// misma regla que `StaleGuardedNotifier`: el servidor no sabe en qué idioma lees, así que
/// manda el hecho y el navegador pone las palabras. Con siete idiomas, escribir la frase
/// aquí sería congelar uno.
///
/// ## El push sí, y el correo no
///
/// Desde que hay Web Push, el mismo aviso sale además como notificación del sistema —ver
/// `PushSender`—. Es la diferencia que pedía esto para servir de algo: la campana solo la
/// ve quien ya ha abierto la app, y de una fuente que se seca te tienes que enterar
/// **sin** abrir nada. No cuesta dinero por envío, así que no lleva la regla de
/// `isAround` que sí llevan las menciones por correo.
///
/// ## Y por qué no manda correos todavía
///
/// A propósito: cada envío cuesta dinero y esto puede dispararse muchas veces. La campana
/// no cuesta nada. Cuando haya un servicio más barato, el enganche está señalado abajo con
/// un solo `if` — y lo que hace falta para encenderlo está escrito allí, para no tener que
/// volver a deducirlo.
enum FontWatchNotifier {
    /// Qué ha pasado. Viaja como código al cliente, que es quien lo traduce.
    enum Change: Sendable {
        /// Alguien ha comprobado la fuente. Lleva el estado del agua si lo dijo.
        case review(status: String?)
        /// Alguien ha abierto una incidencia.
        case report
        /// La incidencia se ha cerrado.
        case resolved
        /// La fuente se ha escondido del mapa (duplicada o retirada).
        case hidden(reason: String)

        /// ¿Esto merece una **notificación del sistema**, o basta con la campana?
        ///
        /// El criterio es uno solo: **¿cambia lo que voy a hacer?** Que una fuente que ya
        /// funcionaba siga funcionando no cambia nada —y `flowing` es, con diferencia, la
        /// reseña más común—, así que empujarla al bolsillo de alguien gasta su atención
        /// para nada. Que se haya secado sí: es literalmente el desvío de tres kilómetros
        /// que esta app existe para evitar.
        ///
        /// No es una preferencia de volumen sino de utilidad. Una app se silencia **una
        /// vez** y no se vuelve, así que cada aviso que llega tiene que haber valido la
        /// pena; los demás siguen en la campana, que no molesta a nadie.
        var urgente: Bool {
            switch self {
            case .review(let s):
                // Sin estado no se sabe nada; con agua, no hay nada que decidir.
                return s == "dry" || s == "broken" || s == "gone"
            case .report: return true
            case .resolved: return false   // salvo para quien la abrió: ver `tambienPushA`
            case .hidden: return true      // la fuente desaparece del mapa
            }
        }

        var code: String {
            switch self {
            case .review(let s): return s.map { "review:\($0)" } ?? "review"
            case .report: return "report"
            case .resolved: return "resolved"
            case .hidden(let r): return "hidden:\(r)"
            }
        }
    }

    /// Avisa a quien siga `fontID`, **menos a quien lo ha provocado**.
    ///
    /// No lanza nunca: un aviso que falla no puede tumbar la reseña que lo provocó, que es
    /// lo que la persona venía a hacer. Se llama con `Task.detached` desde los
    /// controladores por el mismo motivo — ver `MentionNotifier`.
    /// `push` es opcional a propósito: sin él esto sigue haciendo lo de siempre. Así los
    /// tests y los comandos de consola no tienen que montar un cliente HTTP para guardar
    /// un aviso en la campana.
    /// `tambienPushA` son personas para las que este cambio **sí** es urgente aunque no
    /// lo sea en general. Hoy solo se usa para «incidencia resuelta»: para el resto es una
    /// buena noticia sin nada que hacer, pero para quien la abrió cierra su propio bucle —
    /// se molestó en avisar y merece saber que sirvió de algo.
    static func notify(fontID: UUID, change: Change, actorID: UUID?, on db: any Database,
                       push: PushEnvio? = nil, tambienPushA: Set<UUID> = []) async {
        do {
            // La fuente, para poder guardar su nombre: el aviso es una foto de lo que pasó
            // y tiene que seguir leyéndose aunque después se renombre o se borre.
            guard let font = try await Font.find(fontID, on: db) else { return }

            var query = FontFavorite.query(on: db).filter(\.$font.$id == fontID)
            if let actorID { query = query.filter(\.$user.$id != actorID) }
            let seguidores = try await query.all()
            guard !seguidores.isEmpty else { return }

            let actorNombre = actorID == nil ? "" :
                (try await User.find(actorID!, on: db))?.username ?? ""

            for s in seguidores {
                let aviso = Notification(userID: s.$user.id, kind: .fontUpdate,
                                         actorID: actorID, actorName: actorNombre,
                                         fontID: fontID, fontName: font.name,
                                         excerpt: change.code)
                try await aviso.save(on: db)
            }

            // Y la notificación del sistema, para quien no tenga la app abierta.
            //
            // Se manda DESPUÉS de guardar la campana y en un bucle aparte: un fallo de red
            // contra el servicio de push no puede dejar a nadie sin su aviso en la bandeja,
            // que es el que no se pierde.
            if let push {
                for s in seguidores {
                    // La campana la recibe todo el mundo; el push, solo cuando de verdad
                    // cambia algo para quien lo recibe.
                    guard change.urgente || tambienPushA.contains(s.$user.id) else { continue }
                    guard let quien = try? await User.find(s.$user.id, on: db) else { continue }
                    let (titulo, cuerpo) = PushCopy.fontUpdate(
                        code: change.code, fontName: font.name, lang: quien.lang)
                    await PushSender.send(
                        .init(title: titulo, body: cuerpo, url: "/fonts/\(fontID)",
                              // Mismo `tag` para la misma fuente: dos avisos de la misma
                              // fuente se sustituyen en vez de apilarse. Volver de una
                              // excursión con nueve notificaciones de la misma font es la
                              // forma más rápida de que te silencien.
                              tag: "font-\(fontID)"),
                        to: s.$user.id, on: db, client: push.client,
                        vapid: push.vapid, logger: push.logger)
                }
            }

            // MARK: - Correo (pendiente, a propósito)
            //
            // Cuando haya un servicio de envío más barato, aquí va el paso de correo. Lo
            // que falta, para no tener que deducirlo otra vez:
            //
            //  1. Una columna `users.watch_emails` (nace a **true**, como `mention_emails`:
            //     un aviso que hay que activar antes no lo activa nadie).
            //  2. La misma regla que las menciones: solo a quien NO ha pasado por aquí
            //     últimamente (`User.isAround`), que es toda la razón de ser de la campana.
            //  3. Una plantilla en `Sources/App/Mail/` y un `?k=watch` en
            //     `UnsubscribeToken`, para poder darse de baja desde el buzón sin sesión.
            //  4. Y un agrupado: cinco reseñas en una tarde son un correo, no cinco. Esto
            //     no hace falta para la campana y sí para el correo.
        } catch {
            // Silencioso a propósito: quien llama ya ha guardado lo suyo.
        }
    }
}
