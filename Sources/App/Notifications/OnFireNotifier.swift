import Fluent
import Foundation
import Vapor

/// Avisa a los administradores de que alguien ha pulsado **«estoy on fire»**: ha chocado
/// con el cupo de cuenta nueva y pide que se lo amplíen.
///
/// ## Por qué esto sí merece interrumpir a alguien
///
/// Es el aviso más urgente que tiene la app, y no por importante: por **perecedero**. Quien
/// lo pulsa está en la calle, ahora, con el móvil en la mano y fuentes por apuntar. Si nadie
/// lo ve hasta la noche, ya no hay nada que conceder — esa persona se ha ido a casa, y lo
/// que se ha perdido no son cinco fuentes, es el rato en que alguien estaba dispuesto.
///
/// Hasta ahora la solicitud caía en el panel de moderación y se quedaba ahí hasta que a
/// alguien se le ocurría mirar. La otra mitad de esto —que quien lo pidió se entere cuando
/// se le concede— la hace `SourceLimitNotifier`.
///
/// ## No hace falta controlar repeticiones
///
/// `FlagController.create` ya devuelve 204 sin guardar nada si esa persona ya tiene una
/// solicitud abierta, así que pulsar el botón catorce veces no manda catorce avisos. Y una
/// solicitud nueva después de que se le haya concedido y caducado sí es una petición nueva
/// de verdad.
enum OnFireNotifier {
    /// No lanza nunca: la solicitud ya está guardada, que es lo que le importa a quien la
    /// hizo. Quedarse sin avisar es malo; perder la solicitud, peor.
    static func requested(by user: User, on db: any Database, push: PushEnvio? = nil) async {
        do {
            guard let userID = user.id else { return }

            // Cuántas lleva hoy: es exactamente el dato con el que se decide, y evita que
            // el administrador tenga que ir a mirarlo antes de contestar.
            let hoy = try await Font.query(on: db)
                .filter(\.$creator.$id == userID)
                .filter(\.$createdAt > Date().addingTimeInterval(-86_400))
                .count()

            let admins = try await User.query(on: db)
                .filter(\.$anonymizedAt == nil)
                .all()
                .filter { $0.isAdmin && $0.id != userID }
            guard !admins.isEmpty else { return }

            for admin in admins {
                guard let adminID = admin.id else { continue }
                let aviso = Notification(userID: adminID, kind: .userOnFire,
                                         actorID: userID, actorName: user.username,
                                         fontID: nil, fontName: nil,
                                         excerpt: String(hoy))
                try await aviso.save(on: db)

                if let push, admin.pushAdmin {
                    let (titulo, cuerpo) = PushCopy.onFire(quien: user.username, hoy: hoy,
                                                           lang: admin.lang)
                    await PushSender.send(
                        // Directo a la cola, que es donde se concede: el aviso tiene que
                        // dejarte a un toque de resolverlo, no informarte de que hay algo.
                        .init(title: titulo, body: cuerpo, url: "/admin/moderation",
                              tag: "onfire-\(userID)"),
                        to: adminID, on: db, client: push.client,
                        vapid: push.vapid, logger: push.logger)
                }
            }
        } catch {
            // Silencioso a propósito: quien llama ya ha guardado la solicitud.
        }
    }
}
