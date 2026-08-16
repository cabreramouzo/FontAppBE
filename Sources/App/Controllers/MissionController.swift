import Fluent
import Vapor

/// Misiones cerca de ti. Fase 4 del plan (docs/gamificacion.md).
///
/// La idea entera: el mapa ya sabe dónde estás y qué fuentes de alrededor están vacías, así
/// que en vez de pedirle al usuario una tarea se le puede proponer **una ruta**. Es la
/// pieza que convierte el agujero de datos —0 % de fuentes con foto en la muestra de
/// producción— en una excusa para salir a caminar, que es lo que la gente ya hace con la app.
///
/// Lectura pública, como `/activity`: son datos de fuentes, que ya se ven uno a uno en el
/// mapa. Lo que aporta esto es el orden, no el acceso.
struct MissionController: RouteCollection {
    /// Radio por defecto de una ruta a pie. 4 km es una vuelta de una tarde, no una
    /// excursión: una misión que no cabe en una tarde no se empieza.
    static let defaultKm = 4.0
    static let maxKm = 30.0
    /// Cuántas paradas por ruta. Media docena se recuerda y se termina; veinte es una
    /// lista de tareas, y una lista de tareas da pereza.
    static let stops = 6
    /// A partir de cuándo una fuente «hace falta volver a comprobarla».
    static let staleDays = 180.0

    func boot(routes: any RoutesBuilder) throws {
        routes.grouped("missions")
            .grouped(RateLimitMiddleware(scope: "missions", max: 120, window: 60 * 60))
            .get(use: near)
    }

    struct Query: Content {
        let lat: Double
        let long: Double
        let km: Double?
    }

    struct Target: Content {
        let id: UUID
        let name: String
        let latitude: Double
        let longitude: Double
        let distanceKm: Double
        /// Última comprobación, o `nil` si no la ha visitado nadie.
        let lastCheck: Date?
    }

    struct Response: Content {
        let km: Double
        /// Ruta ciega: fuentes sin ninguna foto. Ataca el hueco más grande que hay.
        let photoless: [Target]
        /// Ronda: fuentes que nadie comprueba desde hace medio año (o nunca).
        let stale: [Target]
    }

    /// GET /missions?lat=&long=&km= — rutas propuestas alrededor de un punto.
    @Sendable func near(req: Request) async throws -> Response {
        let q = try req.query.decode(Query.self)
        guard (-90...90).contains(q.lat), (-180...180).contains(q.long) else {
            throw Abort(.badRequest, reason: "Coordenadas fuera de rango")
        }
        let km = min(max(q.km ?? Self.defaultKm, 0.5), Self.maxKm)

        // Prefiltro por bounding box y luego haversine, igual que `/fonts/near`. El delta
        // de longitud depende de la latitud: un grado son ~111 km en el ecuador y menos
        // según subes.
        let dLat = km / 111.0
        let dLong = km / (111.0 * max(cos(q.lat * .pi / 180), 0.01))
        let candidatas = try await Font.query(on: req.db)
            .filter(\.$latitude >= q.lat - dLat).filter(\.$latitude <= q.lat + dLat)
            .filter(\.$longitude >= q.long - dLong).filter(\.$longitude <= q.long + dLong)
            .limit(3_000)
            .all()

        let cerca = candidatas.compactMap { f -> (Font, Double)? in
            let d = haversineKm(q.lat, q.long, f.latitude, f.longitude)
            return d <= km ? (f, d) : nil
        }
        guard !cerca.isEmpty else { return Response(km: km, photoless: [], stale: []) }

        // Última reseña de cada una, en una sola consulta.
        let ids = cerca.compactMap { $0.0.id }
        let comentarios = try await FontComment.query(on: req.db).filter(\.$font.$id ~~ ids).all()
        var ultima: [UUID: Date] = [:]
        for c in comentarios {
            guard let d = c.createdAt else { continue }
            if let previa = ultima[c.$font.id], previa >= d { continue }
            ultima[c.$font.id] = d
        }

        func target(_ f: Font, _ d: Double) -> Target? {
            guard let id = f.id else { return nil }
            return Target(id: id, name: f.name, latitude: f.latitude, longitude: f.longitude,
                          distanceKm: (d * 100).rounded() / 100, lastCheck: ultima[id])
        }

        // Las dos rutas van ordenadas por distancia, no por «cuánto valen». La lista es
        // un recorrido: si la ordenas por puntos, la primera parada está a 300 m y la
        // segunda a 3 km, y nadie la hace.
        let sinFoto = cerca
            .filter { $0.0.image == nil }
            .sorted { $0.1 < $1.1 }
            .prefix(Self.stops)
            .compactMap { target($0.0, $0.1) }

        let corte = Date().addingTimeInterval(-Self.staleDays * 86_400)
        let caducadas = cerca
            .filter { par in
                guard let id = par.0.id else { return false }
                // Las que no tienen foto ya salen en la otra ruta; no se repiten.
                guard par.0.image != nil else { return false }
                return (ultima[id] ?? .distantPast) < corte
            }
            .sorted { $0.1 < $1.1 }
            .prefix(Self.stops)
            .compactMap { target($0.0, $0.1) }

        return Response(km: km, photoless: Array(sinFoto), stale: Array(caducadas))
    }
}
