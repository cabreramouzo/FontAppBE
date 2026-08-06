import Fluent
import Vapor

/// Sugerencia / feedback libre de un visitante. Sirve para recoger ideas y, sobre
/// todo, saber qué países/regiones se piden (señal para decidir la expansión de datos).
/// Si el usuario está autenticado se liga a su cuenta; anónimo se guarda sin identidad.
final class Feedback: Model, Content, @unchecked Sendable {
    static let schema = "feedback"

    @ID(key: .id) var id: UUID?
    // Autor: opcional (anónimo) y setNull si se borra/anonimiza la cuenta.
    @OptionalParent(key: "user_id") var user: User?
    @Field(key: "message") var message: String
    // País/región que pide o al que se refiere (texto libre, opcional).
    @OptionalField(key: "country") var country: String?
    // Email opcional, por si quiere que le avisemos (p. ej. al añadir su zona).
    @OptionalField(key: "email") var email: String?
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, userID: UUID? = nil, message: String, country: String? = nil, email: String? = nil) {
        self.id = id
        self.$user.id = userID
        self.message = message
        self.country = country
        self.email = email
    }
}
