import Fluent
import SQLKit
import Vapor

// CRUD de fuentes + búsqueda por cercanía — ver definitions.md (Fonts management).
struct FontController: RouteCollection {
    /// Tope de resultados devueltos por `/fonts/near` (evita respuestas ilimitadas).
    static let maxNearQuantity = 100
    /// Tope de marcadores de `/fonts/in-bounds` (el mapa; markercluster agrupa el resto).
    static let maxInBoundsResults = 3000

    func boot(routes: RoutesBuilder) throws {
        let fonts = routes.grouped("fonts")

        // Lectura pública.
        fonts.get(use: index)
        fonts.get("near", use: near)
        fonts.get("in-bounds", use: inBounds)
        fonts.get("map", use: mapItems)
        fonts.get(":fontID", use: show)
        fonts.get(":fontID", "photo-author", use: photoAuthor)

        // Escritura: requiere token Bearer válido.
        let protected = fonts.grouped(UserToken.authenticator(), User.guardMiddleware())
        // En una ruta larga se pueden encontrar muchas fuentes, pero no 30 en una hora:
        // por encima de eso ya no es alguien caminando.
        protected.grouped(RateLimitMiddleware(scope: "font-create", max: 30, window: 60 * 60,
                                              identity: .authenticatedUser)).post(use: create)
        // Historial de ediciones (moderación): solo admins. Antes de `:fontID`
        // para que "edits" no se interprete como un id de fuente.
        protected.get("edits", use: edits)
        protected.get("moderation", "queue", use: moderationQueue)
        protected.post("edits", ":editID", "revert", use: revertEdit)
        protected.post("edits", ":editID", "review", use: reviewEdit)
        protected.group(":fontID") { font in
            font.put(use: update)
            font.delete(use: destroy)
            // Poner la foto de la fuente, y nada más. Existe aparte de `update` porque
            // «esta fuente no tiene foto y yo estoy delante» es una acción sola, no una
            // edición de la ficha: mandar el `CreateFontDTO` entero obligaría al cliente
            // a reenviar nombre y coordenadas que no ha tocado, y a pisarlos con su copia
            // si alguien los ha corregido mientras tanto.
            font.put("photo", use: setPhoto)
            font.delete("photo", use: undoPhoto)
            font.get("photo-removal-request", use: photoRemovalRequest)
            font.post("photo-removal-request", use: requestPhotoRemoval)
            font.delete("photo-removal-request", use: cancelPhotoRemoval)
            // Promover la foto de una reseña a foto principal (creador/admin).
            font.post("photo", "from-comment", ":commentID", use: setPhotoFromComment)
            // Historial de ESTA fuente: admins y quien tenga `viewFontHistory` (nivel 4).
            font.get("history", use: fontHistory)
            // Esconder del mapa sin borrar. Las dos se deshacen.
            font.post("duplicate-of", use: markDuplicate)
            font.delete("duplicate-of", use: unmarkDuplicate)
            font.post("retire", use: retire)
            font.delete("retire", use: unretire)
            // Moderación de abuso: cuarentena reversible, solo moderadores.
            font.post("moderation", "hide", use: hideAbuse)
            font.delete("moderation", "hide", use: restoreAbuse)
            font.post("moderation", "review", use: reviewModeration)
        }
    }

    /// Quién puso la primera foto de esta fuente. Público.
    ///
    /// La ficha lo intentaba deducir con lo que tenía —la reseña con foto más antigua— y
    /// se quedaba en «no consta quién la puso» en el caso más común de las importadas: la
    /// foto llegó por el **formulario de editar**, y las ediciones no son públicas. El
    /// dato existe, solo que en una tabla que la ficha no puede leer; así que lo resuelve
    /// el servidor, que sí puede, y devuelve únicamente el nombre.
    ///
    /// Mismo orden que usa `ContributionScore` para pagar la insignia, y a propósito: si
    /// la ficha dijera un nombre y el marcador pagara a otro, uno de los dos mentiría.
    /// 1. la reseña con foto más antigua, 2. la edición más antigua que puso `image`,
    /// 3. el creador, si la fuente nació con foto y no hay ni una cosa ni la otra.
    struct PhotoAuthor: Content {
        /// `null` si la fuente no tiene foto, o si no hay forma de saber quién la puso
        /// (importadas antiguas cuyo `image` no dejó rastro en ningún sitio).
        let username: String?

        func encode(to encoder: any Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(username, forKey: .username)
        }
    }

    @Sendable func photoAuthor(req: Request) async throws -> PhotoAuthor {
        guard let fontID = req.parameters.get("fontID", as: UUID.self) else {
            throw AppError(.badRequest, "font.badID", "Identificador de fuente no válido")
        }
        guard let font = try await Font.query(on: req.db).filter(\.$id == fontID).first() else {
            throw AppError(.notFound, "font.notFound", "Fuente no encontrada")
        }
        guard font.image != nil else { return PhotoAuthor(username: nil) }

        let conFoto = try await FontComment.query(on: req.db)
            .filter(\.$font.$id == fontID)
            .filter(\.$image != nil)
            .sort(\.$createdAt, .ascending)
            .with(\.$user)
            .first()
        let edicion = try await FontEdit.query(on: req.db)
            .filter(\.$font.$id == fontID)
            .sort(\.$createdAt, .ascending)
            .with(\.$editor)
            .all()
            .first { $0.before.image != $0.after.image && $0.after.image != nil }

        // La más antigua de las dos gana; el creador solo si no hay ninguna.
        let candidatas: [(Date, String?)] = [
            conFoto.flatMap { c in c.createdAt.map { ($0, c.$user.value??.username) } },
            edicion.flatMap { e in e.createdAt.map { ($0, e.$editor.value??.username) } },
        ].compactMap { $0 }
        if let primera = candidatas.min(by: { $0.0 < $1.0 }) {
            return PhotoAuthor(username: primera.1)
        }
        let creador = try await font.$creator.get(on: req.db)
        return PhotoAuthor(username: creador?.username)
    }

