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
