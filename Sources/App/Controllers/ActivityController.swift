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
        activity.get("pulse", use: pulse)
    }

    /// Compartida entre peticiones, como la de zonas: una agregación sobre la tabla de
    /// aportaciones que vale igual durante minutos.
    static let pulseCache = ZoneCache()

    /// GET /activity/pulse — quién ha subido de nivel y quién está a punto.
    ///
    /// Cuelga de `/activity` y no de `/gamification` porque es donde se enseña y porque
    /// hereda de aquí el límite de 120/h: `/gamification/me` es privado y de una sola
    /// persona, y esto es una lectura pública y agregada, que es otro perfil de coste.
    ///
    /// **Global, no por zona**, a diferencia del resto de la página. El nivel sale del
    /// total de gotas de toda la vida y en toda la geografía, así que recortarlo a una
    /// demarcación daría un «subió de nivel» que no cuadra con el nivel que se ve en el
    /// perfil de esa misma persona. Una lista corta y honesta antes que una filtrada y
    /// engañosa.
    @Sendable func pulse(req: Request) async throws -> Pulse.Snapshot {
        if let cacheada = await Self.pulseCache.get("pulse", as: Pulse.Snapshot.self) { return cacheada }
        let out = try await Pulse.snapshot(on: req.db)
        await Self.pulseCache.set("pulse", out)
        return out
    }

    /// Radio por defecto de la vista "cerca de mí", en km. Una demarcación larga: lo bastante
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
        let country = req.query[String.self, at: "country"]?.trimmingCharacters(in: .whitespaces)

        // Cada visita son cuatro consultas más la resolución de la zona, y lo que
        // devuelven cambia como mucho cada pocos minutos. La caché evita repetir todo
        // eso en cada recarga; es especialmente importante de cara a abrir la página
        // al público, donde el coste ya no lo paga un puñado de administradores.
        // El ámbito entra en la clave: sin eso, la respuesta de un admin (que lleva
        // ediciones) se le serviría al siguiente visitante anónimo.
        let clave = try cacheKey(req, limit: limit, region: region, country: country, esAdmin: esAdmin)
        if let guardado = await Self.cache.get(clave) { return guardado }

        // Acotar por zona es acotar el conjunto de fuentes, y después buscar movimientos
        // sobre ellas. Sin filtro no hace falta esa vuelta.
        // `let` y no `var`: se captura en las tareas concurrentes de abajo.
        let ambito: Ambito? = try await zoneFontIDs(req, region: region, country: country)
        if case .fuentes(let ids) = ambito, ids.isEmpty { return [] }

        // Cada tipo trae como mucho `limit`: al mezclar y recortar, el resultado es el
        // mismo que si hubiéramos ordenado todo junto, sin traernos tablas enteras.
        async let newFontsTask = fetchNewFonts(req, limit: limit, ambito: ambito)
        async let commentsTask = fetchComments(req, limit: limit, ambito: ambito)
        async let reportsTask = fetchReports(req, limit: limit, ambito: ambito)
        async let editsTask = esAdmin ? fetchEdits(req, limit: limit, ambito: ambito) : []
        let items = try await newFontsTask + commentsTask + reportsTask + editsTask

        let ordenados = items.sorted { $0.createdAt > $1.createdAt }
        let resultado = Self.separaRepetidas(Array(ordenados.prefix(limit)))
        await Self.cache.set(clave, resultado)
        return resultado
    }

    /// Aparta las novedades de una misma fuente para que no salgan pegadas.
    ///
    /// Puede quedar una repetición al final de la lista: cuando ya solo restan
    /// movimientos de la misma fuente no hay nada que intercalar. Es el residuo del
    /// método, y cae donde menos se mira.
    ///
    /// Pasa constantemente: quien añade una fuente suele dejar la primera reseña en el
    /// mismo momento, así que son dos movimientos con la misma hora y el orden por fecha
    /// los pone uno al lado del otro. Repetir fuente está bien —son dos cosas distintas
    /// que contar—, pero en la portada parecen un error.
    ///
    /// No reordena por gusto: recorre la lista ya ordenada y solo adelanta un elemento
    /// cuando el que tocaba repite fuente demasiado pronto. El desvío respecto al orden
    /// por fecha es el mínimo imprescindible.
    /// Los dos números son pequeños a propósito, y están medidos: separar más obliga a
    /// meter más elementos entre medias, y los únicos disponibles son más antiguos, así
    /// que la portada se desordena. Sobre los mismos datos, con `hueco` 3 salían tres
    /// inversiones de fecha y un salto atrás de 30 h; con 1, una inversión y 17 h. En
    /// los dos casos, cero pares pegados — que es lo único que había que arreglar.
    ///
    /// - Parameters:
    ///   - hueco: cuántas posiciones deben pasar antes de repetir fuente.
    ///   - ventana: cuánto se puede adelantar un elemento para tapar el hueco. Si ahí no
    ///     hay ningún candidato se acepta la repetición: desordenar la portada es peor
    ///     que ver dos veces la misma fuente.
    static func separaRepetidas(_ items: [ActivityItem], hueco: Int = 1, ventana: Int = 2) -> [ActivityItem] {
        var pendientes = items
        var salida: [ActivityItem] = []
        salida.reserveCapacity(items.count)
        while !pendientes.isEmpty {
            let ultimas = salida.suffix(hueco).map(\.fontID)
            let i = pendientes.prefix(ventana).firstIndex { !ultimas.contains($0.fontID) } ?? 0
            salida.append(pendientes.remove(at: i))
        }
        return salida
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

    private func cacheKey(_ req: Request, limit: Int, region: String?, country: String?, esAdmin: Bool) throws -> String {
        let ambito = esAdmin ? "a" : "p"
        if let lat = req.query[Double.self, at: "lat"], let long = req.query[Double.self, at: "long"] {
            let km = min(max(req.query[Double.self, at: "km"] ?? Self.defaultRadiusKm, 1), Self.maxRadiusKm)
            let step = Self.coordStep(forKm: km)
            return "\(ambito):n:\(limit):\(Self.snap(lat, step: step)):\(Self.snap(long, step: step)):\(km)"
        }
        return "\(ambito):r:\(limit):\(region ?? ""):\(country ?? "")"
    }

    /// Cómo se acota la actividad a una zona.
    ///
    /// Son **dos formas distintas y no una con dos orígenes**, y la diferencia es de
    /// tamaño. Cercanía y demarcación se resuelven a una lista de identificadores porque
    /// están acotadas por definición: la demarcación más poblada son 7.588 fuentes. Un
    /// país no: España son **52.341**, y meter eso en un `IN (...)` cuatro veces por
    /// visita no es una consulta lenta, es otra cosa. Por eso el país se aplica como
    /// join sobre `fonts` y nunca se materializa.
    /// Las tres consultas que cuelgan de una fuente repiten este `switch` en vez de
    /// compartir un ayudante. Se intentó con un protocolo y Swift no deja declarar
    /// `$font` en uno («el prefijo `$` está reservado»), y la vuelta con `KeyPath`
    /// costaba más de leer que las tres copias. **Copiar es seguro aquí precisamente por
    /// el `switch`**: es exhaustivo, así que añadir un caso a este enum rompe la
    /// compilación en los tres sitios en vez de dejar uno viejo en silencio.
    enum Ambito {
        case fuentes([UUID])
        case pais(String)
    }

    /// El ámbito pedido, o `nil` si no se ha pedido ninguno (= todo).
    ///
    /// Tres maneras de decir "mi zona" y no son intercambiables: por coordenadas (lo que
    /// tienes alrededor, que es lo que le importa a quien va a caminar), por demarcación
    /// y por país. Ese es también el orden de preferencia si vienen varias, de lo más
    /// concreto a lo más ancho.
    private func zoneFontIDs(_ req: Request, region: String?, country: String?) async throws -> Ambito? {
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
            return .fuentes(candidates.compactMap { f in
                haversineKm(lat, long, f.latitude, f.longitude) <= km ? f.id : nil
            })
        }
        if let region, !region.isEmpty {
            return .fuentes(try await Font.query(on: req.db).filter(\.$region == region).all(\.$id))
        }
        if let country, !country.isEmpty { return .pais(country) }
        return nil
    }

    // MARK: - Cada fuente de actividad

    private func fetchNewFonts(_ req: Request, limit: Int, ambito: Ambito?) async throws -> [ActivityItem] {
        // **Solo las que ha puesto una persona.** Una importación no es actividad: al
        // cargar el Pirineo francés entraron 11.043 fuentes de golpe y se comieron la
        // portada entera, tapando lo único que esta pantalla existe para enseñar — lo que
        // ha hecho la gente. Es el mismo criterio del sitemap, y por el mismo motivo.
        //
        // Y `visible`, como toda lectura pública que devuelve varias fuentes: una
        // duplicada o una retirada no tienen por qué salir en novedades.
        let query = Font.visible(on: req.db)
            .filter(\.$creator.$id != nil)
            .sort(\.$createdAt, .descending).limit(limit)
        switch ambito {
        case .fuentes(let ids): query.filter(\.$id ~~ ids)
        case .pais(let pais): query.filter(\.$country == pais)
        case nil: break
        }
        let fonts = try await query.all()
        let authors = try await User.usernames(for: fonts.compactMap { $0.$creator.id }, on: req.db)
        return fonts.compactMap { f in
            guard let id = f.id, let date = f.createdAt else { return nil }
            return ActivityItem(kind: .fontAdded, fontID: id, fontName: f.name, region: f.region,
                                author: f.$creator.id.flatMap { authors[$0] }, waterStatus: nil,
                                text: f.description, image: f.image, createdAt: date)
        }
    }

    private func fetchComments(_ req: Request, limit: Int, ambito: Ambito?) async throws -> [ActivityItem] {
        let query = FontComment.query(on: req.db).sort(\.$createdAt, .descending).limit(limit)
        // Acotar por país va como **join** y no resolviendo a identificadores: España son
        // 52.341 fuentes y esto son cuatro consultas por visita. Ojo, el join no filtra
        // por `Font.visible`, igual que no lo hace el camino de los identificadores;
        // arreglarlo solo en esta rama daría resultados distintos según cómo filtres.
        switch ambito {
        case .fuentes(let ids): query.filter(\.$font.$id ~~ ids)
        case .pais(let pais): query.join(Font.self, on: \FontComment.$font.$id == \Font.$id)
                                   .filter(Font.self, \.$country == pais)
        case nil: break
        }
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

    private func fetchReports(_ req: Request, limit: Int, ambito: Ambito?) async throws -> [ActivityItem] {
        // **Solo las incidencias salen en novedades**, y esto es la mitad del arreglo:
        // un comentario de organización —«¿puedes añadir una foto?»— no tiene por qué
        // tener protagonismo en la portada. Lo que pasa con las fuentes, sí.
        let query = FontReport.query(on: req.db)
            .filter(\.$isIncident == true)
            .sort(\.$createdAt, .descending).limit(limit)
        // Acotar por país va como **join** y no resolviendo a identificadores: España son
        // 52.341 fuentes y esto son cuatro consultas por visita. Ojo, el join no filtra
        // por `Font.visible`, igual que no lo hace el camino de los identificadores;
        // arreglarlo solo en esta rama daría resultados distintos según cómo filtres.
        switch ambito {
        case .fuentes(let ids): query.filter(\.$font.$id ~~ ids)
        case .pais(let pais): query.join(Font.self, on: \FontReport.$font.$id == \Font.$id)
                                   .filter(Font.self, \.$country == pais)
        case nil: break
        }
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

    private func fetchEdits(_ req: Request, limit: Int, ambito: Ambito?) async throws -> [ActivityItem] {
        let query = FontEdit.query(on: req.db).sort(\.$createdAt, .descending).limit(limit)
        // Acotar por país va como **join** y no resolviendo a identificadores: España son
        // 52.341 fuentes y esto son cuatro consultas por visita. Ojo, el join no filtra
        // por `Font.visible`, igual que no lo hace el camino de los identificadores;
        // arreglarlo solo en esta rama daría resultados distintos según cómo filtres.
        switch ambito {
        case .fuentes(let ids): query.filter(\.$font.$id ~~ ids)
        case .pais(let pais): query.join(Font.self, on: \FontEdit.$font.$id == \Font.$id)
                                   .filter(Font.self, \.$country == pais)
        case nil: break
        }
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
    /// `nil` si la fuente no tiene nombre propio; el rótulo lo compone el cliente. Ver
    /// `Font.name`.
    let fontName: String?
    let region: String?
    let author: String?
    let waterStatus: String?
    let text: String?
    /// Foto para la tarjeta: la de la reseña si la trae, si no la de la fuente. Puede
    /// ser nula (la mayoría de fuentes importadas aún no tienen ninguna).
    let image: String?
    let createdAt: Date
}


