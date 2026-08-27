import Fluent
import Foundation
import Vapor

/// Avisa a alguien de que se le ha ampliado el cupo de fuentes.
///
/// ## Por qué hacía falta
///
/// La excepción se concedía y **el interesado no se enteraba de nada**. Es el peor caso
/// posible de los tres: pidió permiso, se le dio, y desde su lado no cambió nada visible —
/// así que o lo vuelve a pedir, o deja de intentarlo pensando que le han dicho que no. Lo
/// que hace útil este aviso no es la cortesía, es que **le dice que ya puede seguir**.
///
/// ## La fecha viaja en ISO, no como frase
///
/// El `excerpt` lleva el instante límite y las palabras las pone el navegador. No es solo
/// la regla de la casa: aquí es que **el servidor no sabe qué hora es para ti**. Los datos
/// van de Chile a Italia, seis husos de diferencia, y «hasta las 22:00» sería falso para
/// casi todo el mundo. El navegador sí lo sabe.
enum SourceLimitNotifier {
    /// No lanza nunca: quien llama ya ha concedido el permiso, y quedarse sin avisar es
    /// malo pero mucho menos que deshacer la concesión.
    static func granted(userID: UUID, until: Date, on db: any Database,
                        push: PushEnvio? = nil) async {
        do {
            let aviso = Notification(userID: userID, kind: .sourceLimit,
                                     actorID: nil, actorName: "",
                                     fontID: nil, fontName: nil,
                                     excerpt: ISO8601DateFormatter().string(from: until))
            try await aviso.save(on: db)

            if let push, let user = try await User.find(userID, on: db) {
                let (titulo, cuerpo) = PushCopy.sourceLimit(lang: user.lang)
                await PushSender.send(.init(title: titulo, body: cuerpo, url: "/",
                                            tag: "fontapp-cupo"),
                                      to: userID, on: db, client: push.client,
                                      vapid: push.vapid, logger: push.logger)
            }
        } catch {
            // Silencioso: el permiso ya está concedido, que es lo que importaba.
        }
    }
}