    /// PUT /fonts/:fontID/photo — pone la foto de la fuente y nada más.
    ///
    /// Misma asimetría de siempre (`update`): la **primera** la puede poner cualquiera
    /// con sesión —casi ninguna fuente importada tiene creador, así que si solo pudiera
    /// él, esas fichas no tendrían foto nunca— y **sustituir** una que ya existe sigue
    /// siendo del creador o de un admin.
    @Sendable func setPhoto(req: Request) async throws -> Font {
        let font = try await find(req)
        let user = try req.auth.require(User.self)
        try user.requireCanContribute()
        struct PhotoDTO: Content { let image: String }
        let dto = try req.content.decode(PhotoDTO.self)
        guard !dto.image.trimmingCharacters(in: .whitespaces).isEmpty else {
            throw AppError(.badRequest, "image.missing", "Falta la imagen")
        }
        let anterior = font.image
        if anterior != nil, !canManage(user: user, font: font) {
            throw AppError(.forbidden, "font.photoExists", "Esta fuente ya tiene foto: solo el creador o un administrador puede cambiarla")
        }
        let before = FontInfoSnapshot(font)
        font.image = dto.image
        try await font.save(on: req.db)
        // Rastro en el historial, como cualquier otro cambio de la ficha: así se puede
        // revertir desde el panel y no aparece una foto de la nada.
        try await FontEdit(fontID: try font.requireID(), editorID: try? user.requireID(),
                           before: before, after: FontInfoSnapshot(font)).save(on: req.db)
        // La anterior ya no la usa nadie.
        if let anterior { try? await req.imageStorage.delete(anterior) }
        return font
    }

    /// Deshace una foto recién subida. El límite se comprueba también en el servidor:
    /// ocultar el botón pasado un rato no sería una autorización real.
    @Sendable func undoPhoto(req: Request) async throws -> Font {
        let font = try await find(req)
        let user = try req.auth.require(User.self)
        let edit = try await currentPhotoEdit(font: font, userID: try user.requireID(), on: req.db)
        guard let createdAt = edit.createdAt, Date().timeIntervalSince(createdAt) <= 5 * 60 else {
            throw AppError(.forbidden, "font.photoUndoExpired", "El plazo para deshacer esta foto ha terminado")
        }
        let before = FontInfoSnapshot(font)
        font.image = edit.before.image
        try await font.save(on: req.db)
        try await FontEdit(fontID: try font.requireID(), editorID: try user.requireID(),
                           before: before, after: FontInfoSnapshot(font)).save(on: req.db)
        if let editID = edit.id {
            let requests = try await ContentFlag.query(on: req.db)
                .filter(\.$targetType == "cover_photo_removal")
                .filter(\.$targetID == editID).all()
            for request in requests { try await request.delete(on: req.db) }
        }
        return font
    }

    struct PhotoRemovalRequestStatus: Content {
        let canRequest: Bool
        let pending: Bool
        let canUndo: Bool
    }

    /// Estado de la petición del usuario actual. La identidad de la foto es el FontEdit
    /// exacto que la instaló, no solo la fuente: una petición vieja no puede retirar una
    /// portada que alguien haya sustituido después.
    @Sendable func photoRemovalRequest(req: Request) async throws -> PhotoRemovalRequestStatus {
        let font = try await find(req)
        let userID = try req.auth.require(User.self).requireID()
        guard let edit = try? await currentPhotoEdit(font: font, userID: userID, on: req.db),
              let editID = edit.id else {
            return .init(canRequest: false, pending: false, canUndo: false)
        }
        let pending = try await ContentFlag.query(on: req.db)
            .filter(\.$flagger.$id == userID)
            .filter(\.$targetType == "cover_photo_removal")
            .filter(\.$targetID == editID).first() != nil
        let canUndo = edit.createdAt.map { Date().timeIntervalSince($0) <= 5 * 60 } ?? false
        return .init(canRequest: true, pending: pending, canUndo: canUndo)
    }

    @Sendable func requestPhotoRemoval(req: Request) async throws -> HTTPStatus {
        let font = try await find(req)
        let user = try req.auth.require(User.self)
        try user.requireCanContribute()
        let userID = try user.requireID()
        let edit = try await currentPhotoEdit(font: font, userID: userID, on: req.db)
        let editID = try edit.requireID()
        let exists = try await ContentFlag.query(on: req.db)
            .filter(\.$flagger.$id == userID)
            .filter(\.$targetType == "cover_photo_removal")
            .filter(\.$targetID == editID).first()
        if exists == nil {
            try await ContentFlag(flaggerID: userID, targetType: "cover_photo_removal",
                                  targetID: editID, fontID: try font.requireID()).save(on: req.db)
        }
        return .created
    }

    @Sendable func cancelPhotoRemoval(req: Request) async throws -> HTTPStatus {
        let font = try await find(req)
        let userID = try req.auth.require(User.self).requireID()
        guard let edit = try? await currentPhotoEdit(font: font, userID: userID, on: req.db),
              let editID = edit.id else { return .noContent }
        let flags = try await ContentFlag.query(on: req.db)
            .filter(\.$flagger.$id == userID)
            .filter(\.$targetType == "cover_photo_removal")
            .filter(\.$targetID == editID).all()
        for flag in flags { try await flag.delete(on: req.db) }
        return .noContent
    }

    private func currentPhotoEdit(font: Font, userID: UUID, on db: any Database) async throws -> FontEdit {
        guard let image = font.image else {
            throw AppError(.badRequest, "font.noPhoto", "La fuente no tiene foto")
        }
        let edits = try await FontEdit.query(on: db)
            .filter(\.$font.$id == font.requireID())
            .filter(\.$editor.$id == userID)
            .sort(\.$createdAt, .descending).all()
        guard let edit = edits.first(where: { $0.after.image == image && $0.before.image != $0.after.image }) else {
            throw AppError(.forbidden, "font.notPhotoAuthor", "Solo quien subió la foto actual puede solicitar retirarla")
        }
        return edit
    }

    /// POST /fonts/:fontID/photo/from-comment/:commentID
    /// Elige la foto de una reseña como foto principal de la fuente.
    /// Se copia el objeto (referencia independiente) para no compartir fichero con la reseña.
    ///
    /// Sustituir la foto sigue siendo cosa del creador o de un admin; poner la primera
    /// lo puede hacer cualquiera, por la misma razón que en `update`: casi ninguna fuente
    /// importada tiene creador, y la foto ya está hecha — está en la reseña.
    @Sendable func setPhotoFromComment(req: Request) async throws -> Font {
        let font = try await find(req)
        let user = try req.auth.require(User.self)
        try user.requireCanContribute()
        if font.image != nil, !canManage(user: user, font: font) {
            throw AppError(.forbidden, "font.photoExists", "Esta fuente ya tiene foto: solo el creador o un administrador puede cambiarla")
        }
        let fontID = try font.requireID()
        guard let comment = try await FontComment.find(req.parameters.get("commentID"), on: req.db),
              comment.$font.id == fontID else {
            throw AppError(.notFound, "comment.notFound", "La reseña no existe o no es de esta fuente")
        }
        guard comment.image != nil else {
            throw AppError(.badRequest, "comment.noPhoto", "La reseña no tiene foto")
        }
        // Sustituir una portada que ya existe sigue siendo del creador o de un admin, y
        // por eso se borra a mano la anterior. Poner la PRIMERA pasa por `CoverPhoto`,
        // el mismo camino que recorre una reseña recién publicada: misma regla y mismo
        // rastro en el historial.
        if let oldImage = font.image {
            font.image = try await req.imageStorage.copy(comment.image!)
            try await font.save(on: req.db)
            // Ya no lo comparte nadie (la reseña sigue con el suyo): se puede borrar.
            try? await req.imageStorage.delete(oldImage)
        } else {
            try await CoverPhoto.adopt(font: font, from: comment,
                                       storage: req.imageStorage, on: req.db)
        }
        return font
    }

