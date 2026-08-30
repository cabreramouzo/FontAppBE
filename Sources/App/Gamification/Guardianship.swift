import Fluent
import Foundation
import SQLKit
import Vapor

/// Las fuentes que alguien **cuida**: aquellas cuya última reseña es suya.
///
/// ## Por qué merece una pantalla propia
///
/// El dato ya se calculaba, pero solo para pagar la insignia «Guardián local», escondido
/// dentro de un contador de la vitrina. Como relación explícita es otra cosa: deja de ser
/// «llevas 7 puntos de algo» y pasa a ser «hay siete fuentes cuya última noticia la diste
/// tú, y tres llevan más de tres meses sin que nadie pase».
///
/// Es lo que le faltaba a la app para dar un motivo **recurrente** de volver sin caer en
/// una racha. Una racha castiga a quien le llueve dos fines de semana; esto no castiga
/// nada, solo recuerda que hay algo tuyo que se está quedando viejo. Y es verdad: si
/// nadie vuelve, la información que diste caduca y la fuente vuelve a ser un punto mudo.
///
/// ## Qué cuenta como «cuidar»
///
/// Que la reseña más reciente de esa fuente sea tuya. No hace falta que sea reciente —ahí
/// está la gracia: las que cuidas y llevan tiempo sin comprobar son exactamente las que
/// hay que enseñar primero—. Cuando otra persona reseña después, la fuente pasa a ser
/// suya: no es una propiedad, es un relevo.
enum Guardianship {
    /// A partir de cuántos días se considera que una fuente tuya se ha quedado vieja.
    ///
    /// 90 días, el mismo corte que usa la curva del baremo para el tramo de «olvidada» y
    /// el mismo de la insignia «Centinela». Tres cortes distintos para la misma idea
    /// serían tres explicaciones distintas de por qué algo está en rojo.
    static let staleDays = 90.0

    struct Guarded: Content, Sendable {
        let fontID: UUID
        let name: String?
        /// Cuándo la comprobaste por última vez.
        let lastCheck: Date
        /// Días transcurridos, para no obligar al cliente a recalcularlo.
        let days: Int
        /// Si ya pasó de `staleDays`.
        let stale: Bool
        /// Qué clase de punto es. Sale de la misma fila de `fonts` que ya se une para el
        /// nombre, así que no cuesta nada, y es lo que permite que la lista tenga un
        /// icono que **dice algo** en vez de repetir el mismo adorno en cada fila.
        let source: WaterSource?
        /// Lo que **tú** dijiste la última vez. Es el dato que caduca —de eso va esta
        /// lista entera— y ya viene en la fila del `DISTINCT ON`: la reseña más reciente
        /// de esa fuente es justamente la tuya.
        let waterStatus: String?
    }

    /// Las fuentes que cuida esta persona, **las más olvidadas primero**.
    ///
    /// Una sola consulta con `DISTINCT ON`, que es la forma de Postgres de decir «la fila
    /// más reciente por grupo» sin traerse el historial entero de reseñas a memoria. Con
    /// 60.000 fuentes eso importa.
    static func of(_ userID: UUID, on db: any Database, now: Date = Date()) async throws -> [Guarded] {
        guard let sql = db as? any SQLDatabase else { return [] }
        struct Fila: Decodable {
            let font_id: UUID; let name: String?; let last_at: Date
            let source: WaterSource?; let water_status: String?
        }
        let filas = try await sql.raw("""
            SELECT ultima.font_id, f.name, f.source, ultima.water_status, ultima.last_at
            FROM (
              SELECT DISTINCT ON (font_id) font_id, user_id, water_status, created_at AS last_at
              FROM font_comments
              ORDER BY font_id, created_at DESC
            ) ultima
            JOIN fonts f ON f.id = ultima.font_id
            WHERE ultima.user_id = \(bind: userID)
              -- Las escondidas no se cuidan: una duplicada o una retirada ya no manda a
              -- nadie a ninguna parte, así que recordarte que la revises sería trabajo
              -- inventado.
              AND \(unsafeRaw: Font.visibleSQL)
            ORDER BY ultima.last_at ASC
            """).all(decoding: Fila.self)

        return filas.map {
            let dias = Int(now.timeIntervalSince($0.last_at) / 86_400)
            return Guarded(fontID: $0.font_id, name: $0.name, lastCheck: $0.last_at,
                           days: dias, stale: Double(dias) >= staleDays,
                           source: $0.source, waterStatus: $0.water_status)
        }
    }
}
