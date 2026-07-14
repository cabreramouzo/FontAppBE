import Fluent
import Vapor

// CRUD de usuarios — ver definitions.md (Users management).
// Las respuestas usan `UserResponse` para no exponer nunca el hash de contraseña.
struct UserController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let users = routes.grouped("users")
        users.post(use: create)
        users.group(":userID") { user in
            user.get(use: show)
            user.put(use: update)
            user.delete(use: destroy)
        }
    }

    @Sendable func create(req: Request) async throws -> UserResponse {
        let dto = try req.content.decode(CreateUserDTO.self)
        let user = User(
            name: dto.name,
            username: dto.username,
            passwordHash: try req.password.hash(dto.password)
        )
        try await user.save(on: req.db)
        return UserResponse(user)
    }

    @Sendable func show(req: Request) async throws -> UserResponse {
        UserResponse(try await find(req))
    }

    @Sendable func update(req: Request) async throws -> UserResponse {
        let user = try await find(req)
        let dto = try req.content.decode(UpdateUserDTO.self)
        user.name = dto.name
        user.username = dto.username
        if let password = dto.password {
            user.passwordHash = try req.password.hash(password)
        }
        try await user.save(on: req.db)
        return UserResponse(user)
    }

    @Sendable func destroy(req: Request) async throws -> HTTPStatus {
        let user = try await find(req)
        try await user.delete(on: req.db)
        return .noContent
    }

    private func find(_ req: Request) async throws -> User {
        guard let user = try await User.find(req.parameters.get("userID"), on: req.db) else {
            throw Abort(.notFound)
        }
        return user
    }
}

struct CreateUserDTO: Content {
    let name: String
    let username: String
    let password: String
}

struct UpdateUserDTO: Content {
    let name: String
    let username: String
    let password: String?
}
