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
/// manda el hecho y el navegador pone las palabras. Con seis idiomas, escribir la frase
/// aquí sería congelar uno.
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
    static func notify(fontID: UUID, change: Change, actorID: UUID?, on db: any Database) async {
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
