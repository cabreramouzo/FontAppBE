import Fluent
import SQLKit
import Vapor

// CRUD de usuarios — ver definitions.md (Users management).
// Las respuestas usan `UserResponse` para no exponer nunca el hash de contraseña.
struct UserController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let users = routes.grouped("users")
        users.post(use: create)             // registro: público
        users.get(":userID", use: show)     // lectura: pública
        users.get(":userID", "fonts", use: userFonts)       // fuentes creadas: público
        users.get(":userID", "comments", use: userComments) // reseñas: público
        // Baja del resumen semanal desde el propio correo, sin sesión (token firmado).
        users.post("unsubscribe", use: unsubscribe)

        // Editar/borrar requiere token y solo sobre la propia cuenta (self-only).
        let protected = users.grouped(UserToken.authenticator(), User.guardMiddleware())
        protected.get("stats", "regions", use: regionStats)  // admin
        protected.get("stats", "new", use: newUsers)         // admin: altas recientes
        protected.get("stats", "sources", use: sourceStats)  // admin: altas por cartel
        protected.get("staff", use: staff)                   // owner: moderadores/admins
        protected.get("admin", use: adminList)               // owner: listado completo paginado
        protected.group(":userID") { user in
            user.put(use: update)
            user.delete(use: destroy)
            user.put("role", use: setRole)                   // owner: cambiar rol
        }
    }

    /// GET /users/staff — usuarios con rol por encima de `user` (solo owner).
    @Sendable func staff(req: Request) async throws -> [StaffMember] {
        let me = try req.auth.require(User.self)
        guard me.isOwner else { throw Abort(.forbidden, reason: "Solo el propietario") }
        let users = try await User.query(on: req.db)
            .filter(\.$role != UserRole.user)
            .all()
        return users
            .sorted { $0.role.rank > $1.role.rank }
            .map { StaffMember(id: $0.id, username: $0.username, role: $0.role.rawValue) }
    }

    /// GET /users/admin?page=&per=&search= — listado completo de usuarios, paginado
    /// y con búsqueda (por username/nombre/email). Solo owner: expone email y ubicación
    /// de registro (PII), nunca el hash de contraseña.
    @Sendable func adminList(req: Request) async throws -> Page<AdminUser> {
        let me = try req.auth.require(User.self)
        guard me.isOwner else { throw Abort(.forbidden, reason: "Solo el propietario") }
        let query = User.query(on: req.db).sort(\.$createdAt, .descending)
        if let search = req.query[String.self, at: "search"]?.trimmingCharacters(in: .whitespaces), !search.isEmpty {
            let like = "%\(search)%"
            query.group(.or) { or in
                or.filter(\.$username, .custom("ILIKE"), like)
                or.filter(\.$name, .custom("ILIKE"), like)
                or.filter(\.$email, .custom("ILIKE"), like)
            }
        }
        let page = try await query.paginate(for: req)
        return Page(items: page.items.map(AdminUser.init), metadata: page.metadata)
    }

    /// PUT /users/:userID/role — cambia el rol de un usuario (solo owner).
    /// No permite: cambiarte a ti mismo, tocar a otro owner, ni asignar el rol owner
    /// (el owner se fija por CLI con `set-role`, para que no se pueda escalar desde la web).
    @Sendable func setRole(req: Request) async throws -> UserResponse {
        let me = try req.auth.require(User.self)
        guard me.isOwner else { throw Abort(.forbidden, reason: "Solo el propietario puede asignar roles") }
        let dto = try req.content.decode(SetRoleDTO.self)
        guard let role = UserRole(rawValue: dto.role), role != .owner else {
            throw Abort(.badRequest, reason: "Rol no válido (user/moderator/admin)")
        }
        // `find` resuelve el parámetro por UUID o por username (para promover a alguien
        // que aún es `user` escribiendo su nombre, sin conocer su id).
        let target = try await find(req)
        guard target.id != me.id else {
            throw Abort(.badRequest, reason: "No puedes cambiar tu propio rol")
        }
        guard !target.isOwner else {
            throw Abort(.forbidden, reason: "No puedes cambiar el rol del propietario")
        }
        target.role = role
        try await target.save(on: req.db)
        return UserResponse(target, includeEmail: true)
    }

    /// GET /users/stats/regions — nº de usuarios por región de registro (solo admins).
    /// Los usuarios sin ubicación (dev/demo o IP no resuelta) salen con region nula.
    @Sendable func regionStats(req: Request) async throws -> [RegionCount] {
        let user = try req.auth.require(User.self)
        guard user.isAdmin else { throw Abort(.forbidden, reason: "Solo para administradores") }
        guard let sql = req.db as? SQLDatabase else { throw Abort(.internalServerError) }
        return try await sql.raw("""
            SELECT signup_country AS country, signup_region AS region, COUNT(*)::int AS count
            FROM users
            GROUP BY signup_country, signup_region
            ORDER BY count DESC, region ASC
            """).all(decoding: RegionCount.self)
    }

    /// GET /users/stats/new?since=<ISO-8601> — cuántos usuarios se han dado de alta
    /// desde esa fecha, para el distintivo del panel (solo admins). Sin `since`,
    /// cuenta los de los últimos 7 días.
    @Sendable func newUsers(req: Request) async throws -> NewUsersCount {
        let user = try req.auth.require(User.self)
        guard user.isAdmin else { throw Abort(.forbidden, reason: "Solo para administradores") }
        let since = req.query[String.self, at: "since"].flatMap(Self.parseISO)
            ?? Date().addingTimeInterval(-7 * 86_400)
        let count = try await User.query(on: req.db)
            .filter(\.$createdAt > since)
            .filter(\.$anonymizedAt == nil)
            .count()
        return NewUsersCount(count: count, since: since)
    }

    /// El codi del cartell l'escriu qui vulgui a la URL, així que entra a la BD net:
    /// minúscules, sense espais, només lletres/números/guions i com a molt 40 caràcters.
    static func cleanSource(_ value: String?) -> String? {
        guard let value else { return nil }
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789-_")
        let clean = String(value.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
            .unicodeScalars.filter { allowed.contains($0) }.prefix(40))
        return clean.isEmpty ? nil : clean
    }

    /// El navegador manda `toISOString()`, que lleva milisegundos ("...T10:00:00.123Z");
    /// `ISO8601DateFormatter` NO los acepta por defecto y devolvía nil en silencio (con
    /// lo que el contador se iba a "los últimos 7 días" y siempre salía distinto de cero).
    private static func parseISO(_ value: String) -> Date? {
        let withMillis = ISO8601DateFormatter()
        withMillis.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withMillis.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    /// GET /users/stats/sources — altas por código de cartel (`?p=…`), solo admins.
    /// Las que llegaron sin código salen con `source` nulo ("directo").
    @Sendable func sourceStats(req: Request) async throws -> [SourceCount] {
        let user = try req.auth.require(User.self)
        guard user.isAdmin else { throw Abort(.forbidden, reason: "Solo para administradores") }
        guard let sql = req.db as? SQLDatabase else { throw Abort(.internalServerError) }
        return try await sql.raw("""
            SELECT signup_source AS source, COUNT(*)::int AS count
            FROM users
            WHERE anonymized_at IS NULL
            GROUP BY signup_source
            ORDER BY count DESC, source ASC
            """).all(decoding: SourceCount.self)
    }

    @Sendable func create(req: Request) async throws -> Response {
        try CreateUserDTO.validate(content: req)
        let dto = try req.content.decode(CreateUserDTO.self)

        // 409 limpio en vez de dejar que el constraint de unicidad reviente en 500.
        guard try await User.query(on: req.db).filter(\.$username == dto.username).first() == nil else {
            throw Abort(.conflict, reason: "El username '\(dto.username)' ya está en uso")
        }
        let email = dto.email.lowercased()
        guard try await User.query(on: req.db).filter(\.$email == email).first() == nil else {
            throw Abort(.conflict, reason: "El correo '\(email)' ya está registrado")
        }

        // Ubicación aproximada del registro (best-effort; nunca bloquea ni guarda la IP).
        let geo = await req.geoLocator.locate(ip: req.clientIP, on: req.client)

        let user = User(
            name: dto.name,
            username: dto.username,
            email: email,
            passwordHash: try req.password.hash(dto.password),
            signupCountry: geo?.country,
            signupRegion: geo?.region,
            signupCity: geo?.city,
            lang: dto.lang,
            signupSource: Self.cleanSource(dto.source)
        )
        try await user.save(on: req.db)

        // Correo de bienvenida. Best-effort a propósito: si el proveedor falla, el alta
        // ya está hecha y no tiene sentido devolver un error al usuario por esto.
        let base = Environment.get("WEB_ORIGIN")?.split(separator: ",").first.map(String.init)
            ?? "http://localhost:5174"
        let mail = WelcomeEmail.build(lang: dto.lang, name: user.name, webOrigin: base)
        do {
            try await req.mailSender.send(to: email, subject: mail.subject, html: mail.html, text: mail.text, on: req.client)
        } catch {
            req.logger.error("No s'ha pogut enviar el correu de benvinguda a \(email): \(error)")
        }

        let response = Response(status: .created)
        try response.content.encode(UserResponse(user, includeEmail: true))
        return response
    }

    /// POST /users/unsubscribe — desactiva el resumen semanal con el token del correo.
    /// Público a propósito: el enlace se pulsa desde el buzón, sin sesión. El token es un
    /// HMAC del id (ver `UnsubscribeToken`), así que no se puede dar de baja a otro.
    /// Idempotente: darse de baja dos veces responde 200 igualmente.
    @Sendable func unsubscribe(req: Request) async throws -> HTTPStatus {
        let dto = try req.content.decode(UnsubscribeDTO.self)
        guard let userID = UUID(uuidString: dto.user), UnsubscribeToken.verify(dto.token, userID: userID) else {
            throw Abort(.badRequest, reason: "Enlace de baja no válido")
        }
        guard let user = try await User.find(userID, on: req.db) else {
            throw Abort(.badRequest, reason: "Enlace de baja no válido")
        }
        user.weeklyDigest = false
        try await user.save(on: req.db)
        return .ok
    }

    @Sendable func show(req: Request) async throws -> UserResponse {
        UserResponse(try await find(req))
    }

    /// GET /users/:userID/fonts — fuentes creadas por ese usuario (público, solo lectura).
    @Sendable func userFonts(req: Request) async throws -> [Font] {
        let user = try await find(req)
        return try await Font.query(on: req.db)
            .filter(\.$creator.$id == user.requireID())
            .sort(\.$createdAt, .descending)
            .all()
    }

    /// GET /users/:userID/comments — reseñas de ese usuario, con el nombre de la fuente (público).
    @Sendable func userComments(req: Request) async throws -> [MyCommentResponse] {
        let user = try await find(req)
        let comments = try await FontComment.query(on: req.db)
            .filter(\.$user.$id == user.requireID())
            .sort(\.$createdAt, .descending)
            .all()
        let fontIDs = Array(Set(comments.map { $0.$font.id }))
        let fonts = fontIDs.isEmpty ? [] : try await Font.query(on: req.db).filter(\.$id ~~ fontIDs).all()
        let names = Dictionary(uniqueKeysWithValues: fonts.compactMap { f in f.id.map { ($0, f.name) } })
        return comments.map { MyCommentResponse($0, fontName: names[$0.$font.id]) }
    }

    @Sendable func update(req: Request) async throws -> UserResponse {
        try UpdateUserDTO.validate(content: req)
        let user = try await find(req)
        try requireSelf(req, target: user)
        let dto = try req.content.decode(UpdateUserDTO.self)

        // Si el username cambia a uno que ya tiene OTRO usuario -> 409.
        if let clash = try await User.query(on: req.db).filter(\.$username == dto.username).first(),
           clash.id != user.id {
            throw Abort(.conflict, reason: "El username '\(dto.username)' ya está en uso")
        }
        let email = dto.email.lowercased()
        if let clash = try await User.query(on: req.db).filter(\.$email == email).first(),
           clash.id != user.id {
            throw Abort(.conflict, reason: "El correo '\(email)' ya está registrado")
        }

        user.name = dto.name
        user.username = dto.username
        user.email = email
        if let emailPublic = dto.emailPublic { user.emailPublic = emailPublic }
        if let namePublic = dto.namePublic { user.namePublic = namePublic }
        if let weeklyDigest = dto.weeklyDigest { user.weeklyDigest = weeklyDigest }
        if let password = dto.password {
            user.passwordHash = try req.password.hash(password)
        }
        try await user.save(on: req.db)
        return UserResponse(user, includeEmail: true)
    }

    /// "Borrado" de cuenta = anonimización. Las aportaciones (fuentes, reseñas,
    /// confirmaciones) NO son datos personales sino información sobre fuentes de
    /// uso común, así que se conservan pero se desligan de la identidad del
    /// usuario. Los datos personales (nombre, email, ubicación de registro) se
    /// eliminan y el login queda inutilizado.
    @Sendable func destroy(req: Request) async throws -> HTTPStatus {
        let user = try await find(req)
        try requireSelf(req, target: user)
        let userID = try user.requireID()

        // Ya anonimizada: nada más que hacer (idempotente).
        guard user.anonymizedAt == nil else { return .noContent }

        let shortID = userID.uuidString.prefix(8).lowercased()
        user.name = "Compte eliminat"
        user.username = "eliminat-\(shortID)"
        user.email = nil
        user.emailPublic = false
        user.namePublic = false
        user.role = .user
        user.signupCountry = nil
        user.signupRegion = nil
        user.signupCity = nil
        // Contraseña aleatoria e inrecuperable: el login queda inutilizado.
        user.passwordHash = try req.password.hash([UInt8].random(count: 32).base64)
        user.anonymizedAt = Date()
        try await user.save(on: req.db)

        // Revoca sesiones y peticiones de reseteo pendientes.
        try await UserToken.query(on: req.db).filter(\.$user.$id == userID).delete()
        try await PasswordReset.query(on: req.db).filter(\.$user.$id == userID).delete()

        return .noContent
    }

    /// Resuelve `:userID` por UUID o por username. Así las URLs pueden ser
    /// legibles (/users/miguel) sin romperse: el UUID sigue siendo un fallback
    /// estable si alguien se renombra.
    private func find(_ req: Request) async throws -> User {
        guard let param = req.parameters.get("userID") else { throw Abort(.notFound) }
        let user: User?
        if let id = UUID(uuidString: param) {
            user = try await User.find(id, on: req.db)
        } else {
            user = try await User.query(on: req.db).filter(\.$username == param).first()
        }
        guard let user else { throw Abort(.notFound) }
        return user
    }

    /// 403 si el usuario autenticado intenta modificar una cuenta que no es la suya.
    private func requireSelf(_ req: Request, target: User) throws {
        let authUser = try req.auth.require(User.self)
        guard authUser.id == target.id else {
            throw Abort(.forbidden, reason: "Solo puedes modificar tu propia cuenta")
        }
    }
}

