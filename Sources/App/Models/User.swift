import SQLKit
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
    /// Si el usuario prefiere no ver puntos ni niveles. No deja de contar sus aportaciones.
    @Field(key: "gamification_opt_out") var gamificationOptOut: Bool
    /// Avisar por correo cuando alguien te menciona con `@tunombre`. Nace encendido.
    @Field(key: "mention_emails") var mentionEmails: Bool
    /// Avisos del sistema por grupos. Ver `AddPushPrefsToUser` para el porqué de estos
    /// tres y no uno por evento. Nacen encendidos.
    @Field(key: "push_font_updates") var pushFontUpdates: Bool
    @Field(key: "push_mentions") var pushMentions: Bool
    /// Solo lo reciben administradores; el interruptor solo se les pinta a ellos.
    @Field(key: "push_admin") var pushAdmin: Bool
    /// Última vez que se le vio por la app. Solo sirve para no mandar un correo a quien
    /// ya tiene el aviso en la campana. Ver `AddLastSeenAtToUser`.
    @OptionalField(key: "last_seen_at") var lastSeenAt: Date?
    /// Sanciones confirmadas y, si aplica, fin de la restricción para publicar.
    @Field(key: "moderation_strikes") var moderationStrikes: Int
    @OptionalField(key: "posting_restricted_until") var postingRestrictedUntil: Date?
    /// Excepción temporal y específica al cupo de cinco altas para cuentas nuevas.
    /// No concede ningún otro permiso y no evita el rate limit general del endpoint.
    @OptionalField(key: "source_limit_exempt_until") var sourceLimitExemptUntil: Date?
    // Idioma con el que se registró, para los correos que no nacen de una petición suya.
    @OptionalField(key: "lang") var lang: String?
    // Código del cartel por el que llegó (`?p=castellcir`), si venía con uno.
    @OptionalField(key: "signup_source") var signupSource: String?
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, name: String, username: String, email: String? = nil, passwordHash: String, role: UserRole = .user,
         emailPublic: Bool = false, namePublic: Bool = true,
         signupCountry: String? = nil, signupRegion: String? = nil, signupCity: String? = nil,
         weeklyDigest: Bool = true, lang: String? = nil, signupSource: String? = nil,
         gamificationOptOut: Bool = false, mentionEmails: Bool = true,
         pushFontUpdates: Bool = true, pushMentions: Bool = true, pushAdmin: Bool = true) {
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
        self.gamificationOptOut = gamificationOptOut
        self.mentionEmails = mentionEmails
        self.pushFontUpdates = pushFontUpdates
        self.pushMentions = pushMentions
        self.pushAdmin = pushAdmin
        self.lang = lang
        self.signupSource = signupSource
        self.moderationStrikes = 0
    }

    var postingIsRestricted: Bool {
        guard let until = postingRestrictedUntil else { return false }
        return until > Date()
    }

    var hasSourceLimitExemption: Bool {
        sourceLimitExemptUntil.map { $0 > Date() } ?? false
    }

    /// Puerta única para las aportaciones comunitarias. Borrar o deshacer contenido
    /// propio sigue permitido: una sanción no puede impedir corregir ni retirar datos.
    func requireCanContribute() throws {
        guard !postingIsRestricted else {
            throw AppError(.forbidden, "user.postingRestricted",
                           "Esta cuenta tiene temporalmente restringidas las aportaciones")
        }
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
    /// Cada cuánto se refresca `lastSeenAt` como mucho. Una hora: lo bastante fino para
    /// saber si alguien anda por aquí y lo bastante grueso para que sea una escritura por
    /// persona activa y hora, no una por petición.
    static let seenThrottle: TimeInterval = 3_600

    /// Se le ha visto lo bastante cerca como para que la campana baste y el correo sobre.
    ///
    /// Tres días, no tres horas: quien entra un par de veces por semana **va a ver** el
    /// punto rojo la próxima vez, y ése es el caso normal de esta app —se usa cuando sales
    /// al monte, no a diario—. Con un margen corto se enviaría correo a casi todo el
    /// mundo y la campana no habría ahorrado nada, que es justo para lo que se ha hecho.
    static let aroundWindow: TimeInterval = 3 * 86_400

    var isAround: Bool {
        guard let lastSeenAt else { return false }
        return Date().timeIntervalSince(lastSeenAt) < Self.aroundWindow
    }

    /// El propietario del servicio: máximo nivel, único, se fija por CLI (`set-role`).
    var isOwner: Bool { role == .owner }
    /// Admin o superior: gestiona fuentes, revierte ediciones y ve estadísticas.
    var isAdmin: Bool { role.atLeast(.admin) }
    /// Moderador o superior: modera contenido ajeno (reseñas, incidencias, denuncias).
    var canModerate: Bool { role.atLeast(.moderator) }
}

