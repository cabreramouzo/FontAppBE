import Fluent
import Vapor

// Actualizaciones de estado / reseñas sobre una fuente — ver definitions.md (comments).
// Cada una lleva texto y, opcionalmente, estrellas, estado del agua y foto.
struct FontCommentController: RouteCollection {
    static let waterStatuses = ["flowing", "trickle", "dry", "unknown"]

    func boot(routes: RoutesBuilder) throws {
        let comments = routes.grouped("fonts", ":fontID", "comments")
        comments.get(use: index) // lectura pública
        comments.grouped(UserToken.authenticator(), User.guardMiddleware()).post(use: create)
    }

    /// GET /fonts/:fontID/comments — actualizaciones, más recientes primero.
    @Sendable func index(req: Request) async throws -> [CommentResponse] {
        let fontID = try await requireFontID(req)
        let comments = try await FontComment.query(on: req.db)
            .filter(\.$font.$id == fontID)
            .sort(\.$createdAt, .descending)
            .all()
        let names = try await User.usernames(for: comments.compactMap { $0.$user.id }, on: req.db)
        return comments.map { CommentResponse($0, username: $0.$user.id.flatMap { names[$0] }) }
    }

    /// POST /fonts/:fontID/comments — añade una actualización/reseña.
    @Sendable func create(req: Request) async throws -> Response {
        let user = try req.auth.require(User.self)
        let fontID = try await requireFontID(req)
        try CreateCommentDTO.validate(content: req)
        let dto = try req.content.decode(CreateCommentDTO.self)

        let comment = FontComment(
            fontID: fontID,
            userID: try user.requireID(),
            body: dto.body,
            rating: dto.rating,
            waterStatus: dto.waterStatus,
            image: dto.image
        )
        try await comment.save(on: req.db)

        let response = Response(status: .created)
        try response.content.encode(CommentResponse(comment, username: user.username))
        return response
    }

    /// Verifica que la fuente existe (404 si no) y devuelve su id.
    private func requireFontID(_ req: Request) async throws -> UUID {
        guard let font = try await Font.find(req.parameters.get("fontID"), on: req.db) else {
            throw Abort(.notFound, reason: "No existe la fuente indicada")
        }
        return try font.requireID()
    }
}

struct CreateCommentDTO: Content {
    let body: String
    let rating: Int?
    let waterStatus: String?
    let image: String?
}

extension CreateCommentDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("body", as: String.self, is: .count(1...2000))
        validations.add("rating", as: Int.self, is: .range(1...5), required: false)
        validations.add("waterStatus", as: String.self, is: .in("flowing", "trickle", "dry", "unknown"), required: false)
    }
}

/// Representación pública de una actualización/reseña.
struct CommentResponse: Content {
    let id: UUID?
    let fontID: UUID
    let userID: UUID?
    let username: String?
    let body: String
    let rating: Int?
    let waterStatus: String?
    let image: String?
    let createdAt: Date?

    init(_ comment: FontComment, username: String?) {
        self.id = comment.id
        self.fontID = comment.$font.id
        self.userID = comment.$user.id
        self.username = username
        self.body = comment.body
        self.rating = comment.rating
        self.waterStatus = comment.waterStatus
        self.image = comment.image
        self.createdAt = comment.createdAt
    }
}
