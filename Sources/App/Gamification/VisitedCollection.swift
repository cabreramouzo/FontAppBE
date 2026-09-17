import Fluent
import Foundation
import SQLKit
import Vapor

/// La «Pokédex» de una persona: cuántas fuentes ha visitado y de qué tipos.
///
/// Es la mecánica de colección del documento de ideación (`docs/gamificacion-visitas.md`),
/// con la misma adaptación que el guardián: **visitar = haber reseñado**. Una reseña es lo
/// único que hoy deja constancia verificable de que alguien estuvo delante, así que la
/// colección crece con lo que ya se mide, sin inventar un check-in nuevo.
///
/// ## Por qué colección de TIPOS y no otra lista de fuentes
///
/// El perfil ya tiene cuatro listas de fuentes (favoritas, las que añadiste, tus reseñas,
/// las que dependen de ti), y una quinta de «visitadas» sería casi la misma que «tus
/// reseñas». Lo que no hay en ninguna parte es la parte de **colección completa**: de los
/// seis tipos de fuente que existen, ¿cuáles has visto? Eso es Pokédex de verdad —hay un
/// conjunto cerrado y se completa— y no repite ninguna lista.
///
/// ## El denominador honesto
///
/// El total sobre las 160.000 fuentes no dice nada («8 de 160.000»); es la misma razón por
/// la que `ZoneStats.local` mide sobre las 30 más cercanas y no sobre la demarcación. Aquí
/// el conjunto cerrado son los **tipos** (seis), que se completa de verdad y es igual en
/// todas partes. El recuento total de visitadas va sin denominador: es tu colección, crece
/// y ya está.
enum VisitedCollection {
    struct TypeStat: Content, Sendable {
        /// `rawValue` de `WaterSource` (`tap`, `mountain`…): el rótulo y el emoji los pone
        /// el cliente, que ya tiene ese vocabulario (`SOURCE_EMOJI`).
        let source: String
        /// Fuentes distintas de ese tipo que has visitado. 0 = todavía no lo tienes.
        let count: Int
    }

    /// El objetivo **terminable**: de las fuentes que tienes cerca, cuántas has visitado.
    ///
    /// Es lo que convierte la Pokédex de un contador que solo crece en una misión que se
    /// puede completar, que es lo que engancha. El denominador son **las 30 más cercanas**
    /// (`ZoneStats.localFonts`), no la demarcación ni el país: «has visitado 8 de 160.000»
    /// no invita a nada, «8 de 30 aquí al lado» sí. Mismo criterio y mismas constantes que
    /// `ZoneStats.local`, de donde sale la máquina de las 30 más cercanas.
    struct LocalGoal: Content, Sendable {
        /// Cuántas hay cerca (hasta 30; menos si alrededor no hay más).
        let nearby: Int
        /// De ésas, cuántas has reseñado alguna vez.
        let visited: Int
        /// Hasta dónde llegan esas fuentes, en km: «8 de 30» no es lo mismo a 600 m que a
        /// 5 km, y sin esto no se sabe si el objetivo es un paseo o una excursión.
        let radiusKm: Double
    }

    struct Summary: Content, Sendable {
        /// Fuentes **distintas** que has reseñado alguna vez (visibles). No es el número de
        /// reseñas: diez reseñas de la misma fuente son una visita a efectos de colección.
        let visited: Int
        /// Un elemento por cada tipo de `WaterSource`, en orden fijo, con 0 los que faltan.
        /// Se devuelven todos —también los de cuenta 0— para que el cliente pinte la casilla
        /// gris del que aún no tienes: «5 de 6» invita, esconder el que falta no.
        let types: [TypeStat]
        /// El objetivo local, solo si el cliente mandó coordenadas (y hay fuentes cerca).
        /// Lo rellena el controlador, no `of`: depende de dónde estás, no de tu historial.
        var local: LocalGoal?
    }