    @Sendable func create(req: Request) async throws -> Response {
        let user = try req.auth.require(User.self)
        try user.requireCanContribute()
        try CreateFontDTO.validate(content: req)
        let dto = try req.content.decode(CreateFontDTO.self)
        let creado = dto.name?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        if let creado, creado.count > 120 || creado.contains("\n") || creado.lowercased().contains("http://") || creado.lowercased().contains("https://") {
            throw AppError(.badRequest, "font.badName", "El nombre debe ser un topónimo breve, sin enlaces")
        }

        // Una cuenta nueva sin historial fiable empieza con un cupo pequeño. Se amplía
        // sola al cumplir una semana. El límite global por usuario sigue protegiendo el
        // endpoint después; éste frena específicamente cuentas desechables.
        if !user.isAdmin, !user.hasSourceLimitExemption,
           let userID = user.id, let joined = user.createdAt,
           Date().timeIntervalSince(joined) < 7 * 86_400 {
            let today = try await Font.query(on: req.db)
                .filter(\.$creator.$id == userID)
                .filter(\.$createdAt > Date().addingTimeInterval(-86_400))
                .count()
            guard today < 5 else {
                throw RateLimitExceeded(retryAfter: 24 * 60 * 60, code: "font.newAccountLimit")
            }
        }

        // Evita el duplicado accidental. El cliente puede confirmarlo expresamente tras
        // enseñar las vecinas; la API nunca decide sola que dos puntos son el mismo.
        if dto.allowNearbyDuplicate != true {
            let delta = 0.0005 // caja pequeña; la decisión exacta se hace con haversine
            let nearby = try await Font.visible(on: req.db)
                .filter(\.$latitude >= dto.latitude - delta).filter(\.$latitude <= dto.latitude + delta)
                .filter(\.$longitude >= dto.longitude - delta).filter(\.$longitude <= dto.longitude + delta)
                .all()
            if nearby.contains(where: { haversineKm(dto.latitude, dto.longitude, $0.latitude, $0.longitude) <= 0.025 }) {
                throw AppError(.conflict, "font.nearDuplicate", "Ya hay una fuente a menos de 25 metros; revisa si es la misma")
            }
        }
        let font = Font(name: creado, latitude: dto.latitude, longitude: dto.longitude,
                        image: dto.image, description: dto.description, source: dto.source,
                        drinkable: dto.drinkable, creatorID: try user.requireID(),
                        queuedOffline: req.headers.first(name: "X-FontApp-Queued-Offline") == "1")
        try await font.save(on: req.db)

        // País y región, heredados de la fuente conocida más cercana (ver `inheritZone`).
        // En segundo plano: es un dato para filtros y estadística, no algo que deba
        // hacer esperar a quien está en el monte con una barra de cobertura.
        let app = req.application
        let fontID = try font.requireID()
        Task.detached { await Self.inheritZone(fontID: fontID, lat: dto.latitude, long: dto.longitude, db: app.db, logger: app.logger) }

        let response = Response(status: .created)
        try response.content.encode(font)
        return response
    }

    @Sendable func hideAbuse(req: Request) async throws -> Font {
        let actor = try req.auth.require(User.self)
        guard actor.canModerate else { throw Abort(.forbidden) }
        struct DTO: Content { let reason: String }
        let dto = try req.content.decode(DTO.self)
        let allowed = ["spam", "fake", "abuse"]
        guard allowed.contains(dto.reason) else { throw Abort(.badRequest, reason: "Motivo no válido") }
        let font = try await find(req)
        guard !font.moderationState.hasPrefix("hidden_") else { return font }
        let creatorID = font.$creator.id
        try await req.db.transaction { db in
            font.moderationState = "hidden_\(dto.reason)"
            font.moderationReason = dto.reason
            font.moderatedAt = Date()
            font.$moderatedBy.id = try actor.requireID()
            try await font.save(on: db)
            if let creatorID, let creator = try await User.find(creatorID, on: db) {
                creator.moderationStrikes += 1
                if creator.moderationStrikes == 2 {
                    creator.postingRestrictedUntil = Date().addingTimeInterval(7 * 86_400)
                } else if creator.moderationStrikes >= 3 {
                    creator.postingRestrictedUntil = Date().addingTimeInterval(365 * 86_400)
                }
                try await creator.save(on: db)
            }
            // La ficha falsa no puede conservar ni generar gotas. Se anulan también las
            // ya liquidadas; `settledAt` se conserva para poder restaurarlas si la
            // decisión de moderación se revoca.
            if let fontID = font.id {
                let events = try await ContributionEvent.query(on: db)
                    .filter(\.$font.$id == fontID)
                    .filter(\.$status != .void)
                    .all()
                for event in events {
                    event.status = .void
                    event.voidReason = "moderación confirmada: \(dto.reason)"
                    try await event.save(on: db)
                }
            }
            try await Self.audit(db, fontID: font.id, subjectID: creatorID, actorID: actor.id,
                                 action: "hide", reason: dto.reason)
        }
        return font
    }

    @Sendable func restoreAbuse(req: Request) async throws -> Font {
        let actor = try req.auth.require(User.self)
        guard actor.canModerate else { throw Abort(.forbidden) }
        let font = try await find(req)
        guard font.moderationState != "visible" else { return font }
        let confirmed = font.moderationState.hasPrefix("hidden_")
        let previousReason = font.moderationReason
        let creatorID = font.$creator.id
        try await req.db.transaction { db in
            font.moderationState = "visible"
            font.moderationReason = nil
            font.moderatedAt = Date()
            font.$moderatedBy.id = try actor.requireID()
            try await font.save(on: db)
            if confirmed, let creatorID, let creator = try await User.find(creatorID, on: db) {
                creator.moderationStrikes = max(0, creator.moderationStrikes - 1)
                if creator.moderationStrikes < 2 { creator.postingRestrictedUntil = nil }
                try await creator.save(on: db)
            }
            if confirmed, let fontID = font.id {
                let events = try await ContributionEvent.query(on: db)
                    .filter(\.$font.$id == fontID)
                    .filter(\.$status == .void)
                    .all()
                    .filter { $0.voidReason?.hasPrefix("moderación confirmada:") == true }
                for event in events {
                    event.status = event.settledAt == nil ? .pending : .settled
                    event.voidReason = nil
                    try await event.save(on: db)
                }
            }
            try await Self.audit(db, fontID: font.id, subjectID: creatorID, actorID: actor.id,
                                 action: "restore", reason: previousReason)
        }
        return font
    }

