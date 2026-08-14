import Fluent
import Vapor

/// Actividad reciente de toda la app en una sola línea de tiempo: fuentes nuevas,
/// reseñas, incidencias y ediciones, mezcladas y ordenadas por fecha.
///
/// **Lectura pública.** Fuentes, reseñas e incidencias ya se ven en la ficha de cada
/// fuente, así que juntarlas por fecha no descubre nada nuevo.
///
/// Las **ediciones** son la excepción y solo las ven los administradores: el historial
/// (`/fonts/edits`) es de moderación, y "tal usuario editó tal fuente a tal hora" no está
/// hoy a la vista de nadie más. Si algún día se quiere el modelo wiki —historial público,
/// como OSM—, es quitar este filtro.
struct ActivityController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        // El autenticador sin `guardMiddleware`: si hay token se sabe quién es (para
        // enseñarle también las ediciones), y si no lo hay se sigue adelante igual.
        let activity = routes.grouped("activity")
            .grouped(UserToken.authenticator())
            // Ruta pública y cara: la caché absorbe las recargas normales, pero quien
            // vaya cambiando las coordenadas falla la caché en cada intento y paga
            // cuatro consultas. Un visitante de verdad hace unas pocas peticiones.
            .grouped(RateLimitMiddleware(scope: "activity", max: 120, window: 60 * 60))
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
        let esAdmin = req.auth.get(User.self)?.isAdmin ?? false

        let limit = min(max(req.query[Int.self, at: "limit"] ?? 30, 1), 100)
        let region = req.query[String.self, at: "region"]?.trimmingCharacters(in: .whitespaces)

        // Cada visita son cuatro consultas más la resolución de la zona, y lo que
        // devuelven cambia como mucho cada pocos minutos. La caché evita repetir todo
        // eso en cada recarga; es especialmente importante de cara a abrir la página
        // al público, donde el coste ya no lo paga un puñado de administradores.
        // El ámbito entra en la clave: sin eso, la respuesta de un admin (que lleva
        // ediciones) se le serviría al siguiente visitante anónimo.
        let clave = try cacheKey(req, limit: limit, region: region, esAdmin: esAdmin)
        if let guardado = await Self.cache.get(clave) { return guardado }

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
        async let editsTask = esAdmin ? fetchEdits(req, limit: limit, ids: fontIDsInRegion) : []
        let items = try await newFontsTask + commentsTask + reportsTask + editsTask

        let resultado = Array(items.sorted { $0.createdAt > $1.createdAt }.prefix(limit))
        await Self.cache.set(clave, resultado)
        return resultado
    }

    // MARK: - Caché

    /// Ventana de la caché. Un minuto: lo que se mira aquí es "qué se mueve", no un dato
    /// que haya que ver al segundo, y con esto una recarga insistente ya no cuesta nada.
    static let cacheTTL: TimeInterval = 60

    static let cache = ActivityCache()

    /// Redondeo de las coordenadas, **proporcional al radio pedido**.
    ///
    /// Hace falta redondear o la caché no serviría de nada: el GPS da coordenadas
    /// distintas a cada visitante y en cada lectura, así que no habría dos peticiones
    /// iguales. Y hay que redondear la coordenada de verdad, no solo la clave — si se
    /// redondease solo la clave, dos personas de pueblos distintos se llevarían el
    /// resultado de la otra.
    ///
    /// Proporcional porque un paso fijo se come los radios pequeños: con 5 km de paso y
    /// `km=1`, el centro se movía más que el propio radio y salían otras fuentes.
    /// Un octavo de grado por cada 100 km de radio deja el desplazamiento en torno al
    /// 5 % del radio, se pida el que se pida.
    static func coordStep(forKm km: Double) -> Double {
        min(max(km / 800, 0.001), 0.05)
    }

    static func snap(_ v: Double, step: Double) -> Double { (v / step).rounded() * step }

    private func cacheKey(_ req: Request, limit: Int, region: String?, esAdmin: Bool) throws -> String {
        let ambito = esAdmin ? "a" : "p"
        if let lat = req.query[Double.self, at: "lat"], let long = req.query[Double.self, at: "long"] {
            let km = min(max(req.query[Double.self, at: "km"] ?? Self.defaultRadiusKm, 1), Self.maxRadiusKm)
            let step = Self.coordStep(forKm: km)
            return "\(ambito):n:\(limit):\(Self.snap(lat, step: step)):\(Self.snap(long, step: step)):\(km)"
        }
        return "\(ambito):r:\(limit):\(region ?? "")"
    }

    /// Fuentes de la zona pedida, o `nil` si no se ha pedido ninguna (= todas).
    ///
    /// Dos maneras de decir "mi zona", y no son intercambiables: por coordenadas
    /// (lo que tienes alrededor, que es lo que le importa a quien va a caminar) y por
    /// región administrativa (Catalunya entera). La primera gana si vienen las dos.
    private func zoneFontIDs(_ req: Request, region: String?) async throws -> [UUID]? {
        if let latCruda = req.query[Double.self, at: "lat"], let longCruda = req.query[Double.self, at: "long"] {
            let km = min(max(req.query[Double.self, at: "km"] ?? Self.defaultRadiusKm, 1), Self.maxRadiusKm)
            // Mismas coordenadas redondeadas que usa la clave de la caché (ver `snap`).
            let step = Self.coordStep(forKm: km)
            let lat = Self.snap(latCruda, step: step)
            let long = Self.snap(longCruda, step: step)
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

/// Caché en memoria de las respuestas de `/activity`.
///
/// En memoria y por proceso: con varias instancias cada una tendrá la suya, que para un
/// listado de novedades es perfectamente aceptable — el precio de desacertar es enseñar
/// algo un minuto viejo. Si algún día hace falta compartirla, Redis, igual que el
/// rate-limit.
actor ActivityCache {
    private struct Entrada {
        let items: [ActivityItem]
        let caduca: Date
    }

    private var entradas: [String: Entrada] = [:]

    func get(_ key: String) -> [ActivityItem]? {
        guard let e = entradas[key] else { return nil }
        guard e.caduca > Date() else {
            entradas[key] = nil
            return nil
        }
        return e.items
    }

    /// Vacía la caché. La usan los tests: es estática y sobrevive de un caso al
    /// siguiente, así que sin esto un test podría leer lo que dejó otro.
    func clear() { entradas.removeAll() }

    func set(_ key: String, _ items: [ActivityItem]) {
        // Limpieza oportunista: sin esto el diccionario crecería con una entrada por
        // cada rincón del mapa que alguien haya mirado alguna vez.
        if entradas.count > 200 {
            let ahora = Date()
            entradas = entradas.filter { $0.value.caduca > ahora }
        }
        entradas[key] = Entrada(items: items, caduca: Date().addingTimeInterval(ActivityController.cacheTTL))
    }
}

/// Un movimiento de la línea de tiempo. `author` nulo = cuenta anonimizada o dato importado.
struct ActivityItem: Content, Sendable {
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