struct CreateUserDTO: Content {
    let name: String
    let username: String
    let email: String
    let password: String
    /// Idioma de la interfaz para localizar el correo de bienvenida (ca/es/gl/eu/en).
    /// Opcional: sin él se envía en catalán, el idioma por defecto de la app.
    var lang: String? = nil
    /// Codi del cartell pel qual va arribar (`?p=castellcir`). Opcional.
    var source: String? = nil
}

/// Altas desde una fecha, para el distintivo de "usuarios nuevos" del panel.
struct NewUsersCount: Content {
    let count: Int
    let since: Date
}

/// Fila de la estadística de altas por cartel (`source` nulo = llegaron sin código).
struct SourceCount: Content {
    let source: String?
    let count: Int
}

/// Fila de la estadística de registros por región.
struct RegionCount: Content {
    let country: String?
    let region: String?
    let count: Int
}

/// Miembro del equipo (rol > user) para la vista de gestión de roles del owner.
struct StaffMember: Content {
    let id: UUID?
    let username: String
    let role: String
}

/// Fila del listado completo de usuarios (solo owner). Todas las columnas útiles,
/// sin el hash de contraseña. Incluye PII (email, ubicación de registro).
struct AdminUser: Content {
    let id: UUID?
    let username: String
    let name: String
    let email: String?
    let role: String
    let signupCountry: String?
    let signupRegion: String?
    let signupCity: String?
    let anonymized: Bool
    let createdAt: Date?