    /// GET /fonts/moderation/queue — altas recientes hechas por cuentas que aún no
    /// habían cumplido una semana. No afirma que sean malas: es una bandeja de vigilancia
    /// separada de las denuncias. Las ya revisadas no vuelven a aparecer.
    @Sendable func moderationQueue(req: Request) async throws -> [ModerationSourceResponse] {
        let actor = try req.auth.require(User.self)
        guard actor.canModerate else { throw Abort(.forbidden) }
        guard let sql = req.db as? SQLDatabase else { throw Abort(.internalServerError) }
        let cutoff = Date().addingTimeInterval(-7 * 86_400)
        struct Row: Decodable { let id: UUID }
        // El filtro se hace ANTES del LIMIT. Traer primero las últimas 250 y filtrar en
        // memoria ocultaría una alta sospechosa si esa semana hubiera mucha actividad de
        // cuentas antiguas: la cola fallaría precisamente cuando más trabajo tuviera.
        let ids = try await sql.raw("""
            SELECT f.id
            FROM fonts f
            JOIN users u ON u.id = f.created_by
            WHERE f.created_at >= \(bind: cutoff)
              AND f.moderation_state = 'visible'
              AND f.created_at < u.created_at + INTERVAL '7 days'
              AND NOT EXISTS (
                SELECT 1 FROM moderation_actions ma
                WHERE ma.font_id = f.id AND ma.action = 'review'
              )
            ORDER BY f.created_at DESC
            LIMIT 50
            """).all(decoding: Row.self).map(\.id)
        if ids.isEmpty { return [] }

        let candidates = try await Font.query(on: req.db)
            .filter(\.$id ~~ ids)
            .with(\.$creator)
            .all()
        let order = Dictionary(uniqueKeysWithValues: ids.enumerated().map { ($0.element, $0.offset) })
        return candidates.compactMap { font in
            guard let creator = font.$creator.value ?? nil else { return nil }
            return ModerationSourceResponse(font: font, creator: creator)
        }.sorted { order[$0.id, default: .max] < order[$1.id, default: .max] }
    }

    /// Marca una alta reciente como comprobada sin modificarla. Vive en el historial de
    /// moderación para que dos moderadores compartan la misma cola y quede auditoría.
    @Sendable func reviewModeration(req: Request) async throws -> HTTPStatus {
        let actor = try req.auth.require(User.self)
        guard actor.canModerate else { throw Abort(.forbidden) }
        let font = try await find(req)
        try await Self.audit(req.db, fontID: font.id, subjectID: font.$creator.id,
                             actorID: actor.id, action: "review", reason: "new_account")
        return .noContent
    }

    private static func audit(_ db: any Database, fontID: UUID?, subjectID: UUID?, actorID: UUID?,
                              action: String, reason: String?) async throws {
        guard let sql = db as? SQLDatabase else { return }
        try await sql.raw("""
            INSERT INTO moderation_actions (id, font_id, subject_user_id, actor_id, action, reason, created_at)
            VALUES (\(bind: UUID()), \(bind: fontID), \(bind: subjectID), \(bind: actorID),
                    \(bind: action), \(bind: reason), CURRENT_TIMESTAMP)
            """).run()
    }

    /// Copia país/región de la fuente ya clasificada más cercana.
    ///
    /// La alternativa —resolver el punto contra las fronteras reales— obligaría a llevar
    /// el GeoJSON dentro del contenedor y tenerlo en memoria para usarlo cuatro veces al
    /// día. Con miles de fuentes ya clasificadas, la más próxima suele estar a menos de
    /// un par de kilómetros y su zona es la buena. Los pocos casos de frontera los corrige
    /// después `populate-regions`, que sigue siendo la autoridad.
    static func inheritZone(fontID: UUID, lat: Double, long: Double, db: any Database, logger: Logger) async {
        // ~55 km de caja: si en ese radio no hay ninguna fuente clasificada, es que la
        // zona no está poblada y no hay nada mejor que adivinar; mejor dejarlo nulo.
        let delta = 0.5
        do {
            let candidates = try await Font.query(on: db)
                .filter(\.$region != nil)
                .filter(\.$latitude >= lat - delta).filter(\.$latitude <= lat + delta)
                .filter(\.$longitude >= long - delta).filter(\.$longitude <= long + delta)
                .limit(500)
                .all()
            guard let nearest = candidates.min(by: {
                haversineKm(lat, long, $0.latitude, $0.longitude) < haversineKm(lat, long, $1.latitude, $1.longitude)
            }) else { return }
            guard let font = try await Font.find(fontID, on: db) else { return }
            font.country = nearest.country
            font.region = nearest.region
            font.admin1 = nearest.admin1
            try await font.save(on: db)
        } catch {
            logger.warning("No s'ha pogut deduir la zona de la font \(fontID): \(error)")
        }
    }

    /// GET /fonts?page=&per=&search= — listado paginado; `search` filtra por nombre (ILIKE, insensible a mayúsculas).
    @Sendable func index(req: Request) async throws -> Page<Font> {
        let query = Font.visible(on: req.db).sort(\.$name)
        // El patrón se acota y se escapa: ver `SearchTerm` (un ILIKE con una cadena
        // enorme cuesta segundos de CPU por petición).
        if let raw = req.query[String.self, at: "search"], let patron = SearchTerm.likePattern(raw) {
            query.filter(\.$name, .custom("ILIKE"), patron)
        }
        return try await query.paginate(SafePage.from(req))
    }

    @Sendable func show(req: Request) async throws -> Font {
        try await find(req)
    }

