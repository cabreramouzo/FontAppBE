import Fluent
import Vapor

/// Páginas por pueblo: «Fonts a Moià».
///
/// ## Por qué existe
///
/// Es el único canal que sigue trayendo gente cuando dejas de empujar. Nadie busca el
/// nombre de una fuente suelta —y el sitemap solo puede ofrecer las 553 que ha tocado
/// alguien—, pero «fonts Moià» o «fuentes Castellterçol» sí se busca. Con 6.568 pueblos
/// que tienen fuentes cerca, son 6.568 páginas con contenido de verdad.
///
/// ## Pública y cacheada, como `/zones`
///
/// Sin sesión (quien llega de Google no la tiene) y con la misma cota de 120/h por IP: es
/// una ruta cara y pública, y ahí ya sabemos que hace falta.
struct PlaceController: RouteCollection {
    /// Cuántas fuentes se enseñan. La página es para orientarse y para que Google vea
    /// contenido, no para volcar mil filas: quien quiera todas tiene el mapa.
    static let maxFonts = 60

    func boot(routes: any RoutesBuilder) throws {
        let places = routes.grouped("places")
            .grouped(RateLimitMiddleware(scope: "places", max: 120, window: 60 * 60))
        places.get(use: index)
        places.get(":slug", use: show)
    }

    struct PlaceDTO: Content {
        let slug: String
        let name: String
        let kind: String
        let latitude: Double
        let longitude: Double
        let country: String?
        let region: String?
        let fontCount: Int
    }

    struct PlacePage: Content {
        let place: PlaceDTO
        /// Las más cercanas al centro del pueblo, ordenadas por distancia.
        let fonts: [FontSummary]
        /// Pueblos de al lado, para que se pueda saltar de uno a otro. No es adorno: sin
        /// enlaces entre ellas, 6.568 páginas cuelgan solo del sitemap y se rastrean mal.
        let nearby: [PlaceDTO]
    }

    /// GET /places?region=&limit= — el listado, para el índice y el sitemap.
    @Sendable func index(req: Request) async throws -> [PlaceDTO] {
        let limit = min(max(1, (try? req.query.get(Int.self, at: "limit")) ?? 200), 1000)
        var q = Place.query(on: req.db).filter(\.$fontCount > 0)
        if let region: String = req.query["region"] { q = q.filter(\.$region == region) }
        let lugares = try await q.sort(\.$fontCount, .descending).limit(limit).all()
        return lugares.map(Self.dto)
    }

    /// GET /places/:slug — la página de un pueblo.
    @Sendable func show(req: Request) async throws -> PlacePage {
        guard let slug = req.parameters.get("slug"),
              let lugar = try await Place.query(on: req.db).filter(\.$slug == slug).first()
        else { throw AppError(.notFound, "place.notFound", "No conocemos ese pueblo") }

        let km = lugar.radioKm
        let dLat = km / 111.0
        let dLong = km / (111.0 * max(0.1, cos(lugar.latitude * .pi / 180)))
        // Caja y después haversine, como el resto de la app: la caja la resuelve el índice
        // y el haversine afina, que a estas latitudes no es lo mismo.
        let candidatas = try await Font.visible(on: req.db)
            .filter(\.$latitude >= lugar.latitude - dLat)
            .filter(\.$latitude <= lugar.latitude + dLat)
            .filter(\.$longitude >= lugar.longitude - dLong)
            .filter(\.$longitude <= lugar.longitude + dLong)
            .limit(Self.maxFonts * 10)
            .all()
        let cerca = candidatas
            .sorted { haversineKm(lugar.latitude, lugar.longitude, $0.latitude, $0.longitude)
                    < haversineKm(lugar.latitude, lugar.longitude, $1.latitude, $1.longitude) }
            .prefix(Self.maxFonts)
            .map { $0 }

        // Los vecinos: los seis **más cercanos** con fuentes, no los seis mayores de la
        // caja. Ordenando por número salían Granollers y Castellar del Vallès como
        // «vecinos» de Moià —a 28 km, los más grandes que cabían— y eso no es un pueblo de
        // al lado ni para el lector ni para quien rastrea el sitio.
        let candidatosVecinos = try await Place.query(on: req.db)
            .filter(\.$fontCount > 0)
            .filter(\.$slug != slug)
            .filter(\.$latitude >= lugar.latitude - 0.25)
            .filter(\.$latitude <= lugar.latitude + 0.25)
            .filter(\.$longitude >= lugar.longitude - 0.35)
            .filter(\.$longitude <= lugar.longitude + 0.35)
            .all()
        let vecinos = candidatosVecinos
            .sorted { haversineKm(lugar.latitude, lugar.longitude, $0.latitude, $0.longitude)
                    < haversineKm(lugar.latitude, lugar.longitude, $1.latitude, $1.longitude) }
            .prefix(6)
            .map { $0 }

        return PlacePage(place: Self.dto(lugar),
                         fonts: try await Font.summaries(for: cerca, on: req.db),
                         nearby: vecinos.map(Self.dto))
    }

    static func dto(_ p: Place) -> PlaceDTO {
        PlaceDTO(slug: p.slug, name: p.name, kind: p.kind,
                 latitude: p.latitude, longitude: p.longitude,
                 country: p.country, region: p.region, fontCount: p.fontCount)
    }
}
