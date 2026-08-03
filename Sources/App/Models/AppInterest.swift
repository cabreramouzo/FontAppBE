import Fluent
import Vapor

/// Señal de interés (o no) en una app móvil nativa de FontApp, recogida por un
/// banner en la web. Sirve para medir demanda antes de invertir en apps de tienda.
/// Si el usuario está autenticado se liga a su cuenta (un voto por usuario, se
/// actualiza si cambia de opinión); anónimo se guarda sin identidad.
final class AppInterest: Model, Content, @unchecked Sendable {
    static let schema = "app_interests"

    @ID(key: .id) var id: UUID?
    // Autor: opcional (anónimo) y setNull si se borra/anonimiza la cuenta.
    @OptionalParent(key: "user_id") var user: User?
    // true = quiere app móvil; false = no le hace falta.
    @Field(key: "wants") var wants: Bool
    // Plataforma detectada en el cliente (ios/android/other), solo estadística.
    @OptionalField(key: "platform") var platform: String?
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?
    @Timestamp(key: "updated_at", on: .update) var updatedAt: Date?

    init() {}

    init(id: UUID? = nil, userID: UUID? = nil, wants: Bool, platform: String? = nil) {
        self.id = id
        self.$user.id = userID
        self.wants = wants
        self.platform = platform
    }
}