    @Sendable func update(req: Request) async throws -> Font {
        try CreateFontDTO.validate(content: req)
        let font = try await find(req)
        let user = try req.auth.require(User.self)
        try user.requireCanContribute()
        let dto = try req.content.decode(CreateFontDTO.self)
        // Edición abierta (estilo wiki): cualquier usuario autenticado puede corregir
        // la información descriptiva de una fuente (muchas se llaman solo "Font" o tienen
        // un nombre popular / historia local que aportar).
        let before = FontInfoSnapshot(font)
        // Vacío ⇒ sin nombre. Es la vuelta atrás de un relleno mal puesto, y la única
        // forma de que quien corrige una ficha no tenga que inventarse un nombre.
        font.name = dto.name?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        font.description = dto.description
        font.source = dto.source
        font.drinkable = dto.drinkable
        // La ubicación y sustituir la foto son sensibles (mover el pin, tapar una foto
        // buena con una mala): se reservan al creador o a un admin.
        //
        // La ubicación tiene además una segunda puerta: quien haya llegado al nivel que
        // la abre (fase 6, ver `Capabilities`) puede corregir el pin de una fuente que no
        // creó. Es la que más falta hace y la menos peligrosa de las tres: las ~6.700
        // fuentes importadas no tienen creador, así que hoy solo un admin puede moverlas
        // —el mismo callejón sin salida que ya tenía la primera foto—, y un movimiento
        // queda en `FontInfoSnapshot` con lat/long, o sea que es reversible desde el
        // panel. Sustituir foto y borrar NO se abren: la primera invita a la guerra de
        // ediciones y la segunda no se deshace.
        // El `||` no vale: el lado derecho es `async throws` y no cabe en un autoclosure.
        let puedeGestionar = canManage(user: user, font: font)
        var puedeReubicar = puedeGestionar
        if !puedeReubicar {
            puedeReubicar = try await Capabilities.has(.relocateAnyFont, user, on: req.db)
        }
        if puedeReubicar {
            font.latitude = dto.latitude
            font.longitude = dto.longitude
        }
        if puedeGestionar {
            let oldImage = font.image
            font.image = dto.image
            try await font.save(on: req.db)
            if let oldImage, oldImage != dto.image { try? await req.imageStorage.delete(oldImage) }
        } else {
            // Poner la PRIMERA foto sí lo puede hacer cualquiera. La mayoría de fuentes
            // vienen importadas (ACA, OSM) y no tienen creador, así que con la regla de
            // arriba a secas nunca tendrían foto: no hay a quién pedírsela. Y es una
            // asimetría real: añadir donde no había nada solo puede mejorar la ficha,
            // mientras que sustituir puede empeorarla.
            if font.image == nil, let nueva = dto.image {
                font.image = nueva
            }
            try await font.save(on: req.db)
        }
        // Deja rastro del cambio de información (historial de moderación), solo si
        // algún campo editable cambió realmente.
        let after = FontInfoSnapshot(font)
        if before != after {
            try await FontEdit(fontID: try font.requireID(), editorID: try? user.requireID(), before: before, after: after).save(on: req.db)
        }
        return font
    }

    /// GET /fonts/edits?page=&per= — historial de ediciones de información, más
    /// recientes primero (solo admins). Enriquecido con nombre de fuente y editor.
    @Sendable func edits(req: Request) async throws -> [FontEditResponse] {
        try requireAdmin(req)
        let page = max(req.query[Int.self, at: "page"] ?? 1, 1)
        let per = min(max(req.query[Int.self, at: "per"] ?? 50, 1), 100)
        let query = FontEdit.query(on: req.db).sort(\.$createdAt, .descending)
        // `?unreviewed=true` → solo la cola pendiente (para el panel).
        if req.query[Bool.self, at: "unreviewed"] == true {
            query.filter(\.$reviewedAt == nil)
        }
        let edits = try await query
            .range(((page - 1) * per)..<(page * per))
            .all()
        let editorNames = try await User.usernames(for: edits.compactMap { $0.$editor.id }, on: req.db)
        let fontIDs = Array(Set(edits.map { $0.$font.id }))
        let fonts = fontIDs.isEmpty ? [] : try await Font.query(on: req.db).filter(\.$id ~~ fontIDs).all()
        let fontNames = Dictionary(uniqueKeysWithValues: fonts.compactMap { f -> (UUID, String)? in
            guard let id = f.id, let n = f.name else { return nil }
            return (id, n)
        })
        return edits.map { e in
            FontEditResponse(e, editorName: e.$editor.id.flatMap { editorNames[$0] }, currentFontName: fontNames[e.$font.id])
        }
    }

    /// POST /fonts/edits/:editID/revert — restaura la información al estado previo
    /// a esa edición (solo admins). No borra el registro: crea uno nuevo, dejando
    /// el propio revert en el historial.
    @Sendable func revertEdit(req: Request) async throws -> Font {
        // Solo admins. Estuvo abierta por nivel (`revertAnyEdit`, nivel 8) y se retiró:
        // nunca tuvo puerta —el historial de ediciones es de moderación, así que ni con
        // el nivel había dónde pulsar— y sobre todo es la misma pelea que el proyecto ya
        // había decidido no abrir. Sustituir una foto que existe no se concede por nivel
        // porque «invita a la guerra de ediciones»; deshacer el texto que escribió otro
        // es esa guerra con otro campo.
        try requireAdmin(req)
        let admin = try req.auth.require(User.self)
        guard let edit = try await FontEdit.find(req.parameters.get("editID"), on: req.db) else {
            throw Abort(.notFound)
        }
        guard let font = try await Font.find(edit.$font.id, on: req.db) else {
            throw AppError(.notFound, "font.notFound", "La fuente ya no existe")
        }
        let before = FontInfoSnapshot(font)
        font.name = edit.before.name
        font.description = edit.before.description
        font.source = edit.before.source
        font.drinkable = edit.before.drinkable
        // Solo si la edición guardó ubicación (las anteriores a esta función, no).
        if let lat = edit.before.latitude, let lon = edit.before.longitude {
            font.latitude = lat
            font.longitude = lon
        }
        // La foto se revierte solo si la edición la cambió de verdad. Comparar contra
        // `after` evita que una edición antigua (sin `image` en el JSON) borre la foto
        // actual al revertirla: ahí ambos son nil y no se toca nada.
        if edit.before.image != edit.after.image {
            let actual = font.image
            font.image = edit.before.image
            if let actual, actual != font.image { try? await req.imageStorage.delete(actual) }
        }
        try await font.save(on: req.db)
        let after = FontInfoSnapshot(font)
        if before != after {
            try await FontEdit(fontID: try font.requireID(), editorID: try? admin.requireID(), before: before, after: after).save(on: req.db)
        }
        return font
    }

    /// POST /fonts/edits/:editID/review — marca una edición como revisada (✓), para
    /// sacarla de la cola del panel.
    ///
    /// Solo triaje: **no cambia la fuente**, así que el riesgo es cero y lo único que
    /// hace es repartir un trabajo que hoy solo puede hacer un admin. Por eso se abre por
    /// nivel (`reviewEdit`, nivel 7) y deshacer una edición no.
    @Sendable func reviewEdit(req: Request) async throws -> HTTPStatus {
        _ = try await requireAdminOr(.reviewEdit, req,
                                     reason: "Todavía no puedes revisar ediciones")
        guard let edit = try await FontEdit.find(req.parameters.get("editID"), on: req.db) else {
            throw Abort(.notFound)
        }
        edit.reviewedAt = Date()
        try await edit.save(on: req.db)
        return .noContent
    }

    // MARK: - Capacidades por nivel sobre una fuente

