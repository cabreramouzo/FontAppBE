import Fluent
import Foundation
import Vapor

/// Manda un aviso a los aparatos de una persona.
///
/// ## El texto lo pone el SERVIDOR aquí, al revés que en la campana
///
/// La regla de la casa es que el aviso viaja como **código** y las palabras las pone el
/// navegador, porque el servidor no sabe en qué idioma lees. Un push es la excepción, y por
/// la misma razón que la tienen los correos: **se pinta fuera de la app**. Lo dibuja el
/// sistema operativo en la pantalla de bloqueo, donde no hay diccionarios cargados ni
/// `localStorage` que consultar — un service worker no ve el idioma que elegiste.
///
/// Así que se usa `users.lang`, exactamente igual que `MentionEmail` y el resumen semanal.
/// Si esa columna está vacía, catalán, que es el idioma por defecto de la app.
///
/// ## Y por eso el push NO sustituye a la campana
///
/// Se guardan las dos cosas: la campana con su código —que se traduce al idioma que estés
/// leyendo *ahora*— y el push con su frase congelada. Si algún día alguien cambia de idioma,
/// la bandeja se lee bien entera y solo la notificación vieja del sistema se quedó en el
/// anterior, que es donde no importa.
enum PushSender {
    /// A cuántos aparatos se manda como mucho de una vez. Nadie tiene diez navegadores; un
    /// número mucho mayor solo puede venir de un fallo, y no vale la pena descubrirlo
    /// mandando mil peticiones.
    static let maxAparatos = 10

    struct Aviso: Content {
        let title: String
        let body: String
        /// A dónde lleva al tocarla. Ruta relativa: el service worker le pone el origen.
        let url: String
        /// Para que dos avisos de la misma fuente se apilen en vez de acumularse.
        let tag: String
    }

    /// Manda `aviso` a todos los aparatos de `userID`. No lanza nunca.
    static func send(_ aviso: Aviso, to userID: UUID, on db: any Database,
                     client: any Client, vapid: Vapid?, logger: Logger) async {
        guard let vapid else { return }   // sin claves configuradas no hay push, y no es un error
        do {
            let subs = try await PushSubscription.query(on: db)
                .filter(\.$user.$id == userID)
                .limit(maxAparatos)
                .all()
            guard !subs.isEmpty else { return }
            let cuerpoClaro = try JSONEncoder().encode(aviso)

            for sub in subs {
                guard let quien = sub.suscriptor,
                      let auth = vapid.authorization(paraEndpoint: sub.endpoint),
                      let uri = URI(string: sub.endpoint) as URI?,
                      let cifrado = try? WebPush.cifra(cuerpoClaro, para: quien)
                else { continue }

                do {
                    let res = try await client.post(uri) { req in
                        req.headers.replaceOrAdd(name: .authorization, value: auth)
                        req.headers.replaceOrAdd(name: .contentEncoding, value: "aes128gcm")
                        req.headers.replaceOrAdd(name: .contentType, value: "application/octet-stream")
                        // Cuánto guardarlo si el móvil está apagado. Un día: pasado eso,
                        // «alguien ha reseñado tu fuente» ya no es una noticia.
                        req.headers.replaceOrAdd(name: "TTL", value: "86400")
                        // Que no despierte la pantalla de madrugada por una reseña.
                        req.headers.replaceOrAdd(name: "Urgency", value: "normal")
                        req.body = .init(data: cifrado)
                    }
                    // 404/410 = esa suscripción ya no existe (desinstalada, permiso
                    // revocado, móvil formateado). Se borra ahora: si no, la tabla se
                    // llena de destinos muertos a los que se escribe en cada aviso.
                    if res.status == .notFound || res.status == .gone {
                        try? await sub.delete(on: db)
                    } else if res.status.code >= 400 {
                        logger.warning("push rechazado \(res.status.code) en \(uri.host ?? "?")")
                    }
                } catch {
                    logger.warning("push no enviado: \(String(reflecting: error))")
                }
            }
        } catch {
            logger.warning("push: no se pudieron leer las suscripciones")
        }
    }
}

/// Lo que hace falta para poder mandar un push desde un aviso.
///
/// Va en un paquete y no en tres parámetros sueltos porque estos avisos se lanzan desde
/// `Task.detached` en cuatro controladores: cuanto menos haya que acordarse de pasar, menos
/// sitios donde alguien se deje el push sin enganchar y no se entere nadie.
struct PushEnvio: Sendable {
    let client: any Client
    let vapid: Vapid?
    let logger: Logger

    /// `nil` si no hay claves configuradas, para que quien llama no tenga que comprobarlo.
    init?(_ app: Application) {
        guard let v = app.vapid else { return nil }
        self.client = app.client
        self.vapid = v
        self.logger = app.logger
    }
}
