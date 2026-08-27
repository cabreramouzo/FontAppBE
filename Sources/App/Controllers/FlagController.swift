import Fluent
import SQLKit
import Vapor

// Denuncias de contenido inapropiado. Crear: cualquier usuario autenticado.
// Listar/descartar: solo admins (moderación).
struct FlagController: RouteCollection {
    static let targetTypes = ["comment", "font", "photo", "cover_photo_removal", "source_limit_exemption"]

    func boot(routes: RoutesBuilder) throws {
        let flags = routes.grouped("flags").grouped(UserToken.authenticator(), User.guardMiddleware())
        flags.post(use: create)
        flags.get(use: index)                // admin
        flags.group(":flagID") { f in
            f.delete(use: destroy)           // admin: descartar
            f.post("approve-photo-removal", use: approvePhotoRemoval)
            f.post("approve-source-limit-exemption", use: approveSourceLimitExemption)
        }
    }

    /// POST /flags — denuncia una reseña o fuente. Idempotente-ish: no bloqueamos duplicados.
    @Sendable func create(req: Request) async throws -> Response {
        let user = try req.auth.require(User.self)
        try user.requireCanContribute()
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
        let removalEditIDs = flags.filter { $0.targetType == "cover_photo_removal" }.map { $0.targetID }
        let exemptionUserIDs = flags.filter { $0.targetType == "source_limit_exemption" }.map { $0.targetID }
        let photos = photoIDs.isEmpty ? [] : try await FontPhoto.query(on: req.db).filter(\.$id ~~ photoIDs).all()
        let removalEdits = removalEditIDs.isEmpty ? [] : try await FontEdit.query(on: req.db).filter(\.$id ~~ removalEditIDs).all()
        let removalEditByID = Dictionary(uniqueKeysWithValues: removalEdits.compactMap { e in e.id.map { ($0, e) } })
        let photoByID = Dictionary(uniqueKeysWithValues: photos.compactMap { p in p.id.map { ($0, p) } })
        let comments = commentIDs.isEmpty ? [] : try await FontComment.query(on: req.db).filter(\.$id ~~ commentIDs).all()
        let fonts = fontIDs.isEmpty ? [] : try await Font.query(on: req.db).filter(\.$id ~~ fontIDs).all()
        let commentByID = Dictionary(uniqueKeysWithValues: comments.compactMap { c in c.id.map { ($0, c) } })
        let fontByID = Dictionary(uniqueKeysWithValues: fonts.compactMap { f in f.id.map { ($0, f) } })

        // Autor del contenido y fuente relacionada, también por lotes. La cola necesita
        // contexto para decidir; obligar al cliente a abrir tres páginas por denuncia es
        // justo lo que hacía que no fuera una cola de trabajo.
        let targetAuthors: [UUID: UUID] = Dictionary(uniqueKeysWithValues:
            comments.compactMap { c in c.id.flatMap { id in c.$user.id.map { (id, $0) } } }
            + fonts.compactMap { f in f.id.flatMap { id in f.$creator.id.map { (id, $0) } } }
            + photos.compactMap { p in p.id.flatMap { id in p.$uploader.id.map { (id, $0) } } }
            + removalEdits.compactMap { e in e.id.flatMap { id in e.$editor.id.map { (id, $0) } } }
            + exemptionUserIDs.map { ($0, $0) }
        )
        let authorIDs = Array(Set(targetAuthors.values))
        let authors = authorIDs.isEmpty ? [] : try await User.query(on: req.db).filter(\.$id ~~ authorIDs).all()
        let authorByID = Dictionary(uniqueKeysWithValues: authors.compactMap { u in u.id.map { ($0, u) } })

        let relatedFontIDs = Set(flags.compactMap { flag -> UUID? in
            if flag.targetType == "font" { return flag.targetID }
            if let id = flag.fontID { return id }
            if let c = commentByID[flag.targetID] { return c.$font.id }
            if let p = photoByID[flag.targetID] { return p.$font.id }
            return nil
        })
        let missingFonts = relatedFontIDs.filter { fontByID[$0] == nil }
        let relatedFonts = missingFonts.isEmpty ? [] : try await Font.query(on: req.db).filter(\.$id ~~ Array(missingFonts)).all()
        let allFonts = fontByID.merging(Dictionary(uniqueKeysWithValues: relatedFonts.compactMap { f in f.id.map { ($0, f) } })) { first, _ in first }

        return flags.map { flag in
            let text: String?
            let image: String?
            if flag.targetType == "comment", let c = commentByID[flag.targetID] {
                text = c.body; image = c.image
            } else if flag.targetType == "font", let f = fontByID[flag.targetID] {
                text = f.name; image = f.image
            } else if flag.targetType == "photo", let p = photoByID[flag.targetID] {
                text = p.caption ?? p.kind.rawValue; image = p.url
            } else if flag.targetType == "cover_photo_removal", let e = removalEditByID[flag.targetID] {
                text = nil; image = e.after.image
            } else if flag.targetType == "source_limit_exemption", let u = authorByID[flag.targetID] {
                text = u.username; image = nil
            } else {
                text = nil; image = nil // contenido ya borrado
            }
            let author = targetAuthors[flag.targetID].flatMap { authorByID[$0] }
            let relatedID = flag.targetType == "font" ? flag.targetID : (flag.fontID
                ?? commentByID[flag.targetID]?.$font.id ?? photoByID[flag.targetID]?.$font.id)
            return FlagResponse(flag, flaggerName: flag.$flagger.id.flatMap { names[$0] },
                                targetText: text, targetImage: image, author: author,
                                font: relatedID.flatMap { allFonts[$0] })
        }
    }

