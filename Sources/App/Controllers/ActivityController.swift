import Fluent
import Vapor

/// Actividad reciente de toda la app en una sola línea de tiempo: fuentes nuevas,
/// reseñas, incidencias y ediciones, mezcladas y ordenadas por fecha.
///
/// De momento **solo administradores**: es la vista para saber si esto se mueve y por
/// dónde. Está pensada para poder abrirse al público tal cual —no expone nada que no
/// sea ya visible en la ficha de cada fuente—, cambiando el guard por lectura libre.
struct ActivityController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let activity = routes.grouped("activity")
            .grouped(UserToken.authenticator(), User.guardMiddleware())
        activity.get(use: index)
    }

    /// Radio por defecto de la vista "cerca de mí", en km. Una comarca larga: lo bastante
    /// ancho para que haya movimiento aunque tu pueblo esté tranquilo, y lo bastante
    /// estrecho para que sean fuentes a las que podrías ir de verdad.
    static let defaultRadiusKm = 40.0
    static let maxRadiusKm = 200.0

    /// GET /activity?limit=&region=&lat=&long=&km= — últimos movimientos, más recientes
    /// primero. Con `lat`/`long` se acota a lo que hay alrededor; con `region`, a una
    /// comunidad/región entera. La cercanía manda si vienen las dos.
    @Sendable func index(req: Request) async throws -> [ActivityItem] {
        let user = try req.auth.require(User.self)
        guard user.isAdmin else { throw Abort(.forbidden, reason: "Solo para administradores") }

        let limit = min(max(req.query[Int.self, at: "limit"] ?? 30, 1), 100)
        let region = req.query[String.self, at: "region"]?.trimmingCharacters(in: .whitespaces)

        // Acotar por zona es acotar el conjunto de fuentes, y después buscar movimientos
        // sobre ellas. Sin filtro no hace falta esa vuelta.
        // `let` y no `var`: se captura en las tareas concurrentes de abajo.
        let fontIDsInRegion: [UUID]? = try await zoneFontIDs(req, region: region)
        if fontIDsInRegion?.isEmpty == true { return [] }

        // Cada tipo trae como mucho `limit`: al mezclar y recortar, el resultado es el
        // mismo que si hubiéramos ordenado todo junto, sin traernos tablas enteras.
        async let newFontsTask = fetchNewFonts(req, limit: limit, ids: fontIDsInRegion)
        async let commentsTask = fetchComments(req, limit: limit, ids: fontIDsInRegion)
        async let reportsTask = fetchReports(req, limit: limit, ids: fontIDsInRegion)
        async let editsTask = fetchEdits(req, limit: limit, ids: fontIDsInRegion)
        let items = try await newFontsTask + commentsTask + reportsTask + editsTask

        return Array(items.sorted { $0.createdAt > $1.createdAt }.prefix(limit))
    }

    /// Fuentes de la zona pedida, o `nil` si no se ha pedido ninguna (= todas).
    ///
    /// Dos maneras de decir "mi zona", y no son intercambiables: por coordenadas
    /// (lo que tienes alrededor, que es lo que le importa a quien va a caminar) y por
    /// región administrativa (Catalunya entera). La primera gana si vienen las dos.
    private func zoneFontIDs(_ req: Request, region: String?) async throws -> [UUID]? {
        if let lat = req.query[Double.self, at: "lat"], let long = req.query[Double.self, at: "long"] {
            let km = min(max(req.query[Double.self, at: "km"] ?? Self.defaultRadiusKm, 1), Self.maxRadiusKm)
            // Prefiltro por caja: un grado de latitud son ~111 km. En longitud los
            // meridianos se juntan al subir de latitud, así que la caja se ensancha
            // dividiendo por el coseno; sin eso, en el norte la caja se queda corta.
            let dLat = km / 111.0
            let dLong = km / (111.0 * max(cos(lat * .pi / 180), 0.01))
            let candidates = try await Font.query(on: req.db)
                .filter(\.$latitude >= lat - dLat).filter(\.$latitude <= lat + dLat)
                .filter(\.$longitude >= long - dLong).filter(\.$longitude <= long + dLong)
                .limit(5000)
                .all()
            // La caja es un cuadrado y el radio un círculo: el haversine recorta las esquinas.
            return candidates.compactMap { f in
                haversineKm(lat, long, f.latitude, f.longitude) <= km ? f.id : nil
            }
        }
        guard let region, !region.isEmpty else { return nil }
        return try await Font.query(on: req.db).filter(\.$region == region).all(\.$id)
    }

    // MARK: - Cada fuente de actividad

    private func fetchNewFonts(_ req: Request, limit: Int, ids: [UUID]?) async throws -> [ActivityItem] {
        let query = Font.query(on: req.db).sort(\.$createdAt, .descending).limit(limit)
        if let ids { query.filter(\.$id ~~ ids) }
        let fonts = try await query.all()
        let authors = try await User.usernames(for: fonts.compactMap { $0.$creator.id }, on: req.db)
        return fonts.compactMap { f in
            guard let id = f.id, let date = f.createdAt else { return nil }
            return ActivityItem(kind: .fontAdded, fontID: id, fontName: f.name, region: f.region,
                                author: f.$creator.id.flatMap { authors[$0] }, waterStatus: nil,
                                text: f.description, image: f.image, createdAt: date)
        }
    }

    private func fetchComments(_ req: Request, limit: Int, ids: [UUID]?) async throws -> [ActivityItem] {
        let query = FontComment.query(on: req.db).sort(\.$createdAt, .descending).limit(limit)
        if let ids { query.filter(\.$font.$id ~~ ids) }
        let comments = try await query.all()
        let (fonts, authors) = try await context(req, fontIDs: comments.map { $0.$font.id },
                                                 userIDs: comments.compactMap { $0.$user.id })
        return comments.compactMap { c in
            guard let date = c.createdAt, let font = fonts[c.$font.id] else { return nil }
            return ActivityItem(kind: .review, fontID: c.$font.id, fontName: font.name, region: font.region,
                                author: c.$user.id.flatMap { authors[$0] }, waterStatus: c.waterStatus,
                                // La foto de la reseña manda: es la más reciente y la
                                // que ilustra justo lo que se está contando.
                                text: c.body.isEmpty ? nil : c.body, image: c.image ?? font.image, createdAt: date)
        }
    }

    private func fetchReports(_ req: Request, limit: Int, ids: [UUID]?) async throws -> [ActivityItem] {
        let query = FontReport.query(on: req.db).sort(\.$createdAt, .descending).limit(limit)
        if let ids { query.filter(\.$font.$id ~~ ids) }
        let reports = try await query.all()
        let (fonts, authors) = try await context(req, fontIDs: reports.map { $0.$font.id },
                                                 userIDs: reports.compactMap { $0.$user.id })
        return reports.compactMap { r in
            guard let date = r.createdAt, let font = fonts[r.$font.id] else { return nil }
            return ActivityItem(kind: .report, fontID: r.$font.id, fontName: font.name, region: font.region,
                                author: r.$user.id.flatMap { authors[$0] }, waterStatus: nil,
                                text: r.message, image: font.image, createdAt: date)
        }
    }

    private func fetchEdits(_ req: Request, limit: Int, ids: [UUID]?) async throws -> [ActivityItem] {
        let query = FontEdit.query(on: req.db).sort(\.$createdAt, .descending).limit(limit)
        if let ids { query.filter(\.$font.$id ~~ ids) }
        let edits = try await query.all()
        let (fonts, authors) = try await context(req, fontIDs: edits.map { $0.$font.id },
                                                 userIDs: edits.compactMap { $0.$editor.id })
        return edits.compactMap { e in
            guard let date = e.createdAt, let font = fonts[e.$font.id] else { return nil }
            return ActivityItem(kind: .edit, fontID: e.$font.id, fontName: font.name, region: font.region,
                                author: e.$editor.id.flatMap { authors[$0] }, waterStatus: nil,
                                text: nil, image: font.image, createdAt: date)
        }
    }

    /// Nombres de fuentes y de autores en dos queries, no una por fila (evita N+1).
    private func context(_ req: Request, fontIDs: [UUID], userIDs: [UUID]) async throws -> ([UUID: Font], [UUID: String]) {
        let unique = Array(Set(fontIDs))
        let fonts = unique.isEmpty ? [] : try await Font.query(on: req.db).filter(\.$id ~~ unique).all()
        let byID = Dictionary(uniqueKeysWithValues: fonts.compactMap { f in f.id.map { ($0, f) } })
        let authors = try await User.usernames(for: userIDs, on: req.db)
        return (byID, authors)
    }
}

/// Un movimiento de la línea de tiempo. `author` nulo = cuenta anonimizada o dato importado.
struct ActivityItem: Content {
    enum Kind: String, Content {
        case fontAdded, review, report, edit
    }

    let kind: Kind
    let fontID: UUID
    let fontName: String
    let region: String?
    let author: String?
    let waterStatus: String?
    let text: String?
    /// Foto para la tarjeta: la de la reseña si la trae, si no la de la fuente. Puede
    /// ser nula (la mayoría de fuentes importadas aún no tienen ninguna).
    let image: String?
    let createdAt: Date
}
