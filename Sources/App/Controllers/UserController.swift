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

        // Editar/borrar requiere token y solo sobre la propia cuenta (self-only).
        let protected = users.grouped(UserToken.authenticator(), User.guardMiddleware())
        protected.get("stats", "regions", use: regionStats)  // admin
        protected.group(":userID") { user in
            user.put(use: update)
            user.delete(use: destroy)
        }
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
            signupCity: geo?.city
        )
        try await user.save(on: req.db)

        let response = Response(status: .created)
        try response.content.encode(UserResponse(user, includeEmail: true))
        return response
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
        if let password = dto.password {
            user.passwordHash = try req.password.hash(password)
        }
        try await user.save(on: req.db)
        return UserResponse(user, includeEmail: true)
    }

    @Sendable func destroy(req: Request) async throws -> HTTPStatus {
        let user = try await find(req)
        try requireSelf(req, target: user)
        try await user.delete(on: req.db)
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
}

/// Fila de la estadística de registros por región.
struct RegionCount: Content {
    let country: String?
    let region: String?
    let count: Int
}

extension CreateUserDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("name", as: String.self, is: !.empty)
        validations.add("username", as: String.self, is: .count(3...))
        validations.add("email", as: String.self, is: .email)
        validations.add("password", as: String.self, is: .count(8...))
    }
}

struct UpdateUserDTO: Content {
    let name: String
    let username: String
    let email: String
    let password: String?
    let emailPublic: Bool?
}

extension UpdateUserDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("name", as: String.self, is: !.empty)
        validations.add("username", as: String.self, is: .count(3...))
        validations.add("email", as: String.self, is: .email)
        validations.add("password", as: String.self, is: .count(8...), required: false)
    }
}