    /// Concede la exención al cupo de cuentas nuevas y consume la solicitud. Es una
    /// decisión administrativa, no una acción de moderador.
    ///
    /// ## Un día o siete, y por qué no «hasta medianoche»
    ///
    /// Lo que casi siempre hace falta es terminar lo que se está haciendo hoy: alguien
    /// delante de un pueblo con quince fuentes por apuntar. Siete días para eso es dar
    /// mucho más de lo que se pidió, y lo caro de esta decisión es justo lo que dura.
    ///
    /// Se mide en **horas desde ahora** y no hasta el final del día natural porque el
    /// servidor va en UTC y la gente va de Chile a Italia: la medianoche de aquí son las
    /// ocho de la tarde en Santiago —cortaría la tarde a la mitad— y las dos de la
    /// madrugada en Roma. Un día es un día en cualquier huso, y además es exactamente la
    /// ventana del cupo que levanta, que ya es de 24 horas móviles.
    @Sendable func approveSourceLimitExemption(req: Request) async throws -> HTTPStatus {
        let admin = try req.auth.require(User.self)
        guard admin.isAdmin else { throw Abort(.forbidden, reason: "Solo para administradores") }
        // Por defecto, siete: es lo que hacía antes, y así un cliente sin actualizar sigue
        // funcionando en vez de conceder algo distinto de lo que su botón promete.
        let dias = (try? req.query.get(Int.self, at: "days")) ?? 7
        guard dias == 1 || dias == 7 else {
            throw AppError(.badRequest, "flag.badExemptionDays", "La excepción es de 1 o 7 días.")
        }
        guard let flag = try await ContentFlag.find(req.parameters.get("flagID"), on: req.db),
              flag.targetType == "source_limit_exemption",
              let user = try await User.find(flag.targetID, on: req.db) else { throw Abort(.notFound) }
        let hasta = Date().addingTimeInterval(Double(dias) * 86_400)
        user.sourceLimitExemptUntil = hasta
        try await req.db.transaction { database in
            try await user.save(on: database)
            try await flag.delete(on: database)
        }
        if let sql = req.db as? SQLDatabase {
            try await sql.raw("""
                INSERT INTO moderation_actions (id, subject_user_id, actor_id, action, reason, created_at)
                VALUES (\(bind: UUID()), \(bind: user.id), \(bind: admin.id),
                        'source_limit_exemption_granted', \(bind: "\(dias)d"), CURRENT_TIMESTAMP)
                """).run()
        }
        // Y se le dice. Sin esto, quien lo pidió no ve NADA cambiar por su lado: o lo
        // vuelve a pedir, o deja de intentarlo creyendo que le han dicho que no.
        if let userID = user.id {
            let push = PushEnvio(req.application)
            let db = req.db
            Task.detached { await SourceLimitNotifier.granted(userID: userID, until: hasta, on: db, push: push) }
        }
        return .noContent
    }

    /// Aprueba una solicitud del autor. Solo actúa si la portada sigue siendo exactamente
    /// la que motivó la petición; si cambió, responde conflicto y no toca la nueva.
    @Sendable func approvePhotoRemoval(req: Request) async throws -> HTTPStatus {
        let admin = try req.auth.require(User.self)
        try requireAdmin(req)
        guard let flag = try await ContentFlag.find(req.parameters.get("flagID"), on: req.db),
              flag.targetType == "cover_photo_removal",
              let edit = try await FontEdit.find(flag.targetID, on: req.db),
              let font = try await Font.find(edit.$font.id, on: req.db) else { throw Abort(.notFound) }
        guard edit.$editor.id == flag.$flagger.id, font.image == edit.after.image else {
            throw AppError(.conflict, "font.photoRequestStale", "La foto principal ha cambiado; la solicitud ya no es aplicable")
        }
        let before = FontInfoSnapshot(font)
        font.image = edit.before.image
        try await font.save(on: req.db)
        try await FontEdit(fontID: try font.requireID(), editorID: try admin.requireID(),
                           before: before, after: FontInfoSnapshot(font)).save(on: req.db)
        try await flag.delete(on: req.db)
        return .noContent
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
    let targetAuthorID: UUID?
    let targetAuthorName: String?
    let targetAuthorCreatedAt: Date?
    let targetAuthorStrikes: Int
    let targetAuthorRestrictedUntil: Date?
    let fontName: String?
    let fontLatitude: Double?
    let fontLongitude: Double?
    let fontModerationState: String?

    init(_ flag: ContentFlag, flaggerName: String?, targetText: String? = nil,
         targetImage: String? = nil, author: User? = nil, font: Font? = nil) {
        self.id = flag.id
        self.flaggerName = flaggerName
        self.targetType = flag.targetType
        self.targetID = flag.targetID
        self.fontID = flag.fontID
        self.reason = flag.reason
        self.createdAt = flag.createdAt
        self.targetText = targetText
        self.targetImage = targetImage
        self.targetAuthorID = author?.id
        self.targetAuthorName = author?.username
        self.targetAuthorCreatedAt = author?.createdAt
        self.targetAuthorStrikes = author?.moderationStrikes ?? 0
        self.targetAuthorRestrictedUntil = author?.postingRestrictedUntil
        self.fontName = font?.name
        self.fontLatitude = font?.latitude
        self.fontLongitude = font?.longitude
        self.fontModerationState = font?.moderationState
    }
}