    /// Admin, o quien tenga la capacidad. Devuelve el usuario para poder firmar la acción.
    private func requireAdminOr(_ cap: Capabilities.Capability, _ req: Request,
                                reason: String) async throws -> User {
        let user = try req.auth.require(User.self)
        if user.isAdmin { return user }
        guard try await Capabilities.has(cap, user, on: req.db) else {
            // El código sale de la **propia capacidad** (`capability.retireFont`) y no
            // se escribe en cada sitio que llama: son siete y una lista paralela se
            // separaría del enum a la primera capacidad nueva. Al añadir una, la
            // traducción que falte hace que el cliente caiga en la frase del servidor,
            // que es castellano pero no es una clave cruda en pantalla.
            throw AppError(.forbidden, "capability.\(cap.rawValue)", reason)
        }
        return user
    }

    /// GET /fonts/:fontID/history — quién ha cambiado qué en esta fuente.
    ///
    /// Solo lectura y **acotado a una fuente**, al revés que `/fonts/edits`, que es la
    /// cola global de moderación y sigue siendo de admins. Es el contrapeso de poder
    /// mover pines ajenos: sin esto, una reubicación mala no la ve nadie.
    @Sendable func fontHistory(req: Request) async throws -> [FontEditResponse] {
        _ = try await requireAdminOr(.viewFontHistory, req,
                                     reason: "Todavía no puedes ver el historial de una fuente")
        let font = try await find(req)
        let fontID = try font.requireID()
        let edits = try await FontEdit.query(on: req.db)
            .filter(\.$font.$id == fontID)
            .sort(\.$createdAt, .descending)
            .limit(50)
            .all()
        let nombres = try await User.usernames(for: edits.compactMap { $0.$editor.id }, on: req.db)
        return edits.map {
            FontEditResponse($0, editorName: $0.$editor.id.flatMap { nombres[$0] },
                             currentFontName: font.name)
        }
    }

    struct DuplicateDTO: Content { let of: UUID }

    /// POST /fonts/:fontID/duplicate-of — esta ficha es la misma agua que otra.
    ///
    /// No borra: la esconde del mapa y la deja apuntando a la buena. Las reseñas y fotos
    /// se quedan donde están, porque son ciertas — alguien fue y vio agua.
    @Sendable func markDuplicate(req: Request) async throws -> Font {
        let user = try await requireAdminOr(.markDuplicate, req,
                                            reason: "Todavía no puedes marcar duplicados")
        try user.requireCanContribute()
        let font = try await find(req)
        let dto = try req.content.decode(DuplicateDTO.self)
        let id = try font.requireID()
        guard dto.of != id else {
            throw AppError(.badRequest, "font.duplicateSelf", "Una fuente no puede ser duplicada de sí misma")
        }
        guard let buena = try await Font.find(dto.of, on: req.db) else {
            throw AppError(.notFound, "font.notFound", "La fuente indicada no existe")
        }
        // Sin cadenas: si la buena ya apunta a otra, se apunta al final de la cadena. Con
        // A→B y luego B→C, A se quedaba señalando a una ficha escondida y el enlace de
        // «ver la buena» no llevaba a ninguna parte.
        guard buena.$duplicateOf.id == nil else {
            throw AppError(.conflict, "font.alreadyDuplicate", "Esa fuente ya está marcada como duplicada de otra")
        }
        font.$duplicateOf.id = dto.of
        try await font.save(on: req.db)
        avisaSeguidores(req, font: font, razon: "duplicate")
        return font
    }

    /// DELETE /fonts/:fontID/duplicate-of — no era duplicada; vuelve al mapa.
    @Sendable func unmarkDuplicate(req: Request) async throws -> Font {
        _ = try await requireAdminOr(.markDuplicate, req,
                                     reason: "Todavía no puedes marcar duplicados")
        let font = try await find(req)
        font.$duplicateOf.id = nil
        try await font.save(on: req.db)
        return font
    }

    /// POST /fonts/:fontID/retire — ya no existe sobre el terreno.
    ///
    /// Pide, además del nivel, `Capabilities.retireGoneReports` testimonios `gone`
    /// **de personas distintas**. Retirar es la única de estas acciones que hace
    /// desaparecer un punto para todo el mundo, y no debería ser la opinión de uno.
    @Sendable func retire(req: Request) async throws -> Font {
        let user = try await requireAdminOr(.retireFont, req,
                                            reason: "Todavía no puedes retirar fuentes del mapa")
        try user.requireCanContribute()
        let font = try await find(req)
        let fontID = try font.requireID()
        let testigos = try await FontComment.query(on: req.db)
            .filter(\.$font.$id == fontID)
            .filter(\.$waterStatus == "gone")
            .all()
        let distintos = Set(testigos.compactMap { $0.$user.id }).count
        guard distintos >= Capabilities.retireGoneReports || user.isAdmin else {
            throw Abort(.badRequest, reason: "Hacen falta \(Capabilities.retireGoneReports) personas distintas que hayan reseñado la fuente como desaparecida")
        }
        font.retiredAt = Date()
        font.$retiredBy.id = try user.requireID()
        defer { avisaSeguidores(req, font: font, razon: "retired") }
        try await font.save(on: req.db)
        return font
    }

    /// DELETE /fonts/:fontID/retire — sigue ahí; vuelve al mapa.
    @Sendable func unretire(req: Request) async throws -> Font {
        _ = try await requireAdminOr(.retireFont, req,
                                     reason: "Todavía no puedes retirar fuentes del mapa")
        let font = try await find(req)
        font.retiredAt = nil
        font.$retiredBy.id = nil
        try await font.save(on: req.db)
        return font
    }

    /// Avisa por la campana a quien tenga la fuente guardada. Esconder una fuente es lo
    /// más gordo que le puede pasar —desaparece del mapa para todo el mundo— y quien la
    /// tenía apuntada para el domingo merece enterarse antes de ir.
    ///
    /// Sin esperar y sin propagar errores: la fuente ya está escondida, que es lo que
    /// pedía quien pulsó el botón.
    private func avisaSeguidores(_ req: Request, font: Font, razon: String) {
        guard let fontID = font.id else { return }
        let actorID = try? req.auth.require(User.self).requireID()
        let db = req.db
        Task.detached {
            await FontWatchNotifier.notify(fontID: fontID, change: .hidden(reason: razon),
                                           actorID: actorID, on: db)
        }
    }

    private func requireAdmin(_ req: Request) throws {
        let user = try req.auth.require(User.self)
        guard user.isAdmin else { throw Abort(.forbidden, reason: "Solo para administradores") }
    }

