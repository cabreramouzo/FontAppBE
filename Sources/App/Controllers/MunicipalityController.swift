import Fluent
import Vapor

/// La página pública de un municipio: `GET /municipalities/:ine`.
///
/// ## Por qué es pública y sin sesión
///
/// Porque lo que enseña **ya es público**: son las mismas fuentes que cualquiera ve en el
/// mapa, agrupadas por el municipio real en vez de por una caja. Poner una puerta delante
/// sería cerrar datos abiertos —la mayoría vienen de OpenStreetMap (ODbL) y del ICGC/ACA—
/// para proteger algo que no es nuestro.
///
/// La parte que algún día se cobrará no es esto: es la gestión, los avisos, el histórico y
/// las campañas de verificación. Ver `docs/ayuntamientos.md`.
///
/// ## Por qué el INE y no el nombre
///
/// Porque hay municipios que se llaman igual en provincias distintas y el nombre no es
/// clave. Con nombre se contesta **la lista de candidatos**, no uno elegido a dedo: elegir
/// significaría enseñarle a alguien el inventario de otro pueblo con el rótulo del suyo.
struct MunicipalityController: RouteCollection {
    static let cache = ZoneCache()

    func boot(routes: RoutesBuilder) throws {
        // Ruta pública y cara —una consulta con tres LATERAL por fuente—, así que el mismo
        // tope que `/zones` y la misma caché de cinco minutos. Un municipio cambia unas
        // pocas veces al año; cinco minutos de retraso no se los cree nadie problema.
        let grupo = routes.grouped(RateLimitMiddleware(scope: "municipalities", max: 120, window: 60 * 60))
        grupo.get("municipalities", ":ine", use: report)
        grupo.get("municipalities", use: search)
        grupo.get("municipalities", ":ine", "boundary", use: boundary)
    }

    func report(req: Request) async throws -> MunicipalReport {
        let ine = try req.parameters.require("ine")
        // Cinco dígitos y nada más: el parámetro entra en un `WHERE` con bind, así que no
        // hay inyección, pero sí se evita cachear basura con cualquier cadena que llegue.
        guard ine.count == 5, ine.allSatisfy(\.isNumber) else {
            throw AppError(.badRequest, "municipality.badCode", "El código INE son cinco dígitos.")
        }
        if let cacheado = await Self.cache.get(ine, as: MunicipalReport.self) { return cacheado }
        guard let r = try await MunicipalReport.of(ine: ine, on: req.db) else {
            throw AppError(.notFound, "municipality.notFound", "No hay ninguna fuente en ese municipio.")
        }
        await Self.cache.set(ine, r)
        return r
    }

    /// El contorno del municipio, para dibujarlo. Va **aparte del informe** porque son
    /// dos cosas con vidas distintas: el informe cambia cada vez que alguien reseña una
    /// fuente y el contorno no cambia nunca. Juntos, cada visita a la página arrastraría
    /// dos kilobytes de polígono que ya estaban en el navegador, y la caché del informe
    /// —cinco minutos— tiraría también el polígono.
    struct Boundary: Content, Sendable {
        let ine: String
        let name: String
        /// `[minLong, minLat, maxLong, maxLat]`, el orden de GeoJSON.
        let bbox: [Double]
        let multiPolygon: [[[[Double]]]]
    }

    func boundary(req: Request) async throws -> Boundary {
        let ine = try req.parameters.require("ine")
        guard ine.count == 5, ine.allSatisfy(\.isNumber) else {
            throw AppError(.badRequest, "municipality.badCode", "El código INE son cinco dígitos.")
        }
        guard let b = try await MunicipalBoundary.find(ine, on: req.db) else {
            throw AppError(.notFound, "municipality.noBoundary", "No hay contorno para ese municipio.")
        }
        // Un año de caché: los límites municipales no se mueven, y cuando se mueven se
        // vuelve a importar el fichero y cambia la respuesta de todas formas.
        req.headers.cacheControl = .init(isPublic: true, maxAge: 60 * 60 * 24 * 365)
        return Boundary(ine: b.id ?? ine, name: b.name,
                        bbox: [b.minLong, b.minLat, b.maxLong, b.maxLat],
                        multiPolygon: b.rings.multiPolygon)
    }

    /// `GET /municipalities?name=Arroyomolinos` → los candidatos con su código.
    func search(req: Request) async throws -> [MunicipalReport.Candidato] {
        guard let nombre = req.query[String.self, at: "name"], nombre.count >= 2 else { return [] }
        return try await MunicipalReport.candidates(name: nombre, on: req.db)
    }
}