    init(_ u: User) {
        self.id = u.id
        self.username = u.username
        self.name = u.name
        self.email = u.email
        self.role = u.role.rawValue
        self.signupCountry = u.signupCountry
        self.signupRegion = u.signupRegion
        self.signupCity = u.signupCity
        self.anonymized = u.anonymizedAt != nil
        self.createdAt = u.createdAt
    }
}

struct SetRoleDTO: Content {
    let role: String
}

extension CreateUserDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("name", as: String.self, is: !.empty)
        validations.add("username", as: String.self, is: .count(3...))
        validations.add("email", as: String.self, is: .email)
        validations.add("password", as: String.self, is: .count(8...))
    }
}

/// Baja del resumen semanal desde el correo: id de usuario + su HMAC.
struct UnsubscribeDTO: Content {
    let user: String
    let token: String
}

struct UpdateUserDTO: Content {
    let name: String
    let username: String
    let email: String
    let password: String?
    let emailPublic: Bool?
    let namePublic: Bool?
    /// Resumen semanal por correo. Opcional: si no viene, la preferencia no se toca.
    var weeklyDigest: Bool? = nil
}

extension UpdateUserDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("name", as: String.self, is: !.empty)
        validations.add("username", as: String.self, is: .count(3...))
        validations.add("email", as: String.self, is: .email)
        validations.add("password", as: String.self, is: .count(8...), required: false)
    }
}
