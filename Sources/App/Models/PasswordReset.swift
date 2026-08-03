import Fluent
import Vapor

/// Token de un solo uso para restablecer la contraseña. Caduca (~1 h) y se borra al usarse.
final class PasswordReset: Model, @unchecked Sendable {
    static let schema = "password_resets"

    @ID(key: .id) var id: UUID?
    @Parent(key: "user_id") var user: User
    @Field(key: "token") var token: String
    @Field(key: "expires_at") var expiresAt: Date
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, userID: UUID, token: String, expiresAt: Date) {
        self.id = id
        self.$user.id = userID
        self.token = token
        self.expiresAt = expiresAt
    }

    /// Genera un token aleatorio válido durante `ttl` segundos (por defecto 1 h).
    /// URL-safe: el token viaja en el query string del enlace del correo, así que
    /// evitamos los caracteres de base64 que la URL altera (`+` → espacio, `/`, `=`).
    static func generate(for userID: UUID, ttl: TimeInterval = 3600) -> PasswordReset {
        let token = [UInt8].random(count: 32).base64
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return PasswordReset(userID: userID, token: token, expiresAt: Date().addingTimeInterval(ttl))
    }
}
