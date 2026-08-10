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
    // Rol jerárquico (fuente de verdad de permisos). Ver `UserRole` y los helpers abajo.
    // La columna `is_admin` sigue en la BD por compatibilidad, pero ya no se lee.
    @Field(key: "role") var role: UserRole
    // Privacidad: si el usuario decide mostrar su email en su perfil público.
    @Field(key: "email_public") var emailPublic: Bool
    // Privacidad: si el nombre real se muestra en el perfil público (si no, solo @username).
    @Field(key: "name_public") var namePublic: Bool
    // Ubicación aproximada al crear la cuenta (deducida de la IP), solo para
    // estadística regional. No guardamos la IP en claro. Nullable (dev / IP no resuelta).
    @OptionalField(key: "signup_country") var signupCountry: String?
    @OptionalField(key: "signup_region") var signupRegion: String?
    @OptionalField(key: "signup_city") var signupCity: String?
    // Si la cuenta se ha anonimizado (el usuario la "borró"): sus aportaciones
    // (fuentes, reseñas) se conservan desligadas de su identidad; los datos
    // personales se eliminan y el login queda inutilizado.
    @OptionalField(key: "anonymized_at") var anonymizedAt: Date?
    // Preferencia de correo: resumen semanal de actividad (se puede desactivar en el
    // perfil o desde el enlace de baja del propio correo).
    @Field(key: "weekly_digest") var weeklyDigest: Bool
    // Idioma con el que se registró, para los correos que no nacen de una petición suya.
    @OptionalField(key: "lang") var lang: String?
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, name: String, username: String, email: String? = nil, passwordHash: String, role: UserRole = .user,
         emailPublic: Bool = false, namePublic: Bool = true,
         signupCountry: String? = nil, signupRegion: String? = nil, signupCity: String? = nil,
         weeklyDigest: Bool = true, lang: String? = nil) {
        self.id = id
        self.name = name
        self.username = username
        self.email = email
        self.passwordHash = passwordHash
        self.role = role
        self.emailPublic = emailPublic
        self.namePublic = namePublic
        self.signupCountry = signupCountry
        self.signupRegion = signupRegion
        self.signupCity = signupCity
        self.weeklyDigest = weeklyDigest
        self.lang = lang
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
    /// El propietario del servicio: máximo nivel, único, se fija por CLI (`set-role`).
    var isOwner: Bool { role == .owner }
    /// Admin o superior: gestiona fuentes, revierte ediciones y ve estadísticas.
    var isAdmin: Bool { role.atLeast(.admin) }
    /// Moderador o superior: modera contenido ajeno (reseñas, incidencias, denuncias).
    var canModerate: Bool { role.atLeast(.moderator) }
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
    /// Rol jerárquico (solo en respuestas propias): user/moderator/admin/owner.
    let role: String?
    let emailPublic: Bool?
    let namePublic: Bool?
    /// Resumen semanal por correo (solo en respuestas propias).
    let weeklyDigest: Bool?
    let anonymized: Bool
    let createdAt: Date?

    /// `includeEmail`: respuestas propias (login/me/edición) — email + flags siempre.
    /// En el perfil público el email solo aparece si el usuario lo ha hecho público,
    /// y el nombre real solo si `namePublic` (si no, se devuelve el @username como nombre).
    init(_ user: User, includeEmail: Bool = false) {
        self.id = user.id
        self.name = (includeEmail || user.namePublic) ? user.name : user.username
        self.username = user.username
        self.email = (includeEmail || user.emailPublic) ? user.email : nil
        // El rol (y su isAdmin derivado) y los flags de privacidad solo se exponen al propio usuario.
        self.isAdmin = includeEmail ? user.isAdmin : nil
        self.role = includeEmail ? user.role.rawValue : nil
        self.emailPublic = includeEmail ? user.emailPublic : nil
        self.namePublic = includeEmail ? user.namePublic : nil
        self.weeklyDigest = includeEmail ? user.weeklyDigest : nil
        self.anonymized = user.anonymizedAt != nil
        self.createdAt = user.createdAt
    }
}
