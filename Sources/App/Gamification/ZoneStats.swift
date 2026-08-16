import Fluent
import Foundation
import SQLKit
import Vapor

/// La mitad no competitiva de la gamificación. Fase 5 del plan (docs/gamificacion.md).
///
/// Dos lecturas de lo mismo, y el orden importa:
///
/// - **Cobertura por zona** — cuántas fuentes de tu comarca tienen foto y cuántas ha
///   comprobado alguien últimamente. La unidad es el territorio, no la persona: aquí no
///   se gana ni se pierde, y quien ha apagado la gamificación sigue contando.
/// - **Ranking mensual** — y *mensual* es la mitad del diseño. Un ranking histórico
///   global lo gana para siempre quien llegó primero y vive donde hay densidad; a partir
///   de ahí nadie más juega. Cada mes empieza de cero, así que entrar hoy es entrar a
///   tiempo.
///
/// A mucha gente los rankings le dan reparo, y en una app de colaboración ciudadana
/// espantarlos sale carísimo. Por eso la portada de la zona son las barras y la tabla va
/// debajo: quien no quiera competir se lleva igualmente lo que ha venido a ver.
enum ZoneStats {
    /// Cuánto vale una lectura antes de recalcularla. Son consultas de agregación sobre
    /// las tablas grandes y el resultado no cambia de un minuto a otro: la cobertura de
    /// una comarca se mueve con las horas, no con los segundos.
    static let cacheTTL: TimeInterval = 5 * 60

    /// Desde cuándo se considera que una fuente «la ha comprobado alguien». Es el mismo
    /// corte que usa el perfil (`ContributionLedger.freshnessHorizon`) y el mismo que
    /// decide qué entra en la ronda de comprobación de las rutas. Tres sitios con el
    /// mismo número a propósito: si la barra dice que el 40 % está al día, tiene que ser
    /// el mismo 40 % que las rutas no te proponen.
    static let freshDays = 180.0

    /// Cuánta gente sale en la tabla del mes. Veinte es una pantalla; más abajo nadie mira.
    static let rankingLimit = 20

    // MARK: - Cobertura

    struct Coverage: Content, Sendable {
        let country: String?
        let region: String
        let fonts: Int
        let withPhoto: Int
        /// Fuentes con alguna reseña en los últimos `freshDays` días.
        let checkedRecently: Int
        /// Los porcentajes se calculan aquí y **viajan en la respuesta** en vez de
        /// dejárselos al cliente: los pintan la web y el correo semanal, y dos
        /// redondeos distintos darían «12 %» en un sitio y «13 %» en el otro para el
        /// mismo dato el mismo día.
        let photoPct: Int
        let freshPct: Int

        init(country: String?, region: String, fonts: Int, withPhoto: Int, checkedRecently: Int) {
            self.country = country
            self.region = region
            self.fonts = fonts
            self.withPhoto = withPhoto
            self.checkedRecently = checkedRecently
            func pct(_ n: Int) -> Int { fonts == 0 ? 0 : Int((Double(n) * 100 / Double(fonts)).rounded()) }
            self.photoPct = pct(withPhoto)
            self.freshPct = pct(checkedRecently)
        }
    }

    /// Cobertura de todas las zonas clasificadas, de más fuentes a menos.
    ///
    /// Las fuentes sin `region` se quedan fuera en vez de agruparse en un «sin zona»:
    /// una barra de progreso sobre un cajón de sastre no mide nada, y el cajón sería el
    /// más grande de la lista mientras `populate-regions` no haya pasado por todas.
    static func coverage(on db: any Database, now: Date = Date()) async throws -> [Coverage] {
        guard let sql = db as? SQLDatabase else { return [] }
        let corte = now.addingTimeInterval(-freshDays * 86_400)

        // Una sola consulta. La subconsulta de comentarios se agrupa antes de unir, o el
        // COUNT(*) de fuentes contaría una vez por reseña y una fuente muy reseñada
        // inflaría el total de su comarca.
        let filas = try await sql.raw("""
            SELECT f.country AS country,
                   f.region  AS region,
                   COUNT(*)                                              AS fonts,
                   COUNT(f.image)                                        AS with_photo,
                   COUNT(*) FILTER (WHERE c.last_at >= \(bind: corte))   AS checked
            FROM fonts f
            LEFT JOIN (
                SELECT font_id, MAX(created_at) AS last_at
                FROM font_comments
                GROUP BY font_id
            ) c ON c.font_id = f.id
            WHERE f.region IS NOT NULL AND f.region <> ''
            GROUP BY f.country, f.region
            ORDER BY fonts DESC
            """).all(decoding: CoverageRow.self)

        return filas.map {
            Coverage(country: $0.country, region: $0.region,
                     fonts: $0.fonts, withPhoto: $0.with_photo, checkedRecently: $0.checked)
        }
    }

