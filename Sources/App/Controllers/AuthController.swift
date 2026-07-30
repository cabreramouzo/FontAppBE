import Fluent
import Vapor

// Autenticación por token Bearer respaldado en BD.
// Flujo: POST /auth/login (Basic user:pass) -> token; luego `Authorization: Bearer <token>`.
struct AuthController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let auth = routes.grouped("auth")

        // Login con Basic auth (usuario/contraseña).
        auth.grouped(User.authenticator()).post("login", use: login)

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
        return LoginResponse(token: token.value, expiresAt: token.expiresAt, user: UserResponse(user))
    }

    /// GET /auth/me — devuelve el usuario autenticado.
    @Sendable func me(req: Request) async throws -> UserResponse {
        UserResponse(try req.auth.require(User.self))
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
