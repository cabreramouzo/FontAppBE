import Fluent
import Vapor

// OJO: `User` NO es `Content` a propósito, para no serializar nunca `passwordHash`
// en las respuestas. Para devolver usuarios usa `UserResponse`.
final class User: Model, @unchecked Sendable {
    static let schema = "users"

    @ID(key: .id) var id: UUID?
    @Field(key: "name") var name: String
    @Field(key: "username") var username: String
    @Field(key: "password_hash") var passwordHash: String
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, name: String, username: String, passwordHash: String) {
        self.id = id
        self.name = name
        self.username = username
        self.passwordHash = passwordHash
    }

    func verify(password: String, req: Request) throws -> Bool {
        try req.password.verify(password, created: self.passwordHash)
    }
}

/// Representación pública de un usuario (sin el hash de contraseña).
struct UserResponse: Content {
    let id: UUID?
    let name: String
    let username: String

    init(_ user: User) {
        self.id = user.id
        self.name = user.name
        self.username = user.username
    }
}