extension User {
    /// Diccionario `id -> username` para los ids dados, en una sola query (evita N+1).
    /// Quién firma un mensaje público: su nombre y, si es del equipo, su rol.
    ///
    /// El rol **no** se publica en `UserResponse` a propósito (ver el comentario de
    /// allí): saber el cargo de cualquiera con solo mirar su perfil no aporta nada y
    /// dibuja el organigrama para quien quiera buscarle las vueltas. Aquí es distinto y
    /// por eso existe este tipo aparte: acompaña **a un mensaje que esa persona ha
    /// escrito en público**, y ahí sí importa —«esto lo dice un moderador» es la mitad
    /// del contenido de un aviso de moderación—. Es una exposición acotada al mensaje,
    /// no una consulta que se pueda hacer sobre cualquiera.
    struct Author: Sendable {
        let username: String
        /// Nulo para un usuario normal.
        let staff: UserRole?
    }

    static func authors(for ids: [UUID], on db: Database) async throws -> [UUID: Author] {
        let unique = Array(Set(ids))
        guard !unique.isEmpty else { return [:] }
        let users = try await User.query(on: db).filter(\.$id ~~ unique).all()
        return Dictionary(uniqueKeysWithValues: users.compactMap { user in
            user.id.map { ($0, Author(username: user.username, staff: user.role == .user ? nil : user.role)) }
        })
    }

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
    /// Si ha apagado la gamificación (solo en respuestas propias).
    let gamificationOptOut: Bool?
    /// Avisos de mención por correo (solo en respuestas propias).
    let mentionEmails: Bool?
    /// Avisos del sistema, por grupos (solo en respuestas propias).
    let pushFontUpdates: Bool?
    let pushMentions: Bool?
    let pushAdmin: Bool?
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
        self.gamificationOptOut = includeEmail ? user.gamificationOptOut : nil
        self.mentionEmails = includeEmail ? user.mentionEmails : nil
        self.pushFontUpdates = includeEmail ? user.pushFontUpdates : nil
        self.pushMentions = includeEmail ? user.pushMentions : nil
        self.pushAdmin = includeEmail ? user.pushAdmin : nil
        self.anonymized = user.anonymizedAt != nil
        self.createdAt = user.createdAt
    }
}

extension User {
    /// Busca por nombre de usuario **sin distinguir mayúsculas**.
    ///
    /// Existe porque las dos mitades de una mención decían cosas distintas:
    /// `MentionNotifier` ya resolvía en minúsculas —`@sebas` avisa a `Sebas`— pero
    /// `/users/:id` comparaba exacto, así que el enlace que se pinta en el texto llevaba
    /// a un **404**. La persona recibía el aviso y, al ir a mirar, su propio perfil no
    /// existía. Medido en producción: de 15 autores recientes, **4** llevan mayúsculas.
    ///
    /// Va por `lower() = lower()` y no por `ILIKE` a propósito: los nombres admiten `_`,
    /// que en `LIKE` es un comodín de un carácter, así que `Dani_Ccir` habría casado
    /// también con `DaniXCcir`. Aquí no hay comodines que escapar porque no hay `LIKE`.
    static func findByUsername(_ name: String, on db: any Database) async throws -> User? {
        guard let sql = db as? SQLDatabase else {
            return try await User.query(on: db).filter(\.$username == name).first()
        }
        struct Fila: Decodable { let id: UUID }
        let fila = try await sql.raw("SELECT id FROM users WHERE lower(username) = lower(\(bind: name)) LIMIT 1")
            .first(decoding: Fila.self)
        guard let fila else { return nil }
        return try await User.find(fila.id, on: db)
    }
}
