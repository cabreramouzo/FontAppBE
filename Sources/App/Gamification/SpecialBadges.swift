import Fluent
import Foundation
import SQLKit
import Vapor

/// Insignias **especiales**: las que no son un contador sino un hecho.
///
/// Las veintiuna familias normales responden a «cuántas llevas». Éstas responden a «hiciste
/// aquello», y por eso se conceden una vez y se guardan (`BadgeAward`) en vez de calcularse
/// cada vez. La diferencia no es estética: una de ellas tiene **cupo**, y un cupo que se
/// recalcula no es un cupo.
///
/// Añadir una es escribir una entrada en `catalogue` y una función que devuelva quién la
/// cumple y desde cuándo. Todo lo demás —cupo, idempotencia, aparecer en el perfil, en el
/// perfil público, en la vitrina y en la celebración— ya está.
enum SpecialBadges {

    /// Una insignia especial del catálogo.
    struct Special: Sendable {
        let key: String
        /// Castellano, para la consola. La interfaz traduce por `key`, como siempre.
        let name: String
        /// Plazas totales. `nil` = sin límite. Cuando se agotan, ya no se concede a nadie.
        let limit: Int?
    }

    static let catalogue: [Special] = [
        .init(key: "catalonia", name: "Catalunya sencera", limit: nil),
        .init(key: "betatester", name: "Betatester", limit: 100),
    ]

    static func find(_ key: String) -> Special? { catalogue.first { $0.key == key } }

    /// Los tipos de aportación que son «una reseña». Lo usan las dos insignias, y por
    /// eso vive aquí arriba y no dentro de una: si mañana se añade un tipo de reseña,
    /// las dos tienen que enterarse a la vez o dirán cosas distintas de lo mismo.
    static let reviewKinds = ["firstReview", "updateReview"]

    // MARK: - Catalunya

    /// Las cuatro demarcaciones catalanas, **con sus dos grafías**.
    ///
    /// Esto no es un capricho: `fonts.region` lo rellena `populate-regions` a partir de un
    /// GeoJSON de fronteras, y el fichero que se usó en producción trae los topónimos en
    /// catalán («Girona», «Lleida») mientras que otros traen el exónimo castellano
    /// («Gerona», «Lérida»). Comprobado: la base de producción dice Girona/Lleida y una
    /// local repoblada con Natural Earth dice Gerona/Lérida. Aceptar las dos formas es más
    /// barato y menos frágil que normalizar la columna, que obligaría a volver a pasar el
    /// poblado cada vez que cambie el origen de los datos.
    ///
    /// Se cuenta por **demarcación** y no por comarca de las 41 porque la app llama
    /// «comarca» a `fonts.region` en todas partes —el ranking, las barras de zona— y ésa
    /// es la unidad que la base de datos sabe decir. Pedir las 41 de verdad sería una
    /// insignia que no gana nadie nunca.
    static let catalanRegions: [String: String] = [
        "Barcelona": "Barcelona",
        "Girona": "Girona", "Gerona": "Girona",
        "Lleida": "Lleida", "Lérida": "Lleida", "Lerida": "Lleida",
        "Tarragona": "Tarragona",
    ]

    /// Quién ha **reseñado** en las cuatro, y cuándo completó la cuarta.
    ///
    /// Reseñas y no cualquier aportación (`reviewKinds`): crear una fuente en Lleida es
    /// ponerla en el mapa, no haber estado a comprobarla, y esta insignia es de haber
    /// recorrido el país. Abrirla a todo tipo de aportación es quitar el filtro de
    /// `kind` de aquí abajo, pero entonces se gana desde el sofá editando fichas.
    ///
    /// El `country` va en la condición aunque los cuatro nombres parezcan inconfundibles:
    /// `region` es la primera división administrativa **de cualquier país** y el día que
    /// entren fuentes de otro sitio con una demarcación homónima, esto las contaría.
    ///
    /// La fecha es la de la reseña que cerró el conjunto, no la de la última de todas:
    /// es el momento en que se ganó, y es lo que se enseña.
    static func catalanCompleters(on db: any SQLDatabase) async throws -> [UUID: Date] {
        struct Fila: Decodable { let user_id: UUID; let region: String; let at: Date }
        let nombres = Array(catalanRegions.keys)
        // Una fila por (persona, demarcación) con la primera vez que reseñó allí. Son
        // pocas por definición —como mucho seis por persona— así que el conjunto se cierra
        // en Swift, donde además se puede unificar Girona/Gerona sin un CASE en el SQL.
        let filas = try await db.raw("""
            SELECT e.user_id, f.region, MIN(e.occurred_at) AS at
            FROM contribution_events e
            JOIN fonts f ON f.id = e.font_id
            WHERE e.status = 'settled'
              AND e.kind = ANY(\(bind: reviewKinds))
              AND f.country = 'Spain'
              AND f.region = ANY(\(bind: nombres))
            GROUP BY e.user_id, f.region
            """).all(decoding: Fila.self)

        var porPersona: [UUID: [String: Date]] = [:]
        for f in filas {
            guard let canon = catalanRegions[f.region] else { continue }
            let previa = porPersona[f.user_id]?[canon]
            if previa == nil || f.at < previa! { porPersona[f.user_id, default: [:]][canon] = f.at }
        }
        return porPersona.compactMapValues { $0.count == 4 ? $0.values.max() : nil }
    }

