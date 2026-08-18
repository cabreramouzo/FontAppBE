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
              -- Las escondidas no cuentan para la cobertura: una comarca no está mejor
              -- cubierta por tener duplicados, y una fuente retirada ya no hay que ir a
              -- comprobarla.
              AND \(unsafeRaw: Font.visibleSQL)
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

    // MARK: - Tu entorno

    /// Cuántas fuentes entran en el objetivo de barrio.
    ///
    /// **Treinta, y es un recuento y no un radio — eso es la mitad del diseño.** Medido
    /// sobre la base real: a 5 km hay 53 fuentes en Castellcir y 1.482 en el centro de
    /// Barcelona, veintiocho veces más. Con un radio fijo el objetivo sale terminable en
    /// un sitio e inalcanzable en el otro, que es exactamente el defecto que esto viene a
    /// arreglar. Con las treinta más cercanas el denominador es el mismo en todas partes y
    /// el radio se ajusta solo — medido en los mismos puntos: 0,6 km en Barcelona, 0,9 en
    /// Girona, 2,9 en Vic, 3,7 en Castellcir, 4,7 en el Pirineo. Un barrio a pie, se viva
    /// donde se viva.
    ///
    /// Treinta y no diez porque cada foto tiene que mover la barra de forma visible
    /// (3,3 %) sin que se llene en una tarde y deje de haber objetivo.
    static let localFonts = 30

    /// Hasta dónde se busca antes de rendirse. Si hay que irse a más de 25 km para juntar
    /// treinta, esto ya no es «tu entorno» y llamarlo así sería mentir: se devuelven las
    /// que haya dentro y el radio real va en la respuesta.
    static let localMaxKm = 25.0

    /// Redondeo de las coordenadas **antes de consultar**.
    ///
    /// La regla es de `/activity` (ver `ActivityController.coordStep`) y es una regla, no
    /// una optimización: hay que redondear la coordenada con la que se consulta y no solo
    /// la clave de la caché, o dos personas de sitios distintos se llevarían el resultado
    /// de la otra.
    ///
    /// Aquí además se busca el efecto secundario. Medio kilómetro de rejilla hace que los
    /// vecinos compartan centro y vean **el mismo objetivo con las mismas fuentes**, que
    /// es lo que convierte esto en algo colectivo en vez de en otro marcador personal.
    static let localStep = 0.005

    static func snapLocal(_ v: Double) -> Double { (v / localStep).rounded() * localStep }

    /// El objetivo de barrio: la cobertura de las fuentes que tienes al lado.
    ///
    /// ## Por qué no basta con la comarca
    ///
    /// La barra de una demarcación entera no se mueve nunca. «Barcelona: 24 de 8.007 con
    /// foto» es verdad y es inútil: nadie va a terminar eso, así que no invita a empezar.
    /// La misma barra sobre las treinta fuentes que tienes andando se termina entre unos
    /// pocos vecinos, y una foto la sube un 3 %, que se ve.
    ///
    /// ## Por qué no es un pueblo
    ///
    /// Sería mejor poder decir «Castellcir» en vez de «lo que tienes alrededor», pero eso
    /// pide una columna de municipio y un fichero de fronteras municipales, y hoy ni
    /// siquiera `region` está poblada del todo. Además convierte `/zones` en un directorio
    /// de cientos de pueblos, que es una lista que nadie lee. Esto no añade ninguna
    /// entrada a ninguna lista: es **una** tarjeta calculada desde tus coordenadas.
    static func local(lat rawLat: Double, long rawLong: Double,
                      on db: any Database, now: Date = Date()) async throws -> Local {
        let lat = snapLocal(rawLat)
        let long = snapLocal(rawLong)
        guard let sql = db as? SQLDatabase else {
            return Local(fonts: 0, radiusKm: 0, withPhoto: 0, checkedRecently: 0, contributors: 0)
        }
        let corte = now.addingTimeInterval(-freshDays * 86_400)
        // Prefiltro por caja, igual que en el resto de consultas de cercanía: un grado de
        // latitud son ~111 km y en longitud los meridianos se juntan al subir, de ahí el
        // coseno. La caja es cuadrada y el objetivo redondo, así que el radio se vuelve a
        // exigir después sobre las pocas que quedan.
        let dLat = localMaxKm / 111.0
        let dLong = localMaxKm / (111.0 * max(cos(lat * .pi / 180), 0.01))

        struct Fila: Decodable {
            let fonts: Int
            let with_photo: Int
            let radius_km: Double
            let contributors: Int
            let checked: Int
        }

        let fila = try await sql.raw("""
            WITH cercanas AS (
                SELECT f.id, f.image,
                       sqrt(power((f.latitude - \(bind: lat)) * 111.0, 2)
                          + power((f.longitude - \(bind: long)) * 111.0
                                  * cos(radians(\(bind: lat))), 2)) AS km
                FROM fonts f
                WHERE f.latitude  BETWEEN \(bind: lat - dLat)  AND \(bind: lat + dLat)
                  AND f.longitude BETWEEN \(bind: long - dLong) AND \(bind: long + dLong)
                  AND \(unsafeRaw: Font.visibleSQL)
                ORDER BY km
                LIMIT \(bind: localFonts)
            ),
            dentro AS (SELECT * FROM cercanas WHERE km <= \(bind: localMaxKm)),
            agg AS (
                SELECT count(*) AS fonts, count(image) AS with_photo,
                       coalesce(max(km), 0) AS radius_km
                FROM dentro
            ),
            -- Las reseñas se miran solo de esas treinta, no de la tabla entera: es la
            -- diferencia entre una consulta de barrio y un recuento global cada 5 min.
            com AS (
                SELECT count(DISTINCT user_id) AS contributors,
                       count(DISTINCT font_id) FILTER (WHERE created_at >= \(bind: corte)) AS checked
                FROM font_comments
                WHERE font_id IN (SELECT id FROM dentro)
            )
            SELECT agg.fonts, agg.with_photo, agg.radius_km, com.contributors, com.checked
            FROM agg, com
            """).first(decoding: Fila.self)

        guard let fila else { return Local(fonts: 0, radiusKm: 0, withPhoto: 0, checkedRecently: 0, contributors: 0) }
        return Local(fonts: fila.fonts,
                     // Un decimal: el metro exacto ni se sabe ni importa, y «4,7 km»
                     // se lee de un vistazo donde «4,712834 km» no.
                     radiusKm: (fila.radius_km * 10).rounded() / 10,
                     withPhoto: fila.with_photo,
                     checkedRecently: fila.checked,
                     contributors: fila.contributors)
    }

    struct Local: Content, Sendable {
        /// Cuántas ha juntado. Menos de `localFonts` si alrededor no hay más.
        let fonts: Int
        /// Hasta dónde ha tenido que llegar, en km. Va en la respuesta porque es lo que
        /// convierte «treinta fuentes» en un sitio: no es lo mismo a 600 m que a 5 km.
        let radiusKm: Double
        let withPhoto: Int
        let checkedRecently: Int
        let photoPct: Int
        let freshPct: Int
        /// Cuánta gente distinta ha reseñado alguna de ellas, alguna vez.
        ///
        /// Es la mitad colectiva del dato: sin esto la tarjeta es un marcador personal.
        /// No sale ningún nombre —solo cuántos—, así que `gamification_opt_out` no pinta
        /// nada aquí, igual que en las barras de comarca: el territorio no es de nadie.
        let contributors: Int
        /// El corte de «comprobada hace poco», para que la interfaz lo explique sin
        /// repetir el número por su cuenta.
        let freshDays: Int

        init(fonts: Int, radiusKm: Double, withPhoto: Int, checkedRecently: Int, contributors: Int) {
            self.fonts = fonts
            self.radiusKm = radiusKm
            self.withPhoto = withPhoto
            self.checkedRecently = checkedRecently
            self.contributors = contributors
            func pct(_ n: Int) -> Int { fonts == 0 ? 0 : Int((Double(n) * 100 / Double(fonts)).rounded()) }
            self.photoPct = pct(withPhoto)
            self.freshPct = pct(checkedRecently)
            self.freshDays = Int(ZoneStats.freshDays)
        }
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
