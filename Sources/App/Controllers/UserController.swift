import Fluent
import Vapor

// CRUD de usuarios — ver definitions.md (Users management).
// Las respuestas usan `UserResponse` para no exponer nunca el hash de contraseña.
struct UserController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let users = routes.grouped("users")
        users.post(use: create)             // registro: público
        users.get(":userID", use: show)     // lectura: pública

        // Editar/borrar requiere token y solo sobre la propia cuenta (self-only).
        let protected = users.grouped(UserToken.authenticator(), User.guardMiddleware())
        protected.group(":userID") { user in
            user.put(use: update)
            user.delete(use: destroy)
        }
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

        let user = User(
            name: dto.name,
            username: dto.username,
            email: email,
            passwordHash: try req.password.hash(dto.password)
        )
        try await user.save(on: req.db)

        let response = Response(status: .created)
        try response.content.encode(UserResponse(user, includeEmail: true))
        return response
    }

    @Sendable func show(req: Request) async throws -> UserResponse {
        UserResponse(try await find(req))
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

    private func find(_ req: Request) async throws -> User {
        guard let user = try await User.find(req.parameters.get("userID"), on: req.db) else {
            throw Abort(.notFound)
        }
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
}

extension UpdateUserDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("name", as: String.self, is: !.empty)
        validations.add("username", as: String.self, is: .count(3...))
        validations.add("email", as: String.self, is: .email)
        validations.add("password", as: String.self, is: .count(8...), required: false)
    }
}