    // MARK: - Betatester

    /// Reseñas que hacen falta para entrar en la carrera.
    static let betatesterReviews = 15

    /// Quién ha llegado a 15 reseñas liquidadas, y **cuándo llegó a la decimoquinta**.
    ///
    /// La fecha importa más de lo que parece: es la que ordena la carrera. Al volcar el
    /// histórico de golpe, mucha gente cumple la condición en el mismo barrido, y
    /// repartir por el orden en que la base devuelva las filas daría un resultado
    /// arbitrario. Ordenando por el momento real en que cada quien hizo su reseña número
    /// quince, las cien plazas caen en las cien personas que de verdad llegaron antes.
    static func betatesterQualifiers(on db: any SQLDatabase) async throws -> [(userID: UUID, at: Date)] {
        struct Fila: Decodable { let user_id: UUID; let at: Date }
        let filas = try await db.raw("""
            SELECT user_id, occurred_at AS at FROM (
              SELECT user_id, occurred_at,
                     ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY occurred_at, id) AS n
              FROM contribution_events
              WHERE status = 'settled' AND kind = ANY(\(bind: reviewKinds))
            ) t WHERE n = \(bind: betatesterReviews)
            ORDER BY at
            """).all(decoding: Fila.self)
        return filas.map { ($0.user_id, $0.at) }
    }

    // MARK: - Concesión

    struct AwardResult: Sendable {
        var granted: [String: Int] = [:]
        var total: Int { granted.values.reduce(0, +) }
    }

    /// Reparte lo que toque. Idempotente: lo ya concedido se salta, y el cupo se cuenta
    /// sobre lo que hay en la tabla, no sobre lo que se acaba de calcular.
    ///
    /// Se llama al final de `ContributionLedger.sync()`, cuando la liquidación de este
    /// barrido ya está hecha: una insignia que se gana con reseñas liquidadas no puede
    /// mirar un estado a medio actualizar. Y como `sync()` corre bajo el cerrojo de
    /// Postgres del trabajador, dos máquinas no se pelean por la última plaza — aunque si
    /// lo hicieran, el índice único haría de red.
    /// - Parameter limits: cupos alternativos por clave. Existe para poder probar que el
    ///   cupo se agota de verdad sin registrar cien personas en un test; en producción
    ///   nunca se pasa y manda el catálogo.
    @discardableResult
    static func award(on db: any Database, dryRun: Bool = false,
                      limits: [String: Int]? = nil) async throws -> AwardResult {
        guard let sql = db as? any SQLDatabase else { return AwardResult() }
        var out = AwardResult()

        let existentes = try await BadgeAward.query(on: db).all()
        var yaTiene: Set<String> = []
        var repartidas: [String: Int] = [:]
        for a in existentes {
            yaTiene.insert("\(a.$user.id):\(a.key)")
            repartidas[a.key, default: 0] += 1
        }

        /// Candidatas **en orden**: quien antes cumplió, antes entra. Solo se usa el orden
        /// cuando hay cupo, pero mantenerlo siempre evita que añadir un cupo más adelante
        /// cambie en silencio a quién le tocó.
        func conceder(_ key: String, _ candidatas: [(userID: UUID, at: Date)]) async throws {
            guard let especial = find(key) else { return }
            let cupo = limits?[key] ?? especial.limit
            var quedan = cupo.map { $0 - (repartidas[key] ?? 0) } ?? Int.max
            guard quedan > 0 else { return }
            for c in candidatas {
                guard quedan > 0 else { break }
                guard !yaTiene.contains("\(c.userID):\(key)") else { continue }
                if !dryRun {
                    try await BadgeAward(userID: c.userID, key: key, earnedAt: c.at).save(on: db)
                }
                yaTiene.insert("\(c.userID):\(key)")
                quedan -= 1
                out.granted[key, default: 0] += 1
            }
        }

        let catalanes = try await catalanCompleters(on: sql)
            .map { (userID: $0.key, at: $0.value) }
            .sorted { $0.at < $1.at }
        try await conceder("catalonia", catalanes)
        try await conceder("betatester", betatesterQualifiers(on: sql))

        return out
    }

    /// Cuántas plazas quedan de cada una. Para la página pública: «quedan 38 de 100» es
    /// media insignia por sí solo, y saber que se han agotado evita perseguir algo que ya
    /// no está.
    static func remaining(on db: any Database) async throws -> [String: Int] {
        var out: [String: Int] = [:]
        for e in catalogue {
            guard let limite = e.limit else { continue }
            let dadas = try await BadgeAward.query(on: db).filter(\.$key == e.key).count()
            out[e.key] = max(0, limite - dadas)
        }
        return out
    }
}