    @Sendable func destroy(req: Request) async throws -> HTTPStatus {
        let font = try await find(req)
        try requireCanManage(req, font: font)
        // Limpia las imágenes asociadas (de la fuente y de sus reseñas) antes de borrar.
        if let image = font.image { try? await req.imageStorage.delete(image) }
        let commentImages = try await FontComment.query(on: req.db)
            .filter(\.$font.$id == font.requireID())
            .all()
            .compactMap(\.image)
        for image in commentImages { try? await req.imageStorage.delete(image) }
        try await font.delete(on: req.db)
        return .noContent
    }

    /// GET /fonts/near?lat={}&long={}&quantity={}
    /// Prefiltro por bounding box (indexado por lat/long) + haversine + orden por distancia.
    /// TODO: a escala real, sustituir por PostGIS (columna `geography` + índice GiST).
    @Sendable func near(req: Request) async throws -> [FontSummary] {
        try NearQuery.validate(query: req)
        let params = try req.query.decode(NearQuery.self)
        let quantity = min(max(1, params.quantity ?? 10), Self.maxNearQuantity)
        let delta = 0.5 // ~55 km a nivel del ecuador; suficiente como prefiltro.

        let candidates = try await Font.visible(on: req.db)
            .filter(\.$latitude >= params.lat - delta)
            .filter(\.$latitude <= params.lat + delta)
            .filter(\.$longitude >= params.long - delta)
            .filter(\.$longitude <= params.long + delta)
            .limit(Self.maxNearQuantity * 5) // cota de seguridad sobre el candidate set en memoria.
            .all()

        let sorted = candidates
            .sorted {
                haversineKm(params.lat, params.long, $0.latitude, $0.longitude)
                    < haversineKm(params.lat, params.long, $1.latitude, $1.longitude)
            }
            .prefix(quantity)
            .map { $0 }
        return try await Font.summaries(for: sorted, on: req.db)
    }


    /// GET /fonts/in-bounds?minLat=&maxLat=&minLong=&maxLong=
    /// Fuentes dentro del área visible de un mapa. Indexado por (latitude, longitude).
    @Sendable func inBounds(req: Request) async throws -> [FontSummary] {
        try BoundsQuery.validate(query: req)
        let b = try req.query.decode(BoundsQuery.self)

        // Cuando dentro del bbox hay más fuentes que el tope, hay que recortar. NO
        // recortamos por orden físico (≈ inserción): dejaría fuera lo importado
        // después (p. ej. Portugal, cargado tras España). En su lugar tomamos una
        // muestra **espacialmente uniforme y determinista**: `ORDER BY md5(id)` es
        // una baraja estable que reparte el recorte por toda el área, así todas las
        // zonas salen proporcionalmente. Con markercluster la densidad se conserva.
        // Estable entre peticiones → sin parpadeo y cacheable.
        if let sql = req.db as? SQLDatabase {
            let rows = try await sql.raw("""
                SELECT id FROM fonts
                WHERE \(unsafeRaw: Font.visibleSQL)
                  AND latitude >= \(bind: b.minLat) AND latitude <= \(bind: b.maxLat)
                  AND longitude >= \(bind: b.minLong) AND longitude <= \(bind: b.maxLong)
                ORDER BY md5(id::text)
                LIMIT \(bind: Self.maxInBoundsResults)
                """).all()
            let ids = try rows.map { try $0.decode(column: "id", as: UUID.self) }
            guard !ids.isEmpty else { return [] }
            let fonts = try await Font.query(on: req.db).filter(\.$id ~~ ids).all()
            return try await Font.summaries(for: fonts, on: req.db)
        }

        // Fallback (bases de datos sin SQL crudo): recorte simple por bbox.
        let fonts = try await Font.visible(on: req.db)
            .filter(\.$latitude >= b.minLat)
            .filter(\.$latitude <= b.maxLat)
            .filter(\.$longitude >= b.minLong)
            .filter(\.$longitude <= b.maxLong)
            .limit(Self.maxInBoundsResults)
            .all()
        return try await Font.summaries(for: fonts, on: req.db)
    }

    /// GET /fonts/map?minLat=&maxLat=&minLong=&maxLong=&width=&height=
    ///
    /// Si caben, devuelve **todas** las fuentes del viewport. Si no, PostgreSQL las
    /// agrega en una cuadrícula del tamaño aproximado de un cluster visual. A diferencia
    /// del antiguo LIMIT aleatorio, cada fuente cuenta y ninguna zona desaparece.
    @Sendable func mapItems(req: Request) async throws -> MapResponse {
        try MapQuery.validate(query: req)
        let q = try req.query.decode(MapQuery.self)
        guard q.minLat < q.maxLat, q.minLong < q.maxLong else {
            throw Abort(.badRequest, reason: "Los límites del mapa están invertidos o vacíos")
        }
        guard let sql = req.db as? SQLDatabase else {
            // El driver real es PostgreSQL. Este camino mantiene útil el endpoint con
            // adaptadores de test que no soporten SQL crudo.
            let fonts = try await Font.visible(on: req.db)
                .filter(\.$latitude >= q.minLat).filter(\.$latitude <= q.maxLat)
                .filter(\.$longitude >= q.minLong).filter(\.$longitude <= q.maxLong)
                .limit(Self.maxInBoundsResults).all()
            let summaries = try await Font.summaries(for: fonts, on: req.db)
            return MapResponse(total: fonts.count, fonts: summaries)
        }

        let countRow = try await sql.raw("""
            SELECT count(*)::bigint AS total FROM fonts
            WHERE \(unsafeRaw: Font.visibleSQL)
              AND latitude >= \(bind: q.minLat) AND latitude <= \(bind: q.maxLat)
              AND longitude >= \(bind: q.minLong) AND longitude <= \(bind: q.maxLong)
            """).first()
        let total64 = try countRow?.decode(column: "total", as: Int64.self) ?? 0
        let total = Int(total64)
        guard total > 0 else { return MapResponse(total: 0, fonts: [], clusters: []) }

        if total <= Self.maxInBoundsResults {
            let rows = try await sql.raw("""
                SELECT id FROM fonts
                WHERE \(unsafeRaw: Font.visibleSQL)
                  AND latitude >= \(bind: q.minLat) AND latitude <= \(bind: q.maxLat)
                  AND longitude >= \(bind: q.minLong) AND longitude <= \(bind: q.maxLong)
                """).all()
            let ids = try rows.map { try $0.decode(column: "id", as: UUID.self) }
            let fonts = try await Font.query(on: req.db).filter(\.$id ~~ ids).all()
            let summaries = try await Font.summaries(for: fonts, on: req.db)
            return MapResponse(total: total, fonts: summaries)
        }

        // Una celda ocupa unos 70 px: suficientes para tocarla con el pulgar y cerca del
        // radio visual de markercluster. Las cotas evitan una respuesta enorme si alguien
        // llama a la API con dimensiones inventadas.
        let columns = min(32, max(1, Int(ceil(Double(q.width ?? 390) / 70))))
        let rowsCount = min(24, max(1, Int(ceil(Double(q.height ?? 844) / 70))))
        let cellLong = (q.maxLong - q.minLong) / Double(columns)
        let cellLat = (q.maxLat - q.minLat) / Double(rowsCount)
        let rows = try await sql.raw("""
            SELECT
              floor((longitude - \(bind: q.minLong)) / \(bind: cellLong))::int AS grid_x,
              floor((latitude - \(bind: q.minLat)) / \(bind: cellLat))::int AS grid_y,
              avg(latitude)::double precision AS latitude,
              avg(longitude)::double precision AS longitude,
              count(*)::bigint AS quantity
            FROM fonts
            WHERE \(unsafeRaw: Font.visibleSQL)
              AND latitude >= \(bind: q.minLat) AND latitude <= \(bind: q.maxLat)
              AND longitude >= \(bind: q.minLong) AND longitude <= \(bind: q.maxLong)
            GROUP BY grid_x, grid_y
            ORDER BY grid_y, grid_x
            """).all()
        let clusters = try rows.map {
            MapCluster(latitude: try $0.decode(column: "latitude", as: Double.self),
                       longitude: try $0.decode(column: "longitude", as: Double.self),
                       count: Int(try $0.decode(column: "quantity", as: Int64.self)))
        }
        return MapResponse(total: total, fonts: [], clusters: clusters)
    }