    static func of(_ userID: UUID, on db: any Database) async throws -> Summary {
        guard let sql = db as? any SQLDatabase else { return Summary(visited: 0, types: []) }

        struct Total: Decodable { let n: Int }
        let total = try await sql.raw("""
            SELECT count(DISTINCT c.font_id) AS n
            FROM font_comments c
            JOIN fonts f ON f.id = c.font_id
            WHERE c.user_id = \(bind: userID)
              AND \(unsafeRaw: Font.visibleSQL)
            """).all(decoding: Total.self)

        struct PorTipo: Decodable { let source: String; let n: Int }
        let porTipo = try await sql.raw("""
            SELECT f.source AS source, count(DISTINCT c.font_id) AS n
            FROM font_comments c
            JOIN fonts f ON f.id = c.font_id
            WHERE c.user_id = \(bind: userID)
              AND f.source IS NOT NULL
              AND \(unsafeRaw: Font.visibleSQL)
            GROUP BY f.source
            """).all(decoding: PorTipo.self)

        let cuentas = Dictionary(porTipo.map { ($0.source, $0.n) }, uniquingKeysWith: { a, _ in a })
        // El orden lo fija el enum, no la consulta: así la fila de medallones sale siempre
        // igual y el que falta ocupa siempre el mismo hueco.
        let types = WaterSource.allCases.map {
            TypeStat(source: $0.rawValue, count: cuentas[$0.rawValue] ?? 0)
        }
        return Summary(visited: total.first?.n ?? 0, types: types)
    }

    /// Cuántas de tus 30 fuentes más cercanas has visitado. `nil` si no hay ninguna cerca.
    ///
    /// Reutiliza la caja + haversine + `LIMIT 30` de `ZoneStats.local` (mismas constantes),
    /// y sobre ese conjunto cuenta las que has reseñado. Va en una sola consulta, así que
    /// no carga las fuentes ni cuesta un recorrido por tu historial.
    static func local(_ userID: UUID, lat rawLat: Double, long rawLong: Double,
                      on db: any Database) async throws -> LocalGoal? {
        guard let sql = db as? any SQLDatabase else { return nil }
        let lat = ZoneStats.snapLocal(rawLat)
        let long = ZoneStats.snapLocal(rawLong)
        let dLat = ZoneStats.localMaxKm / 111.0
        let dLong = ZoneStats.localMaxKm / (111.0 * max(cos(lat * .pi / 180), 0.01))

        struct Fila: Decodable { let nearby: Int; let visited: Int; let radius_km: Double }
        let fila = try await sql.raw("""
            WITH cercanas AS (
                SELECT f.id,
                       sqrt(power((f.latitude - \(bind: lat)) * 111.0, 2)
                          + power((f.longitude - \(bind: long)) * 111.0
                                  * cos(radians(\(bind: lat))), 2)) AS km
                FROM fonts f
                WHERE f.latitude  BETWEEN \(bind: lat - dLat)  AND \(bind: lat + dLat)
                  AND f.longitude BETWEEN \(bind: long - dLong) AND \(bind: long + dLong)
                  AND \(unsafeRaw: Font.visibleSQL)
                ORDER BY km
                LIMIT \(bind: ZoneStats.localFonts)
            ),
            dentro AS (SELECT * FROM cercanas WHERE km <= \(bind: ZoneStats.localMaxKm))
            SELECT count(*) AS nearby, coalesce(max(km), 0) AS radius_km,
                   (SELECT count(DISTINCT font_id) FROM font_comments
                     WHERE user_id = \(bind: userID)
                       AND font_id IN (SELECT id FROM dentro)) AS visited
            FROM dentro
            """).first(decoding: Fila.self)

        guard let fila, fila.nearby > 0 else { return nil }
        return LocalGoal(nearby: fila.nearby, visited: fila.visited,
                         radiusKm: (fila.radius_km * 10).rounded() / 10)
    }
}
