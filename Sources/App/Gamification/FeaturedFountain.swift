import Fluent
import Foundation
import SQLKit
import Vapor

/// La **fuente de la semana**: una fuente olvidada, cerca de ti, que rota cada semana para
/// que alguien vaya a comprobarla.
///
/// ## Qué problema resuelve
///
/// La app tiene decenas de miles de fuentes y casi ninguna comprobada; lo que le falta no
/// son fuentes sino que alguien pase por las olvidadas. `WorthChip` ya dice «ésta paga más»
/// —pero solo si ya estás mirándola—. Esto es lo contrario: un **empujón** hacia un sitio
/// nuevo, un motivo recurrente de volver que hoy no existe.
///
/// ## Decisiones
///
/// - **Local, no global.** Una fuente destacada en el Pirineo no le sirve a quien vive en
///   Barcelona. Se elige entre las cercanas, como todo lo que de verdad mueve a la gente en
///   esta app.
/// - **Rota por semana, no «la peor».** Entre las olvidadas de tu alrededor se elige por el
///   número de semana ISO, así que cada semana toca una distinta y no se fija siempre en la
///   misma. Es lo que pide la idea: repartir el tráfico, no señalar un único punto.
/// - **Determinista y compartida entre vecinos.** Las coordenadas se redondean igual que en
///   `/activity`, así que dos personas del mismo sitio ven la misma fuente esa semana y la
///   caché sirve de algo.
/// - **No toca el baremo.** Solo destaca; no paga de más. El x2 sería un segundo paso y más
///   delicado (tocaría `ContributionScore`), así que se deja para cuando se vea si engancha.
enum FeaturedFountain {
    /// A partir de cuántos días sin comprobar cuenta como «olvidada». El mismo corte que la
    /// curva del baremo, `Guardianship.staleDays` y la insignia Centinela: un solo número
    /// para «esto lleva demasiado sin que nadie pase».
    static let forgottenDays = 90.0

    /// Hasta dónde se busca. Un radio de barrio ancho: lo bastante para tener candidatas sin
    /// mandar a nadie a la otra punta.
    static let maxKm = 40.0

    /// Cuántas fuentes cercanas se traen antes de filtrar. Acota el coste de la caja.
    static let candidateLimit = 300

    struct Featured: Content, Sendable {
        let fontID: UUID
        let name: String?
        let source: WaterSource?
        /// Cuándo se comprobó por última vez, o `nil` si nunca.
        let lastCheck: Date?
        /// Días desde la última comprobación; `nil` si nunca se comprobó.
        let days: Int?
        /// Nunca la ha comprobado nadie: el caso que más invita («sé el primero»).
        let neverChecked: Bool

        func encode(to encoder: any Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(fontID, forKey: .fontID)
            try c.encode(name, forKey: .name)
            try c.encode(source, forKey: .source)
            // Explícitos, no `encodeIfPresent`: el cliente distingue «nunca» (null) de un
            // número, misma disciplina que el resto de opcionales de esta API.
            try c.encode(lastCheck, forKey: .lastCheck)
            try c.encode(days, forKey: .days)
            try c.encode(neverChecked, forKey: .neverChecked)
        }
    }

    /// Índice de semana ISO estable: cambia una vez por semana, igual en cualquier huso.
    ///
    /// En UTC a propósito: el servidor va en UTC y esta base va de Chile a Italia, así que
    /// atarlo a la hora local partiría la semana por la mitad según quién mire.
    static func weekIndex(_ date: Date) -> Int {
        var cal = Calendar(identifier: .iso8601)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let c = cal.dateComponents([.weekOfYear, .yearForWeekOfYear], from: date)
        return (c.yearForWeekOfYear ?? 0) * 53 + (c.weekOfYear ?? 0)
    }

    /// La fuente de la semana cerca de `lat`/`long`, o `nil` si no hay ninguna olvidada.
    static func of(lat: Double, long: Double, on db: any Database, now: Date = Date()) async throws -> Featured? {
        guard let sql = db as? any SQLDatabase else { return nil }
        let dLat = maxKm / 111.0
        let dLong = maxKm / (111.0 * max(cos(lat * .pi / 180), 0.01))
        let cutoff = now.addingTimeInterval(-forgottenDays * 86_400)

        struct Fila: Decodable {
            let id: UUID; let name: String?; let source: WaterSource?; let last_at: Date?
        }
        // Las cercanas visibles y su última comprobación; nos quedamos con las olvidadas
        // (nunca, o hace más de `forgottenDays`). El orden por `id` es estable y neutro: la
        // rotación semanal la da `weekIndex % count`, no un ranking.
        let candidatas = try await sql.raw("""
            WITH cercanas AS (
                SELECT f.id, f.name, f.source,
                       sqrt(power((f.latitude - \(bind: lat)) * 111.0, 2)
                          + power((f.longitude - \(bind: long)) * 111.0
                                  * cos(radians(\(bind: lat))), 2)) AS km,
                       (SELECT max(c.created_at) FROM font_comments c WHERE c.font_id = f.id) AS last_at
                FROM fonts f
                WHERE f.latitude  BETWEEN \(bind: lat - dLat)  AND \(bind: lat + dLat)
                  AND f.longitude BETWEEN \(bind: long - dLong) AND \(bind: long + dLong)
                  AND \(unsafeRaw: Font.visibleSQL)
                ORDER BY km
                LIMIT \(bind: candidateLimit)
            )
            SELECT id, name, source, last_at
            FROM cercanas
            WHERE km <= \(bind: maxKm)
              AND (last_at IS NULL OR last_at < \(bind: cutoff))
            ORDER BY id
            """).all(decoding: Fila.self)

        guard !candidatas.isEmpty else { return nil }
        let elegida = candidatas[((weekIndex(now) % candidatas.count) + candidatas.count) % candidatas.count]
        let days = elegida.last_at.map { Int(now.timeIntervalSince($0) / 86_400) }
        return Featured(fontID: elegida.id, name: elegida.name, source: elegida.source,
                        lastCheck: elegida.last_at, days: days, neverChecked: elegida.last_at == nil)
    }
}
