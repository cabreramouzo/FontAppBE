import Fluent
import Vapor

// OJO: `User` NO es `Content` a propósito, para no serializar nunca `passwordHash`
// en las respuestas. Para devolver usuarios usa `UserResponse`.
final class User: Model, @unchecked Sendable {
    static let schema = "users"

    @ID(key: .id) var id: UUID?
    @Field(key: "name") var name: String
    @Field(key: "username") var username: String
    // Nullable: los usuarios previos (demo) no tienen; los nuevos sí (validado). Único.
    @OptionalField(key: "email") var email: String?
    @Field(key: "password_hash") var passwordHash: String
    // Moderación: los admin pueden borrar contenido de cualquiera y ver los flags.
    @Field(key: "is_admin") var isAdmin: Bool
    // Ubicación aproximada al crear la cuenta (deducida de la IP), solo para
    // estadística regional. No guardamos la IP en claro. Nullable (dev / IP no resuelta).
    @OptionalField(key: "signup_country") var signupCountry: String?
    @OptionalField(key: "signup_region") var signupRegion: String?
    @OptionalField(key: "signup_city") var signupCity: String?
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, name: String, username: String, email: String? = nil, passwordHash: String, isAdmin: Bool = false,
         signupCountry: String? = nil, signupRegion: String? = nil, signupCity: String? = nil) {
        self.id = id
        self.name = name
        self.username = username
        self.email = email
        self.passwordHash = passwordHash
        self.isAdmin = isAdmin
        self.signupCountry = signupCountry
        self.signupRegion = signupRegion
        self.signupCity = signupCity
    }
}

// Permite login por usuario/contraseña (Basic auth) para emitir tokens.
extension User: ModelAuthenticatable {
    static let usernameKey = \User.$username
    static let passwordHashKey = \User.$passwordHash

    func verify(password: String) throws -> Bool {
        try Bcrypt.verify(password, created: self.passwordHash)
    }
}

extension User {
    /// Diccionario `id -> username` para los ids dados, en una sola query (evita N+1).
    static func usernames(for ids: [UUID], on db: Database) async throws -> [UUID: String] {
        let unique = Array(Set(ids))
        guard !unique.isEmpty else { return [:] }
        let users = try await User.query(on: db).filter(\.$id ~~ unique).all()
        return Dictionary(uniqueKeysWithValues: users.compactMap { user in
            user.id.map { ($0, user.username) }
        })
    }
}

/// Representación pública de un usuario (sin el hash de contraseña).
/// El email es PII: solo se incluye en respuestas propias (login, /auth/me, edición),
/// nunca en la lectura pública `GET /users/:id`.
struct UserResponse: Content {
    let id: UUID?
    let name: String
    let username: String
    let email: String?
    let isAdmin: Bool?
    let createdAt: Date?

    init(_ user: User, includeEmail: Bool = false) {
        self.id = user.id
        self.name = user.name
        self.username = user.username
        self.email = includeEmail ? user.email : nil
        // Solo se expone en respuestas propias (junto al email).
        self.isAdmin = includeEmail ? user.isAdmin : nil
        self.createdAt = user.createdAt
    }
}
