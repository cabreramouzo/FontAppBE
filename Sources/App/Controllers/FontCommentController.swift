import Fluent
import Vapor

// Actualizaciones de estado / reseñas sobre una fuente — ver definitions.md (comments).
// Cada una lleva texto y, opcionalmente, estrellas, estado del agua y foto.
struct FontCommentController: RouteCollection {
    static let waterStatuses = ["flowing", "trickle", "dry", "unknown"]

    func boot(routes: RoutesBuilder) throws {
        let comments = routes.grouped("fonts", ":fontID", "comments")
        // Lectura pública, pero con auth OPCIONAL: si viene token, sabemos si el
        // usuario ya confirmó cada estado (confirmedByMe), sin exigir login.
        comments.grouped(UserToken.authenticator()).get(use: index)
        let auth = comments.grouped(UserToken.authenticator(), User.guardMiddleware())
        auth.post(use: create)
        auth.group(":commentID") { c in
            c.put(use: update)
            c.delete(use: destroy)
            c.post("confirm", use: confirm)     // 👍 "sigue igual"
            c.delete("confirm", use: unconfirm) // deshacer
        }
    }

    /// GET /fonts/:fontID/comments — actualizaciones, más recientes primero.
    @Sendable func index(req: Request) async throws -> [CommentResponse] {
        let fontID = try await requireFontID(req)
        let comments = try await FontComment.query(on: req.db)
            .filter(\.$font.$id == fontID)
            .sort(\.$createdAt, .descending)
            .all()
        let names = try await User.usernames(for: comments.compactMap { $0.$user.id }, on: req.db)
        let confs = try await Self.confirmations(for: comments, viewer: req.auth.get(User.self)?.id, on: req.db)
        return comments.map { c in
            CommentResponse(c, username: c.$user.id.flatMap { names[$0] }, confirm: c.id.flatMap { confs[$0] })
        }
    }

    /// POST /fonts/:fontID/comments/:commentID/confirm — 👍 "sigue igual".
    /// Idempotente: si ya confirmaste, no duplica (constraint único). Refresca la frescura.
    @Sendable func confirm(req: Request) async throws -> CommentResponse {
        let user = try req.auth.require(User.self)
        let comment = try await requireComment(req)
        let userID = try user.requireID()
        let commentID = try comment.requireID()
        let already = try await FontConfirmation.query(on: req.db)
            .filter(\.$comment.$id == commentID)
            .filter(\.$user.$id == userID)
            .first()
        if already == nil {
            try await FontConfirmation(commentID: commentID, userID: userID).save(on: req.db)
        }
        return try await Self.response(for: comment, viewer: userID, on: req.db)
    }

