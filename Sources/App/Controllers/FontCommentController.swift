import Fluent
import Vapor

// Actualizaciones de estado / reseñas sobre una fuente — ver definitions.md (comments).
// Cada una lleva texto y, opcionalmente, estrellas, estado del agua y foto.
struct FontCommentController: RouteCollection {
    /// Estados que puede dejar una reseña.
    ///
    /// `broken` y `gone` describen la fuente, no el agua: un caño roto o un pilón que ya
    /// no está son la información más útil que puede traer alguien que ha ido hasta allí,
    /// y hasta ahora solo cabían en el texto libre, donde no las lee ni el mapa ni nadie.
    ///
    /// Ojo: `gone` es un **testimonio**, no una decisión. Que alguien diga que la fuente
    /// ya no existe no la borra del mapa — retirarla sigue siendo una capacidad de nivel,
    /// y esto es justamente la prueba en la que apoyarla.
    static let waterStatuses = ["flowing", "trickle", "dry", "broken", "gone", "unknown"]

    func boot(routes: RoutesBuilder) throws {
        let comments = routes.grouped("fonts", ":fontID", "comments")
        // Lectura pública, pero con auth OPCIONAL: si viene token, sabemos si el
        // usuario ya confirmó cada estado (confirmedByMe), sin exigir login.
        comments.grouped(UserToken.authenticator()).get(use: index)
        let auth = comments.grouped(UserToken.authenticator(), User.guardMiddleware())
        // Confirmar estados es rápido y deseable; escribir 40 reseñas en una hora, no.
        auth.grouped(RateLimitMiddleware(scope: "comment", max: 40, window: 60 * 60)).post(use: create)
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
        let autores = try await User.authors(for: comments.compactMap { $0.$user.id }, on: req.db)
        let confs = try await Self.confirmations(for: comments, viewer: req.auth.get(User.self)?.id, on: req.db)
        return comments.map { c in
            let quien = c.$user.id.flatMap { autores[$0] }
            return CommentResponse(c, username: quien?.username, staff: quien?.staff,
                                   confirm: c.id.flatMap { confs[$0] })
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
        let font = try await requireFont(req)
        let fontID = try font.requireID()
        try CreateCommentDTO.validate(content: req)
        let dto = try req.content.decode(CreateCommentDTO.self)

        // El comentario es opcional: se puede publicar solo un cambio de estado.
        // Pero algo hay que aportar (texto o estado); si no, no tiene sentido.
        let body = dto.body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !body.isEmpty || dto.waterStatus != nil else {
            throw AppError(.badRequest, "comment.empty", "Indica el estado o escribe un comentario")
        }

        let comment = FontComment(
            fontID: fontID,
            userID: try user.requireID(),
            body: body,
            rating: dto.rating,
            waterStatus: dto.waterStatus,
            image: dto.image,
            queuedOffline: req.headers.first(name: "X-FontApp-Queued-Offline") == "1"
        )
        try await comment.save(on: req.db)

        // Si la fuente no tenía foto, ésta pasa a ser la suya. Es el arreglo de lo que
        // más se repetía: la gente fotografía la fuente, la adjunta a la reseña porque es
        // el único sitio donde se la piden, y la ficha se queda en blanco para siempre.
        // Nadie le dijo nunca que faltaba lo otro, y el botón de ascenderla solo aparece
        // DESPUÉS de publicar, dentro de su propia reseña, donde no vuelve a mirar.
        //
        // Va **en línea** y no en un `Task.detached` como los avisos: la respuesta tiene
        // que poder decir que ha pasado. Pero no puede costar la reseña — la foto ya está
        // guardada y la reseña también, así que si la copia falla se sigue adelante.
        var portadaAdoptada = false
        do {
            portadaAdoptada = try await CoverPhoto.adopt(font: font, from: comment,
                                                         storage: req.imageStorage, on: req.db)
        } catch {
            req.logger.error("No se pudo ascender la foto de la reseña a portada: \(error)")
        }

        // Igual que en las incidencias: después de guardar y sin esperar.
        MentionNotifier.notify(text: body, by: user, fontID: fontID, on: req)

        // Si alguien dice que vuelve a manar, las incidencias abiertas de esa fuente se
        // cierran solas. Va aquí y no en el barrido de gamificación a propósito: esto es
        // información sobre el agua, no sobre puntos, y ningún controlador debe depender
        // de que la gamificación esté encendida para decir la verdad sobre una fuente.
        var seHaResuelto = false
        if dto.waterStatus == "flowing" {
            seHaResuelto = try await FontReportController.autoResolve(fontID: fontID, on: req.db)
        }

        // A quien sigue la fuente. Después de guardar y sin esperar, como las menciones:
        // perder la reseña por no poder avisar sería absurdo.
        let userID = try user.requireID()
        let estado = dto.waterStatus
        let db = req.db
        Task.detached {
            await FontWatchNotifier.notify(fontID: fontID, change: .review(status: estado),
                                           actorID: userID, on: db)
            // Que una incidencia se cierre sola es la mejor noticia que puede dar una
            // fuente, y no se deduce de «alguien dijo que raja»: va aparte.
            if seHaResuelto {
                await FontWatchNotifier.notify(fontID: fontID, change: .resolved,
                                               actorID: userID, on: db)
            }
        }

        let response = Response(status: .created)
        try response.content.encode(
            CommentResponse(comment, username: user.username, staff: user.role == .user ? nil : user.role,
                            coverAdopted: portadaAdoptada))
        return response
    }

    /// Verifica que la fuente existe (404 si no) y la devuelve.
    private func requireFont(_ req: Request) async throws -> Font {
        guard let font = try await Font.find(req.parameters.get("fontID"), on: req.db) else {
            throw AppError(.notFound, "font.notFound", "No existe la fuente indicada")
        }
        return font
    }

    /// Verifica que la fuente existe (404 si no) y devuelve su id.
    private func requireFontID(_ req: Request) async throws -> UUID {
        try await requireFont(req).requireID()
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
        let autores = try await User.authors(for: comment.$user.id.map { [$0] } ?? [], on: db)
        let confs = try await confirmations(for: [comment], viewer: viewer, on: db)
        let quien = comment.$user.id.flatMap { autores[$0] }
        return CommentResponse(comment, username: quien?.username, staff: quien?.staff,
                               confirm: comment.id.flatMap { confs[$0] })
    }

    /// PUT /fonts/:fontID/comments/:commentID — edita una reseña propia.
    @Sendable func update(req: Request) async throws -> CommentResponse {
        let user = try req.auth.require(User.self)
        let comment = try await requireOwnComment(req, user: user)
        try CreateCommentDTO.validate(content: req)
        let dto = try req.content.decode(CreateCommentDTO.self)
        let oldImage = comment.image
        comment.body = dto.body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        comment.rating = dto.rating
        comment.waterStatus = dto.waterStatus
        comment.image = dto.image
        try await comment.save(on: req.db)
        if let oldImage, oldImage != dto.image { try? await req.imageStorage.delete(oldImage) }
        return CommentResponse(comment, username: user.username, staff: user.role == .user ? nil : user.role)
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
        guard user.canModerate || comment.$user.id == user.id else {
            throw AppError(.forbidden, "comment.selfOnly", "Solo puedes modificar tus propias reseñas")
        }
        return comment
    }
}

struct CreateCommentDTO: Content {
    let body: String?
    let rating: Int?
    let waterStatus: String?
    let image: String?
}

extension CreateCommentDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        // Opcional: se puede publicar solo un estado. Si viene, máx 2000 chars.
        validations.add("body", as: String.self, is: .count(1...2000), required: false)
        validations.add("rating", as: Int.self, is: .range(1...5), required: false)
        // Desde la constante y no repitiendo la lista: eran dos listas que podían
        // separarse en silencio, y de hecho el estado nuevo habría pasado la validación
        // en un sitio y no en el otro.
        validations.add("waterStatus", as: String.self,
                        is: .in(FontCommentController.waterStatuses), required: false)
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
    /// Rol de quien la escribió, **solo si es del equipo** (ver `ReportResponse.staff`).
    let staff: UserRole?
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
    /// Esta foto ha pasado además a ser la portada de la fuente (solo al publicarla).
    /// Va como `Bool` y no como opcional a propósito: en la lista siempre sale `false` y
    /// el cliente nunca tiene que distinguir «no» de «el servidor no lo dijo».
    let coverAdopted: Bool

    init(_ comment: FontComment, username: String?, staff: UserRole? = nil, confirm: ConfirmAgg? = nil,
         coverAdopted: Bool = false) {
        self.id = comment.id
        self.fontID = comment.$font.id
        self.userID = comment.$user.id
        self.username = username
        self.staff = staff
        self.body = comment.body
        self.rating = comment.rating
        self.waterStatus = comment.waterStatus
        self.image = comment.image
        self.createdAt = comment.createdAt
        self.coverAdopted = coverAdopted
        self.confirmations = confirm?.count ?? 0
        self.confirmedByMe = confirm?.byViewer ?? false
        self.lastConfirmedAt = confirm?.lastAt
    }
}
