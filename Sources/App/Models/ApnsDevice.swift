import Fluent
import Vapor

/// Un iPhone con la app al que se le pueden mandar avisos.
///
/// Tabla propia y no una columna en `push_subscriptions`: una suscripción de Web Push es
/// un endpoint más dos claves de cifrado; un aparato de Apple es un token y un entorno.
/// Meterlos en la misma fila sería dejar la mitad de las columnas vacías en cada una.
///
/// El token es la identidad, como el endpoint en Web Push: único, y al volver a
/// registrarse se **actualiza** (puede cambiar de cuenta si alguien cierra sesión y entra
/// otra persona en el mismo teléfono).
final class ApnsDevice: Model, @unchecked Sendable {
    static let schema = "apns_devices"

    @ID(key: .id) var id: UUID?
    @Parent(key: "user_id") var user: User
    /// El token del aparato, en hexadecimal.
    @Field(key: "token") var token: String
    /// Instalada desde Xcode (sandbox) o desde TestFlight / App Store.
    @Field(key: "sandbox") var sandbox: Bool
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?
    @Timestamp(key: "updated_at", on: .update) var updatedAt: Date?

    init() {}

    init(userID: UUID, token: String, sandbox: Bool) {
        self.$user.id = userID
        self.token = token
        self.sandbox = sandbox
    }
}
