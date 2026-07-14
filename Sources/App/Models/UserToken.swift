import Fluent
import Vapor

/// Token de acceso Bearer respaldado en BD. Se emite en el login y se revoca en el logout.
final class UserToken: Model, @unchecked Sendable {
    static let schema = "user_tokens"

    @ID(key: .id) var id: UUID?
    @Field(key: "value") var value: String
    @Parent(key: "user_id") var user: User
    @OptionalField(key: "expires_at") var expiresAt: Date?

    init() {}

    init(id: UUID? = nil, value: String, userID: User.IDValue, expiresAt: Date? = nil) {
        self.id = id
        self.value = value
        self.$user.id = userID
        self.expiresAt = expiresAt
    }

    /// Genera un token aleatorio para un usuario (TTL por defecto: 30 días).
    static func generate(for user: User, ttl: TimeInterval = 60 * 60 * 24 * 30) throws -> UserToken {
        UserToken(
            value: [UInt8].random(count: 32).base64,
            userID: try user.requireID(),
            expiresAt: Date().addingTimeInterval(ttl)
        )
    }
}

extension UserToken: ModelTokenAuthenticatable {
    static let valueKey = \UserToken.$value
    static let userKey = \UserToken.$user

    var isValid: Bool {
        guard let expiresAt else { return true }
        return expiresAt > Date()
    }
}
