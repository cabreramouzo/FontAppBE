import Fluent
import SQLKit
import Vapor

// Denuncias de contenido inapropiado. Crear: cualquier usuario autenticado.
// Listar/descartar: solo admins (moderación).
struct FlagController: RouteCollection {
    static let targetTypes = ["comment", "font", "photo"]

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
        let userID = try user.requireID()
        try CreateFlagDTO.validate(content: req)
        let dto = try req.content.decode(CreateFlagDTO.self)
        let existing = try await ContentFlag.query(on: req.db)
            .filter(\.$flagger.$id == userID)
            .filter(\.$targetType == dto.targetType)
            .filter(\.$targetID == dto.targetID)
            .first()
        if existing != nil { return Response(status: .noContent) }
        let flag = ContentFlag(flaggerID: userID, targetType: dto.targetType, targetID: dto.targetID, fontID: dto.fontID, reason: dto.reason)
        try await flag.save(on: req.db)

        // Tres personas distintas pueden sacar preventivamente una fuente del mapa,
        // pero nunca sancionar al autor: esa decisión sigue siendo de un moderador.
        if dto.targetType == "font", let sql = req.db as? SQLDatabase {
            struct Count: Decodable { let count: Int }
            let count = try await sql.raw("""
                SELECT COUNT(DISTINCT flagger_id)::int AS count FROM content_flags
                WHERE target_type = 'font' AND target_id = \(bind: dto.targetID)
                """).first(decoding: Count.self)?.count ?? 0
            if count >= 3, let font = try await Font.find(dto.targetID, on: req.db), font.moderationState == "visible" {
                font.moderationState = "pending"
                font.moderationReason = "community_reports"
                font.moderatedAt = Date()
                try await font.save(on: req.db)
            }
        }
        return Response(status: .created)
    }

    /// GET /flags — lista de denuncias abiertas (solo admins), más recientes primero.
    /// Incluye el texto/foto del contenido denunciado para revisarlo sin salir.
    @Sendable func index(req: Request) async throws -> [FlagResponse] {
        try requireAdmin(req)
        let flags = try await ContentFlag.query(on: req.db).sort(\.$createdAt, .descending).all()
        let names = try await User.usernames(for: flags.compactMap { $0.$flagger.id }, on: req.db)

        // Contenido de los objetivos (una query por tipo, sin N+1).
        let commentIDs = flags.filter { $0.targetType == "comment" }.map { $0.targetID }
        let fontIDs = flags.filter { $0.targetType == "font" }.map { $0.targetID }
        // Las fotos secundarias se pueden denunciar desde el primer día: varias imágenes
        // por fuente es más superficie para el abuso que una sola, y la moderación tenía
        // que llegar con la función y no después.
        let photoIDs = flags.filter { $0.targetType == "photo" }.map { $0.targetID }
        let photos = photoIDs.isEmpty ? [] : try await FontPhoto.query(on: req.db).filter(\.$id ~~ photoIDs).all()
        let photoByID = Dictionary(uniqueKeysWithValues: photos.compactMap { p in p.id.map { ($0, p) } })
        let comments = commentIDs.isEmpty ? [] : try await FontComment.query(on: req.db).filter(\.$id ~~ commentIDs).all()
        let fonts = fontIDs.isEmpty ? [] : try await Font.query(on: req.db).filter(\.$id ~~ fontIDs).all()
        let commentByID = Dictionary(uniqueKeysWithValues: comments.compactMap { c in c.id.map { ($0, c) } })
        let fontByID = Dictionary(uniqueKeysWithValues: fonts.compactMap { f in f.id.map { ($0, f) } })

        return flags.map { flag in
            let text: String?
            let image: String?
            if flag.targetType == "comment", let c = commentByID[flag.targetID] {
                text = c.body; image = c.image
            } else if flag.targetType == "font", let f = fontByID[flag.targetID] {
                text = f.name; image = f.image
            } else if flag.targetType == "photo", let p = photoByID[flag.targetID] {
                text = p.caption ?? p.kind.rawValue; image = p.url
            } else {
                text = nil; image = nil // contenido ya borrado
            }
            return FlagResponse(flag, flaggerName: flag.$flagger.id.flatMap { names[$0] }, targetText: text, targetImage: image)
        }
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
        guard user.canModerate else { throw Abort(.forbidden, reason: "Solo para moderadores") }
    }
}

struct CreateFlagDTO: Content {
    let targetType: String
    let targetID: UUID
    let fontID: UUID?
    let reason: String?
}

extension CreateFlagDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("targetType", as: String.self, is: .in("comment", "font", "photo"))
        validations.add("reason", as: String.self, is: .count(...500), required: false)
    }
}

struct FlagResponse: Content {
    let id: UUID?
    let flaggerName: String?
    let targetType: String
    let targetID: UUID
    let fontID: UUID?
    let reason: String?
    let createdAt: Date?
    /// Texto (cuerpo de la reseña o nombre de la fuente) y foto del contenido denunciado.
    let targetText: String?
    let targetImage: String?

    init(_ flag: ContentFlag, flaggerName: String?, targetText: String? = nil, targetImage: String? = nil) {
        self.id = flag.id
        self.flaggerName = flaggerName
        self.targetType = flag.targetType
        self.targetID = flag.targetID
        self.fontID = flag.fontID
        self.reason = flag.reason
        self.createdAt = flag.createdAt
        self.targetText = targetText
        self.targetImage = targetImage
    }
}
