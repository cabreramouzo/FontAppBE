import Fluent
import Vapor

// Comentarios sobre una fuente — ver definitions.md (Fonts comments management).
// Un "comment" es texto libre de un usuario (opinión, nota), sin implicar incidencia.
struct FontCommentController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let comments = routes.grouped("fonts", ":fontID", "comments")
        comments.get(use: index) // lectura pública
        comments.grouped(UserToken.authenticator(), User.guardMiddleware()).post(use: create)
    }

    /// GET /fonts/:fontID/comments — lista los comentarios de la fuente.
    @Sendable func index(req: Request) async throws -> [CommentResponse] {
        let fontID = try await requireFontID(req)
        let comments = try await FontComment.query(on: req.db)
            .filter(\.$font.$id == fontID)
            .sort(\.$createdAt, .descending)
            .all()
        let names = try await User.usernames(for: comments.compactMap { $0.$user.id }, on: req.db)
        return comments.map { CommentResponse($0, username: $0.$user.id.flatMap { names[$0] }) }
    }

    /// POST /fonts/:fontID/comments — añade un comentario a la fuente.
    @Sendable func create(req: Request) async throws -> Response {
        let user = try req.auth.require(User.self)
        let fontID = try await requireFontID(req)
        try CreateCommentDTO.validate(content: req)
        let dto = try req.content.decode(CreateCommentDTO.self)

        let comment = FontComment(fontID: fontID, userID: try user.requireID(), body: dto.body)
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
}

extension CreateCommentDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("body", as: String.self, is: .count(1...2000))
    }
}

/// Representación pública de un comentario.
struct CommentResponse: Content {
    let id: UUID?
    let fontID: UUID
    let userID: UUID?
    let username: String?
    let body: String
    let createdAt: Date?

    init(_ comment: FontComment, username: String?) {
        self.id = comment.id
        self.fontID = comment.$font.id
        self.userID = comment.$user.id
        self.username = username
        self.body = comment.body
        self.createdAt = comment.createdAt
    }
}