    private func find(_ req: Request) async throws -> Font {
        guard let font = try await Font.find(req.parameters.get("fontID"), on: req.db) else {
            throw Abort(.notFound)
        }
        return font
    }

    /// Borrar una fuente, o tocar su ubicación/imagen: solo su creador o un admin.
    /// Las importadas de OSM (sin creador) quedan protegidas: solo un admin.
    private func requireCanManage(_ req: Request, font: Font) throws {
        let user = try req.auth.require(User.self)
        guard canManage(user: user, font: font) else {
            throw AppError(.forbidden, "font.ownerOnly", "Solo el creador o un administrador puede borrar o reubicar esta fuente")
        }
    }

    /// ¿`user` es el creador de la fuente o un admin?
    private func canManage(user: User, font: Font) -> Bool {
        user.isAdmin || (font.$creator.id != nil && font.$creator.id == user.id)
    }
}

struct ModerationSourceResponse: Content {
    let id: UUID
    let name: String?
    let latitude: Double
    let longitude: Double
    let image: String?
    let createdAt: Date?
    let authorID: UUID?
    let authorName: String
    let authorCreatedAt: Date?
    let moderationStrikes: Int
    let postingRestrictedUntil: Date?

    init(font: Font, creator: User) {
        self.id = font.id!
        self.name = font.name
        self.latitude = font.latitude
        self.longitude = font.longitude
        self.image = font.image
        self.createdAt = font.createdAt
        self.authorID = creator.id
        self.authorName = creator.username
        self.authorCreatedAt = creator.createdAt
        self.moderationStrikes = creator.moderationStrikes
        self.postingRestrictedUntil = creator.postingRestrictedUntil
    }
}

struct CreateFontDTO: Content {
    /// Opcional porque **editar** tiene que poder dejarla sin nombre.
    ///
    /// Casi toda fuente importada no tiene nombre propio, y quien la edita para arreglar
    /// otra cosa no debe verse obligado a inventarle uno — es exactamente así como
    /// vuelven los «Fuente» a la base. También al crear puede no haber topónimo: el tipo
    /// traducido es una representación de interfaz, no un nombre que guardar en la BD.
    let name: String?
    let latitude: Double
    let longitude: Double
    let image: String?
    let description: String?
    let source: WaterSource?
    let drinkable: Drinkable?
    /// Confirmación explícita después de enseñar una fuente a menos de 25 m.
    var allowNearbyDuplicate: Bool? = nil
}

extension CreateFontDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("latitude", as: Double.self, is: .range(-90...90))
        validations.add("longitude", as: Double.self, is: .range(-180...180))
    }
}

/// Una entrada del historial de ediciones para la vista de moderación.
struct FontEditResponse: Content {
    let id: UUID?
    let fontID: UUID
    let fontName: String?      // nombre actual de la fuente (para enlazar)
    let editorID: UUID?        // para enlazar al perfil del editor
    let editorName: String?    // quién editó (null si cuenta borrada)
    let before: FontInfoSnapshot
    let after: FontInfoSnapshot
    let reviewedAt: Date?       // ✓ marcada como revisada (fuera de la cola del panel)
    let createdAt: Date?

    init(_ edit: FontEdit, editorName: String?, currentFontName: String?) {
        self.id = edit.id
        self.fontID = edit.$font.id
        self.fontName = currentFontName
        self.editorID = edit.$editor.id
        self.editorName = editorName
        self.before = edit.before
        self.after = edit.after
        self.reviewedAt = edit.reviewedAt
        self.createdAt = edit.createdAt
    }
}

struct NearQuery: Content {
    let lat: Double
    let long: Double
    let quantity: Int?
}

struct BoundsQuery: Content {
    let minLat: Double
    let maxLat: Double
    let minLong: Double
    let maxLong: Double
}

struct MapQuery: Content {
    let minLat: Double
    let maxLat: Double
    let minLong: Double
    let maxLong: Double
    let width: Int?
    let height: Int?
}

extension MapQuery: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("minLat", as: Double.self, is: .range(-90...90))
        validations.add("maxLat", as: Double.self, is: .range(-90...90))
        validations.add("minLong", as: Double.self, is: .range(-180...180))
        validations.add("maxLong", as: Double.self, is: .range(-180...180))
        validations.add("width", as: Int.self, is: .range(1...10_000), required: false)
        validations.add("height", as: Int.self, is: .range(1...10_000), required: false)
    }
}

struct MapCluster: Content {
    let latitude: Double
    let longitude: Double
    let count: Int
}

struct MapResponse: Content {
    let total: Int
    let fonts: [FontSummary]
    let clusters: [MapCluster]

    init(total: Int, fonts: [FontSummary], clusters: [MapCluster] = []) {
        self.total = total
        self.fonts = fonts
        self.clusters = clusters
    }
}

extension BoundsQuery: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("minLat", as: Double.self, is: .range(-90...90))
        validations.add("maxLat", as: Double.self, is: .range(-90...90))
        validations.add("minLong", as: Double.self, is: .range(-180...180))
        validations.add("maxLong", as: Double.self, is: .range(-180...180))
    }
}

extension NearQuery: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("lat", as: Double.self, is: .range(-90...90))
        validations.add("long", as: Double.self, is: .range(-180...180))
        validations.add("quantity", as: Int.self, is: .range(1...), required: false)
    }
}
