import Fluent
import Vapor

/// Un navegador concreto al que se le pueden mandar avisos.
///
/// ## Por qué esto SÍ es una tabla y `FontFavorite` no lo era
///
/// `FontWatchNotifier` explica que seguir una fuente no merecía tabla propia porque la
/// relación ya existía. Aquí es al revés: esto no es una relación entre una persona y una
/// fuente, es **un aparato**. La misma cuenta tiene el móvil y el portátil, cada uno con su
/// endpoint y sus claves, y cada uno se puede caducar por su cuenta.
///
/// ## El endpoint es la identidad
///
/// Lo da el navegador y es único por instalación; por eso lleva índice único y por eso al
/// resuscribirse se **actualiza** en vez de insertar otra fila: el navegador puede rotar
/// sus claves conservando el endpoint, y quedarían dos filas de las que una no descifra.
///
/// ## Y se borran solas
///
/// Cuando el servicio de push responde 404 o 410, esa suscripción ya no existe: el móvil se
/// formateó, se desinstaló la app, se revocó el permiso. Se borra en el momento. Sin eso, la
/// tabla se llena de destinos muertos a los que se sigue escribiendo en cada aviso.
final class PushSubscription: Model, @unchecked Sendable {
    static let schema = "push_subscriptions"

    @ID(key: .id) var id: UUID?
    @Parent(key: "user_id") var user: User
    /// A dónde se manda. Único: es la identidad del aparato.
    @Field(key: "endpoint") var endpoint: String
    /// Clave pública del navegador, base64url (P-256 sin comprimir).
    @Field(key: "p256dh") var p256dh: String
    /// Secreto de autenticación del navegador, base64url (16 bytes).
    @Field(key: "auth") var auth: String
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(userID: UUID, endpoint: String, p256dh: String, auth: String) {
        self.$user.id = userID
        self.endpoint = endpoint
        self.p256dh = p256dh
        self.auth = auth
    }

    /// Lo que necesita `WebPush.cifra`. `nil` si las claves no son legibles: una
    /// suscripción con claves rotas no se puede usar y no debe tumbar el envío a las demás.
    var suscriptor: WebPush.Subscriber? {
        guard let p = Data.fromBase64URL(p256dh), let a = Data.fromBase64URL(auth),
              p.count == 65, a.count == 16 else { return nil }
        return .init(p256dh: p, auth: a)
    }
}
