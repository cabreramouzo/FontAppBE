import Fluent
import Vapor

// Autenticación por token Bearer respaldado en BD.
// Flujo: POST /auth/login (Basic user:pass) -> token; luego `Authorization: Bearer <token>`.
struct AuthController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let auth = routes.grouped("auth")

        // Login con Basic auth (usuario/contraseña).
        auth.grouped(User.authenticator()).post("login", use: login)

        // Recuperación de contraseña (público).
        auth.post("forgot-password", use: forgotPassword)
        auth.post("reset-password", use: resetPassword)

        // Rutas que requieren un token válido.
        let tokenProtected = auth.grouped(UserToken.authenticator(), User.guardMiddleware())
        tokenProtected.get("me", use: me)
        tokenProtected.get("me", "fonts", use: myFonts)
        tokenProtected.get("me", "comments", use: myComments)
        tokenProtected.post("logout", use: logout)
    }

    /// POST /auth/login — valida credenciales y emite un token.
    @Sendable func login(req: Request) async throws -> LoginResponse {
        let user = try req.auth.require(User.self)
        let token = try UserToken.generate(for: user)
        try await token.save(on: req.db)
        return LoginResponse(token: token.value, expiresAt: token.expiresAt, user: UserResponse(user, includeEmail: true))
    }

    /// GET /auth/me — devuelve el usuario autenticado (con su email).
    @Sendable func me(req: Request) async throws -> UserResponse {
        UserResponse(try req.auth.require(User.self), includeEmail: true)
    }

    /// POST /auth/forgot-password — genera un token de reset y "envía" el enlace.
    /// Responde siempre 200 (no revela si el correo existe). En dev devuelve el enlace.
    @Sendable func forgotPassword(req: Request) async throws -> ForgotResponse {
        let dto = try req.content.decode(ForgotDTO.self)
        let email = dto.email.lowercased()

        guard let user = try await User.query(on: req.db).filter(\.$email == email).first() else {
            return ForgotResponse(ok: true, devLink: nil) // no enumeramos usuarios
        }
        let userID = try user.requireID()
        try await PasswordReset.query(on: req.db).filter(\.$user.$id == userID).delete()
        let reset = PasswordReset.generate(for: userID)
        try await reset.save(on: req.db)

        let base = Environment.get("WEB_ORIGIN")?.split(separator: ",").first.map(String.init)
            ?? "http://localhost:5174"
        let link = "\(base)/reset?token=\(reset.token)"

        // Envía el correo (LogMailSender en dev, Resend en prod). Best-effort:
        // si el proveedor falla, no revelamos nada al cliente (evita enumeración/oráculo).
        let html = """
            <p>Has demanat restablir la contrasenya de FontApp.</p>
            <p><a href="\(link)">Restablir la contrasenya</a> (l'enllaç caduca en 1 hora).</p>
            <p>Si no ho has demanat tu, ignora aquest correu.</p>
            """
        do {
            try await req.mailSender.send(to: email, subject: "Restablir la contrasenya · FontApp", html: html, on: req.client)
        } catch {
            req.logger.error("No s'ha pogut enviar el correu de reset a \(email): \(error)")
        }

        let isProd = req.application.environment == .production
        return ForgotResponse(ok: true, devLink: isProd ? nil : link)
    }

    /// POST /auth/reset-password — fija una nueva contraseña con un token válido.
    @Sendable func resetPassword(req: Request) async throws -> HTTPStatus {
        try ResetDTO.validate(content: req)
        let dto = try req.content.decode(ResetDTO.self)

        guard let reset = try await PasswordReset.query(on: req.db).filter(\.$token == dto.token).first() else {
            throw Abort(.badRequest, reason: "Enlace de recuperación no válido")
        }
        guard reset.expiresAt > Date() else {
            try await reset.delete(on: req.db)
            throw Abort(.badRequest, reason: "El enlace de recuperación ha caducado")
        }
        guard let user = try await User.find(reset.$user.id, on: req.db) else {
            throw Abort(.badRequest, reason: "Enlace de recuperación no válido")
        }
        user.passwordHash = try req.password.hash(dto.password)
        try await user.save(on: req.db)
        // Invalida el token usado y cierra las sesiones abiertas por seguridad.
        try await PasswordReset.query(on: req.db).filter(\.$user.$id == user.requireID()).delete()
        try await UserToken.query(on: req.db).filter(\.$user.$id == user.requireID()).delete()
        return .ok
    }

    /// GET /auth/me/fonts — fuentes creadas por el usuario autenticado (más recientes primero).
    @Sendable func myFonts(req: Request) async throws -> [Font] {
        let user = try req.auth.require(User.self)
        return try await Font.query(on: req.db)
            .filter(\.$creator.$id == user.requireID())
            .sort(\.$createdAt, .descending)
            .all()
    }

    /// GET /auth/me/comments — reseñas del usuario autenticado, con el nombre de la fuente.
    @Sendable func myComments(req: Request) async throws -> [MyCommentResponse] {
        let user = try req.auth.require(User.self)
        let comments = try await FontComment.query(on: req.db)
            .filter(\.$user.$id == user.requireID())
            .sort(\.$createdAt, .descending)
            .all()
        // Nombres de las fuentes referenciadas (una query, sin N+1).
        let fontIDs = Array(Set(comments.map { $0.$font.id }))
        let fonts = try await Font.query(on: req.db).filter(\.$id ~~ fontIDs).all()
        let names = Dictionary(uniqueKeysWithValues: fonts.compactMap { f in f.id.map { ($0, f.name) } })
        return comments.map { MyCommentResponse($0, fontName: names[$0.$font.id]) }
    }

    /// POST /auth/logout — revoca el token usado en la petición.
    @Sendable func logout(req: Request) async throws -> HTTPStatus {
        guard let bearer = req.headers.bearerAuthorization else {
            throw Abort(.unauthorized)
        }
        try await UserToken.query(on: req.db).filter(\.$value == bearer.token).delete()
        return .noContent
    }
}

struct LoginResponse: Content {
    let token: String
    let expiresAt: Date?
    let user: UserResponse
}

struct ForgotDTO: Content {
    let email: String
}

/// Respuesta de forgot-password. `devLink` solo se rellena fuera de producción.
struct ForgotResponse: Content {
    let ok: Bool
    let devLink: String?
}

struct ResetDTO: Content {
    let token: String
    let password: String
}

extension ResetDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("token", as: String.self, is: !.empty)
        validations.add("password", as: String.self, is: .count(8...))
    }
}

/// Reseña propia con el nombre de la fuente, para la pantalla "mi perfil".
struct MyCommentResponse: Content {
    let id: UUID?
    let fontID: UUID
    let fontName: String?
    let body: String
    let rating: Int?
    let waterStatus: String?
    let createdAt: Date?

    init(_ comment: FontComment, fontName: String?) {
        self.id = comment.id
        self.fontID = comment.$font.id
        self.fontName = fontName
        self.body = comment.body
        self.rating = comment.rating
        self.waterStatus = comment.waterStatus
        self.createdAt = comment.createdAt
    }
}