    /// DELETE /fonts/:fontID/comments/:commentID/confirm — deshace la confirmación.
    @Sendable func unconfirm(req: Request) async throws -> CommentResponse {
        let user = try req.auth.require(User.self)
        let comment = try await requireComment(req)
        let userID = try user.requireID()
        try await FontConfirmation.query(on: req.db)
            .filter(\.$comment.$id == comment.requireID())
            .filter(\.$user.$id == userID)
            .delete()
        return try await Self.response(for: comment, viewer: userID, on: req.db)
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

    /// Carga el comentario indicado y comprueba que pertenece a la fuente de la ruta.
    private func requireComment(_ req: Request) async throws -> FontComment {
        let fontID = try await requireFontID(req)
        guard let comment = try await FontComment.find(req.parameters.get("commentID"), on: req.db),
              comment.$font.id == fontID else {
            throw Abort(.notFound)
        }
        return comment
    }

    /// Agrega las confirmaciones (👍) de una lista de comentarios en una sola query
    /// (evita N+1): cuántas hay, la más reciente y si el usuario que mira ya confirmó.
    static func confirmations(for comments: [FontComment], viewer: UUID?, on db: Database) async throws -> [UUID: ConfirmAgg] {
        let ids = comments.compactMap { $0.id }
        guard !ids.isEmpty else { return [:] }
        let confs = try await FontConfirmation.query(on: db).filter(\.$comment.$id ~~ ids).all()
        var out: [UUID: ConfirmAgg] = [:]
        for c in confs {
            let cid = c.$comment.id
            var agg = out[cid] ?? ConfirmAgg(count: 0, lastAt: nil, byViewer: false)
            agg.count += 1
            if let d = c.createdAt, agg.lastAt == nil || d > agg.lastAt! { agg.lastAt = d }
            if let viewer, c.$user.id == viewer { agg.byViewer = true }
            out[cid] = agg
        }
        return out
    }

    /// Construye la respuesta de un comentario con su recuento de confirmaciones.
    static func response(for comment: FontComment, viewer: UUID?, on db: Database) async throws -> CommentResponse {
        let names = try await User.usernames(for: comment.$user.id.map { [$0] } ?? [], on: db)
        let confs = try await confirmations(for: [comment], viewer: viewer, on: db)
        return CommentResponse(comment, username: comment.$user.id.flatMap { names[$0] }, confirm: comment.id.flatMap { confs[$0] })
    }

    /// PUT /fonts/:fontID/comments/:commentID — edita una reseña propia.
    @Sendable func update(req: Request) async throws -> CommentResponse {
        let user = try req.auth.require(User.self)
        let comment = try await requireOwnComment(req, user: user)
        try CreateCommentDTO.validate(content: req)
        let dto = try req.content.decode(CreateCommentDTO.self)
        let oldImage = comment.image
        comment.body = dto.body
        comment.rating = dto.rating
        comment.waterStatus = dto.waterStatus
        comment.image = dto.image
        try await comment.save(on: req.db)
        if let oldImage, oldImage != dto.image { try? await req.imageStorage.delete(oldImage) }
        return CommentResponse(comment, username: user.username)
    }

    /// DELETE /fonts/:fontID/comments/:commentID — borra una reseña propia.
    @Sendable func destroy(req: Request) async throws -> HTTPStatus {
        let user = try req.auth.require(User.self)
        let comment = try await requireOwnComment(req, user: user)
        if let image = comment.image { try? await req.imageStorage.delete(image) }
        try await comment.delete(on: req.db)
        return .noContent
    }

    /// Carga la reseña por id; 404 si no existe, 403 si no es del usuario autenticado.
    private func requireOwnComment(_ req: Request, user: User) async throws -> FontComment {
        guard let comment = try await FontComment.find(req.parameters.get("commentID"), on: req.db) else {
            throw Abort(.notFound)
        }
        guard user.isAdmin || comment.$user.id == user.id else {
            throw Abort(.forbidden, reason: "Solo puedes modificar tus propias reseñas")
        }
        return comment
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

/// Agregado de confirmaciones (👍) de un comentario.
struct ConfirmAgg {
    var count: Int
    var lastAt: Date?
    var byViewer: Bool
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
    /// Cuántos usuarios han confirmado que "sigue igual".
    let confirmations: Int
    /// Si el usuario autenticado ya lo confirmó (para el toggle del botón).
    let confirmedByMe: Bool
    /// Fecha de la confirmación más reciente (refresca la frescura del estado).
    let lastConfirmedAt: Date?

    init(_ comment: FontComment, username: String?, confirm: ConfirmAgg? = nil) {
        self.id = comment.id
        self.fontID = comment.$font.id
        self.userID = comment.$user.id
        self.username = username
        self.body = comment.body
        self.rating = comment.rating
        self.waterStatus = comment.waterStatus
        self.image = comment.image
        self.createdAt = comment.createdAt
        self.confirmations = confirm?.count ?? 0
        self.confirmedByMe = confirm?.byViewer ?? false
        self.lastConfirmedAt = confirm?.lastAt
    }
}