    /// Nombres de columna en snake_case porque los decodifica SQLKit directamente.
    private struct CoverageRow: Decodable {
        let country: String?
        let region: String
        let fonts: Int
        let with_photo: Int
        let checked: Int
    }

    /// La cobertura de UNA zona, para el correo semanal (no vale la pena traerlas todas).
    static func coverage(ofRegion region: String, on db: any Database,
                         now: Date = Date()) async throws -> Coverage? {
        try await coverage(on: db, now: now).first { $0.region == region }
    }

    // MARK: - Ranking mensual

    struct RankingRow: Content, Sendable {
        let rank: Int
        let username: String
        let gotes: Int
    }

    struct Ranking: Content, Sendable {
        let region: String
        /// `AAAA-MM`, el mes que se está mirando.
        let month: String
        let rows: [RankingRow]
    }

    /// Ranking de una zona en un mes concreto.
    ///
    /// **Quien ha apagado la gamificación no sale**, aunque sus aportaciones sí cuenten en
    /// las barras de la zona. El interruptor del perfil dice que oculta puntos y tablas;
    /// si apagarlo te siguiera poniendo en una tabla pública, no estaría diciendo la
    /// verdad. Las barras son del territorio y no de nadie, así que ahí no aplica.
    static func ranking(region: String, month: Date, on db: any Database) async throws -> Ranking {
        guard let sql = db as? SQLDatabase else {
            return Ranking(region: region, month: Self.monthKey(month), rows: [])
        }
        let (desde, hasta) = Self.monthBounds(month)

        let filas = try await sql.raw("""
            SELECT u.username AS username, SUM(e.gotes)::bigint AS gotes
            FROM contribution_events e
            JOIN fonts f ON f.id = e.font_id
            JOIN users u ON u.id = e.user_id
            WHERE e.status = 'settled'
              AND f.region = \(bind: region)
              AND e.occurred_at >= \(bind: desde)
              AND e.occurred_at <  \(bind: hasta)
              AND u.gamification_opt_out = false
              AND u.anonymized_at IS NULL
            GROUP BY u.username
            HAVING SUM(e.gotes) > 0
            ORDER BY gotes DESC, u.username ASC
            LIMIT \(bind: rankingLimit)
            """).all(decoding: RankingRowSQL.self)

        return Ranking(
            region: region,
            month: Self.monthKey(month),
            rows: filas.enumerated().map { RankingRow(rank: $0.offset + 1, username: $0.element.username,
                                                      gotes: Int($0.element.gotes)) })
    }

    private struct RankingRowSQL: Decodable {
        let username: String
        let gotes: Int64
    }

    // MARK: - Meses

    /// El mes se corta en **UTC**, igual que se guarda `occurred_at`. Con la zona horaria
    /// local, una aportación del 1 de agosto a las 00:30 en Barcelona caería en julio.
    static var utcCalendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal
    }

    static func monthBounds(_ d: Date) -> (from: Date, to: Date) {
        let cal = utcCalendar
        let comps = cal.dateComponents([.year, .month], from: d)
        let desde = cal.date(from: comps)!
        return (desde, cal.date(byAdding: .month, value: 1, to: desde)!)
    }

    static func monthKey(_ d: Date) -> String {
        let c = utcCalendar.dateComponents([.year, .month], from: d)
        return String(format: "%04d-%02d", c.year ?? 0, c.month ?? 0)
    }

    /// Interpreta un `AAAA-MM` de la query. Devuelve `nil` si no lo es, para poder
    /// contestar 400 en vez de servir silenciosamente el mes actual.
    static func parseMonth(_ s: String) -> Date? {
        let partes = s.split(separator: "-")
        guard partes.count == 2, let año = Int(partes[0]), let mes = Int(partes[1]),
              (1...12).contains(mes), (2000...2100).contains(año) else { return nil }
        return utcCalendar.date(from: DateComponents(year: año, month: mes, day: 1))
    }
}

/// Caché en memoria de las lecturas de zona. Mismo patrón que `ActivityCache`: son rutas
/// públicas, caras y con una respuesta que vale igual durante minutos.
actor ZoneCache {
    private struct Entrada {
        let dato: any Content & Sendable
        let caduca: Date
    }

    private var entradas: [String: Entrada] = [:]

    func get<T: Content & Sendable>(_ key: String, as: T.Type) -> T? {
        guard let e = entradas[key], e.caduca > Date() else {
            entradas[key] = nil
            return nil
        }
        return e.dato as? T
    }

    func set(_ key: String, _ dato: any Content & Sendable) {
        if entradas.count > 200 {
            let ahora = Date()
            entradas = entradas.filter { $0.value.caduca > ahora }
        }
        entradas[key] = Entrada(dato: dato, caduca: Date().addingTimeInterval(ZoneStats.cacheTTL))
    }

    /// La usan los tests: es estática y sobrevive de un caso al siguiente.
    func clear() { entradas.removeAll() }
}
