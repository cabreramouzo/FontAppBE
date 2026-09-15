import Fluent
import SQLKit
import Vapor

/// `GET /stats` — cifras globales de la base, públicas y cacheadas.
///
/// Nació para un easter egg (tocar el logo hace llover gotas con el número de fuentes),
/// pero es un agregado reutilizable —la home o el SEO pueden querer «160.738 fuentes»— y
/// por eso vive en su ruta y no escondido en el cliente. No expone nada que no se vea ya
/// sumando el mapa; solo lo da hecho.
///
/// Cacheado en memoria (misma `ZoneCache` que `/zones`): son dos `COUNT` sobre las tablas
/// grandes y la cifra no cambia de un minuto a otro.
struct StatsController: RouteCollection {
    static let cache = ZoneCache()

    func boot(routes: any RoutesBuilder) throws {
        routes.grouped("stats")
            .grouped(RateLimitMiddleware(scope: "stats", max: 120, window: 60 * 60))
            .get(use: stats)
    }

    struct StatsResponse: Content, Sendable {
        /// Fuentes visibles (las mismas que cuenta el mapa: sin duplicadas ni retiradas).
        let total: Int
        /// Cuántas ha comprobado alguien alguna vez (algún parte con estado del agua). Es
        /// la mitad honesta de la cifra: casi ninguna, y eso es justo lo que invita a
        /// aportar.
        let checked: Int
    }

    @Sendable func stats(req: Request) async throws -> StatsResponse {
        if let cacheada = await Self.cache.get("stats", as: StatsResponse.self) { return cacheada }
        let total = try await Font.visible(on: req.db).count()
        var checked = 0
        // `count(DISTINCT …)` no lo expresa Fluent con comodidad; en SQLite (tests) se
        // queda en 0, que es una cifra honesta para una base sembrada.
        if let sql = req.db as? SQLDatabase {
            struct Row: Decodable { let n: Int }
            checked = try await sql.raw(
                "SELECT count(DISTINCT font_id) AS n FROM font_comments WHERE water_status IS NOT NULL"
            ).first(decoding: Row.self)?.n ?? 0
        }
        let out = StatsResponse(total: total, checked: checked)
        await Self.cache.set("stats", out)
        return out
    }
}
