import Fluent
import Vapor

/// Las zonas: cobertura colectiva y ranking mensual. Fase 5 (docs/gamificacion.md).
///
/// Lectura pública, como `/activity` y `/missions`. Lo que sale son datos de fuentes que
/// ya se ven una a una en el mapa; lo que aporta esto es el agregado, no el acceso. El
/// ranking enseña nombres de usuario, que es lo mismo que ya firma cada reseña en la
/// ficha de una fuente — la tabla dice estrictamente menos que la ficha, porque agrupa
/// por comarca en vez de decir en qué fuente exacta estuviste.
struct ZoneController: RouteCollection {
    /// Compartida entre peticiones: son consultas de agregación sobre las tablas grandes.
    static let cache = ZoneCache()

    func boot(routes: any RoutesBuilder) throws {
        let zones = routes.grouped("zones")
            .grouped(RateLimitMiddleware(scope: "zones", max: 120, window: 60 * 60))
        zones.get(use: coverage)
        zones.get("ranking", use: ranking)
    }

    struct CoverageResponse: Content, Sendable {
        let zones: [ZoneStats.Coverage]
        /// El corte de «comprobada hace poco», en días. Va en la respuesta para que la
        /// interfaz pueda explicarlo sin repetir el número por su cuenta.
        let freshDays: Int
    }

    /// GET /zones — cobertura de todas las zonas clasificadas.
    @Sendable func coverage(req: Request) async throws -> CoverageResponse {
        if let cacheada = await Self.cache.get("coverage", as: CoverageResponse.self) { return cacheada }
        let out = CoverageResponse(zones: try await ZoneStats.coverage(on: req.db),
                                   freshDays: Int(ZoneStats.freshDays))
        await Self.cache.set("coverage", out)
        return out
    }

    struct RankingQuery: Content {
        let region: String
        /// `AAAA-MM`. Si no viene, el mes en curso.
        let month: String?
    }

    /// GET /zones/ranking?region=&month= — la tabla del mes de una zona.
    @Sendable func ranking(req: Request) async throws -> ZoneStats.Ranking {
        let q = try req.query.decode(RankingQuery.self)
        let region = q.region.trimmingCharacters(in: .whitespaces)
        guard !region.isEmpty, region.count <= 100 else {
            throw Abort(.badRequest, reason: "Falta la zona")
        }
        // Un mes ilegible se contesta con un error en vez de servir el mes en curso: si
        // el cliente pide agosto y le damos septiembre sin decir nada, el fallo aparece
        // como datos raros y no como un error.
        let mes: Date
        if let m = q.month {
            guard let parsed = ZoneStats.parseMonth(m) else {
                throw Abort(.badRequest, reason: "El mes tiene que ser AAAA-MM")
            }
            mes = parsed
        } else {
            mes = Date()
        }

        let clave = "ranking:\(region):\(ZoneStats.monthKey(mes))"
        if let cacheada = await Self.cache.get(clave, as: ZoneStats.Ranking.self) { return cacheada }
        let out = try await ZoneStats.ranking(region: region, month: mes, on: req.db)
        await Self.cache.set(clave, out)
        return out
    }
}
