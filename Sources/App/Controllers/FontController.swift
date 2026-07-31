import Fluent
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
        fonts.get("near", "download", use: nearDownload)
        fonts.get("in-bounds", use: inBounds)
        fonts.get(":fontID", use: show)

        // Escritura: requiere token Bearer válido.
        let protected = fonts.grouped(UserToken.authenticator(), User.guardMiddleware())
        protected.post(use: create)
        // Historial de ediciones (moderación): solo admins. Antes de `:fontID`
        // para que "edits" no se interprete como un id de fuente.
        protected.get("edits", use: edits)
        protected.post("edits", ":editID", "revert", use: revertEdit)
        protected.group(":fontID") { font in
            font.put(use: update)
            font.delete(use: destroy)
        }
    }

    @Sendable func create(req: Request) async throws -> Response {
        let user = try req.auth.require(User.self)
        try CreateFontDTO.validate(content: req)
        let dto = try req.content.decode(CreateFontDTO.self)
        let font = Font(name: dto.name, latitude: dto.latitude, longitude: dto.longitude, image: dto.image, description: dto.description, source: dto.source, drinkable: dto.drinkable, creatorID: try user.requireID())
        try await font.save(on: req.db)

        let response = Response(status: .created)
        try response.content.encode(font)
        return response
    }

    /// GET /fonts?page=&per=&search= — listado paginado; `search` filtra por nombre (ILIKE, insensible a mayúsculas).
    @Sendable func index(req: Request) async throws -> Page<Font> {
        let query = Font.query(on: req.db).sort(\.$name)
        if let search = req.query[String.self, at: "search"], !search.isEmpty {
            query.filter(\.$name, .custom("ILIKE"), "%\(search)%")
        }
        return try await query.paginate(for: req)
    }

    @Sendable func show(req: Request) async throws -> Font {
        try await find(req)
    }

    @Sendable func update(req: Request) async throws -> Font {
        try CreateFontDTO.validate(content: req)
        let font = try await find(req)
        let user = try req.auth.require(User.self)
        let dto = try req.content.decode(CreateFontDTO.self)
        // Edición abierta (estilo wiki): cualquier usuario autenticado puede corregir
        // la información descriptiva de una fuente (muchas se llaman solo "Font" o tienen
        // un nombre popular / historia local que aportar).
        let before = FontInfoSnapshot(font)
        font.name = dto.name
        font.description = dto.description
        font.source = dto.source
        font.drinkable = dto.drinkable
        // La ubicación y la imagen son más sensibles (mover el pin, cambiar la foto):
        // se reservan al creador o a un admin. Para el resto se conservan tal cual.
        if canManage(user: user, font: font) {
            let oldImage = font.image
            font.latitude = dto.latitude
            font.longitude = dto.longitude
            font.image = dto.image
            try await font.save(on: req.db)
            if let oldImage, oldImage != dto.image { try? await req.imageStorage.delete(oldImage) }
        } else {
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
        let edits = try await FontEdit.query(on: req.db)
            .sort(\.$createdAt, .descending)
            .range(((page - 1) * per)..<(page * per))
            .all()
        let editorNames = try await User.usernames(for: edits.compactMap { $0.$editor.id }, on: req.db)
        let fontIDs = Array(Set(edits.map { $0.$font.id }))
        let fonts = fontIDs.isEmpty ? [] : try await Font.query(on: req.db).filter(\.$id ~~ fontIDs).all()
        let fontNames = Dictionary(uniqueKeysWithValues: fonts.compactMap { f in f.id.map { ($0, f.name) } })
        return edits.map { e in
            FontEditResponse(e, editorName: e.$editor.id.flatMap { editorNames[$0] }, currentFontName: fontNames[e.$font.id])
        }
    }

    /// POST /fonts/edits/:editID/revert — restaura la información al estado previo
    /// a esa edición (solo admins). No borra el registro: crea uno nuevo, dejando
    /// el propio revert en el historial.
    @Sendable func revertEdit(req: Request) async throws -> Font {
        let admin = try req.auth.require(User.self)
        try requireAdmin(req)
        guard let edit = try await FontEdit.find(req.parameters.get("editID"), on: req.db) else {
            throw Abort(.notFound)
        }
        guard let font = try await Font.find(edit.$font.id, on: req.db) else {
            throw Abort(.notFound, reason: "La fuente ya no existe")
        }
        let before = FontInfoSnapshot(font)
        font.name = edit.before.name
        font.description = edit.before.description
        font.source = edit.before.source
        font.drinkable = edit.before.drinkable
        try await font.save(on: req.db)
        let after = FontInfoSnapshot(font)
        if before != after {
            try await FontEdit(fontID: try font.requireID(), editorID: try? admin.requireID(), before: before, after: after).save(on: req.db)
        }
        return font
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

        let candidates = try await Font.query(on: req.db)
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

    /// GET /fonts/near/download — mismo conjunto que `near`, pensado para cachear offline en el cliente.
    @Sendable func nearDownload(req: Request) async throws -> [FontSummary] {
        try await near(req: req)
    }

    /// GET /fonts/in-bounds?minLat=&maxLat=&minLong=&maxLong=
    /// Fuentes dentro del área visible de un mapa. Indexado por (latitude, longitude).
    @Sendable func inBounds(req: Request) async throws -> [FontSummary] {
        try BoundsQuery.validate(query: req)
        let b = try req.query.decode(BoundsQuery.self)
        let fonts = try await Font.query(on: req.db)
            .filter(\.$latitude >= b.minLat)
            .filter(\.$latitude <= b.maxLat)
            .filter(\.$longitude >= b.minLong)
            .filter(\.$longitude <= b.maxLong)
            .limit(Self.maxInBoundsResults)
            .all()
        return try await Font.summaries(for: fonts, on: req.db)
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
            throw Abort(.forbidden, reason: "Solo el creador o un administrador puede borrar o reubicar esta fuente")
        }
    }

    /// ¿`user` es el creador de la fuente o un admin?
    private func canManage(user: User, font: Font) -> Bool {
        user.isAdmin || (font.$creator.id != nil && font.$creator.id == user.id)
    }
}

struct CreateFontDTO: Content {
    let name: String
    let latitude: Double
    let longitude: Double
    let image: String?
    let description: String?
    let source: WaterSource?
    let drinkable: Drinkable?
}

extension CreateFontDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("name", as: String.self, is: !.empty)
        validations.add("latitude", as: Double.self, is: .range(-90...90))
        validations.add("longitude", as: Double.self, is: .range(-180...180))
    }
}

/// Una entrada del historial de ediciones para la vista de moderación.
struct FontEditResponse: Content {
    let id: UUID?
    let fontID: UUID
    let fontName: String?      // nombre actual de la fuente (para enlazar)
    let editorName: String?    // quién editó (null si cuenta borrada)
    let before: FontInfoSnapshot
    let after: FontInfoSnapshot
    let createdAt: Date?

    init(_ edit: FontEdit, editorName: String?, currentFontName: String?) {
        self.id = edit.id
        self.fontID = edit.$font.id
        self.fontName = currentFontName
        self.editorName = editorName
        self.before = edit.before
        self.after = edit.after
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
