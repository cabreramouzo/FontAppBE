import Fluent
import Vapor

// Denuncias de contenido inapropiado. Crear: cualquier usuario autenticado.
// Listar/descartar: solo admins (moderación).
struct FlagController: RouteCollection {
    static let targetTypes = ["comment", "font"]

    func boot(routes: RoutesBuilder) throws {
        let flags = routes.grouped("flags").grouped(UserToken.authenticator(), User.guardMiddleware())
        flags.post(use: create)
        flags.get(use: index)                // admin
        flags.group(":flagID") { f in
            f.delete(use: destroy)           // admin: descartar
        }
    }

    /// POST /flags — denuncia una reseña o fuente. Idempotente-ish: no bloqueamos duplicados.
    @Sendable func create(req: Request) async throws -> Response {
        let user = try req.auth.require(User.self)
        try CreateFlagDTO.validate(content: req)
        let dto = try req.content.decode(CreateFlagDTO.self)
        let flag = ContentFlag(flaggerID: try user.requireID(), targetType: dto.targetType, targetID: dto.targetID, reason: dto.reason)
        try await flag.save(on: req.db)
        return Response(status: .created)
    }

    /// GET /flags — lista de denuncias abiertas (solo admins), más recientes primero.
    @Sendable func index(req: Request) async throws -> [FlagResponse] {
        try requireAdmin(req)
        let flags = try await ContentFlag.query(on: req.db).sort(\.$createdAt, .descending).all()
        let names = try await User.usernames(for: flags.compactMap { $0.$flagger.id }, on: req.db)
        return flags.map { FlagResponse($0, flaggerName: $0.$flagger.id.flatMap { names[$0] }) }
    }

    /// DELETE /flags/:flagID — descarta una denuncia ya revisada (solo admins).
    @Sendable func destroy(req: Request) async throws -> HTTPStatus {
        try requireAdmin(req)
        guard let flag = try await ContentFlag.find(req.parameters.get("flagID"), on: req.db) else {
            throw Abort(.notFound)
        }
        try await flag.delete(on: req.db)
        return .noContent
    }

    private func requireAdmin(_ req: Request) throws {
        let user = try req.auth.require(User.self)
        guard user.isAdmin else { throw Abort(.forbidden, reason: "Solo para administradores") }
    }
}

struct CreateFlagDTO: Content {
    let targetType: String
    let targetID: UUID
    let reason: String?
}

extension CreateFlagDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("targetType", as: String.self, is: .in("comment", "font"))
        validations.add("reason", as: String.self, is: .count(...500), required: false)
    }
}

struct FlagResponse: Content {
    let id: UUID?
    let flaggerName: String?
    let targetType: String
    let targetID: UUID
    let reason: String?
    let createdAt: Date?

    init(_ flag: ContentFlag, flaggerName: String?) {
        self.id = flag.id
        self.flaggerName = flaggerName
        self.targetType = flag.targetType
        self.targetID = flag.targetID
        self.reason = flag.reason
        self.createdAt = flag.createdAt
    }
}
