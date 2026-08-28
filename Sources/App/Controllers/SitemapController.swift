import Fluent
import Foundation
import SQLKit
import Vapor

/// Qué fichas de fuente merece la pena que un buscador conozca.
///
/// ## Por qué no salen las 60.000
///
/// Una ficha que solo tiene un nombre y unas coordenadas es *thin content* de manual.
/// Mandarle a Google sesenta mil páginas casi idénticas no consigue sesenta mil páginas
/// indexadas: consigue que no se fíe del sitio entero. Aquí solo entran las que **ha
/// tocado una persona**, y el sitemap crece solo a medida que la gente aporta.
///
/// ## Por qué «la ha tocado una persona» y no «tiene descripción»
///
/// Porque `description` la rellenan los importadores y por tanto no prueba nada. Medido
/// sobre la base: de 9.935 fuentes con descripción, **9.692 son la atribución** —«© ICGC/ACA»
/// y «Manantial (OpenStreetMap)»—, la misma cadena repetida miles de veces. Contarlas como
/// contenido metía en el sitemap justo aquello de lo que este comentario avisa.
///
/// Las cuatro señales de mano humana, todas exactas y ninguna heurística: foto, alguna
/// reseña, `created_by` no nulo (la puso alguien, no el importador) o alguna edición. Con
/// eso, la misma base pasa de 9.935 candidatas a 553.
///
/// Es además el bucle que cierra la tarjeta de entorno de `/zones`: una foto convierte una
/// ficha muda en una página que existe, esa página trae a alguien, y ese alguien aporta.
///
/// ## Por qué devuelve JSON y no el XML
///
/// Las URLs del sitemap son del **frontend** (`https://fontapp.net/fonts/:id`) y este
/// servidor no debería saberlas: hoy hay un dominio, pero `WEB_ORIGIN` ya admite varios y
/// el día que haya un segundo, el XML tendría que elegir. Aquí se dice *qué* indexar y en
/// Cloudflare se dice *bajo qué dominio*, que es quien lo sabe.
struct SitemapController: RouteCollection {
    /// Tope del protocolo de sitemaps por fichero. No lo vamos a rozar en años, pero un
    /// `LIMIT` es lo que separa una consulta de una descarga accidental de la base.
    static let maxURLs = 50_000

    func boot(routes: any RoutesBuilder) throws {
        let sitemap = routes.grouped("sitemap")
            .grouped(RateLimitMiddleware(scope: "sitemap", max: 60, window: 60 * 60))
        sitemap.get("fonts", use: fonts)
        sitemap.get("places", use: places)
    }

    /// Cuántas fuentes tiene que haber cerca de un pueblo para que su página entre.
    ///
    /// Con una o dos, la página es tan delgada como la ficha de una fuente muda —y el
    /// comentario de arriba explica por qué eso hace daño en vez de bien—. Medido sobre la
    /// base: de 8.790 núcleos, 2.222 no tienen ninguna y 3.276 tienen entre una y cuatro.
    /// Con el corte en tres quedan unas 3.700 páginas con algo que contar.
    static let minFontsPorPueblo = 3

    struct PlaceEntry: Content, Sendable {
        let slug: String
        let fontCount: Int
    }

    /// GET /sitemap/places — los pueblos con fuentes suficientes para tener página.
    ///
    /// Esto es lo que de verdad puede traer gente de un buscador: nadie busca el nombre de
    /// una fuente suelta, pero «fonts Moià» sí. Y a diferencia de las fichas, estas páginas
    /// existen desde el primer día, sin esperar a que alguien aporte.
    @Sendable func places(req: Request) async throws -> [PlaceEntry] {
        let lugares = try await Place.query(on: req.db)
            .filter(\.$fontCount >= Self.minFontsPorPueblo)
            .sort(\.$fontCount, .descending)
            .limit(Self.maxURLs)
            .all()
        return lugares.map { PlaceEntry(slug: $0.slug, fontCount: $0.fontCount) }
    }

    struct Entry: Content, Sendable {
        let id: UUID
        /// Última vez que cambió algo que se lee en la ficha. Si nunca se ha reseñado, la
        /// fecha de creación.
        let lastmod: Date
    }

    /// GET /sitemap/fonts — las fichas que vale la pena indexar, la más fresca primero.
    @Sendable func fonts(req: Request) async throws -> [Entry] {
        guard let sql = req.db as? any SQLDatabase else { return [] }
        struct Fila: Decodable { let id: UUID; let lastmod: Date }
        let filas = try await sql.raw("""
            SELECT f.id,
                   GREATEST(f.created_at,
                            COALESCE(c.last_at, f.created_at),
                            COALESCE(e.last_at, f.created_at)) AS lastmod
            FROM fonts f
            LEFT JOIN (
                SELECT font_id, MAX(created_at) AS last_at FROM font_comments GROUP BY font_id
            ) c ON c.font_id = f.id
            LEFT JOIN (
                SELECT font_id, MAX(created_at) AS last_at FROM font_edits GROUP BY font_id
            ) e ON e.font_id = f.id
            -- Escondidas fuera, como en toda lectura pública que devuelve varias fuentes.
            -- Aquí importa el doble: una duplicada indexada compite con la buena por la
            -- misma búsqueda y las dos salen perdiendo.
            WHERE \(unsafeRaw: Font.visibleSQL)
              AND (
                    f.image IS NOT NULL       -- alguien fue y la fotografió
                 OR f.created_by IS NOT NULL  -- alguien la puso, no un importador
                 OR c.font_id IS NOT NULL     -- alguien la ha reseñado
                 OR e.font_id IS NOT NULL     -- alguien la ha corregido
              )
            ORDER BY lastmod DESC
            LIMIT \(bind: Self.maxURLs)
            """).all(decoding: Fila.self)
        return filas.map { Entry(id: $0.id, lastmod: $0.lastmod) }
    }
}
