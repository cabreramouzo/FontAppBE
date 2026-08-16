import Fluent
import Foundation
import SQLKit
import Vapor

/// El pulso: quién acaba de subir de nivel y quién lo tiene a tiro.
///
/// Nace de un problema concreto y medido en la propia app: **casi nadie entra a su
/// perfil**. Toda la gamificación —diez niveles, ocho familias de insignias, una vitrina
/// entera— vive detrás de una pestaña que la gente no visita, así que para la mayoría es
/// como si no existiera. Esto la saca a donde ya está la gente, que es `/activity`.
///
/// Dos listas y las dos hacen falta:
///
/// - **Recién subidos** — el reconocimiento. Es lo que convierte un número privado en
///   algo que alguien más ha visto.
/// - **A punto** — el empujón. Un «le faltan 40 gotas» mueve mucho más que un ascenso ya
///   consumado, porque todavía se puede hacer algo al respecto.
///
/// ## Lo que deliberadamente NO es
///
/// No es un ranking. `ZoneStats.ranking` ya existe, es mensual y está pensado con
/// cuidado para que entrar hoy sea entrar a tiempo. Aquí no hay puestos ni un primero:
/// son dos corrillos de gente a la que le acaba de pasar algo. Añadir un «top» global
/// aquí desharía justo la decisión que protege el ranking mensual.
///
/// Tampoco lleva insignias todavía, y no por olvido: el nivel sale de una suma
/// (`SUM(gotes)`) y se calcula para todo el mundo en una consulta, mientras que las
/// insignias salen de recuentos por familia —fuentes creadas, primeras fotos, estaciones
/// distintas por fuente— que hoy solo se saben usuario a usuario. Sacarlas aquí es
/// recorrer el censo entero cada cinco minutos. Cuando el recuento viva en una tabla
/// propia, entran; hasta entonces, mejor una lista corta que funcione.
enum Pulse {
    /// Mismo TTL que las lecturas de zona: es una agregación sobre la tabla grande y lo
    /// que cuenta se mueve con las horas.
    static let cacheTTL: TimeInterval = 5 * 60

    /// Ventana de «recién». Siete días: con el ritmo de aportaciones de la app, un corte
    /// de 24 h deja la lista vacía casi siempre, y una lista vacía la mayoría de los días
    /// enseña a la gente a no mirarla.
    static let recentDays = 7.0

    /// A partir de qué punto del camino al siguiente nivel se considera «a punto».
    ///
    /// 75 % y no 90 %: lo que hace falta es que quede un tirón **creíble pero real**. Al
    /// 90 % el que sale ya iba a subir de todas formas esa misma semana y el aviso no
    /// cambia nada; por debajo del 70 % la lista se llena de gente a la que le faltan
    /// meses, y entonces no significa nada estar en ella.
    static let nearlyThere = 0.75

    /// Cuántos se devuelven de cada lista.
    ///
    /// Veinte y no cuatro: el techo tiene que estar por encima de lo que se enseña, o
    /// «ver más» no tendría nada que desplegar. Quien corta a cinco es la interfaz
    /// (`PulseStrip`), que es donde está el problema de sitio; aquí solo hace falta un
    /// tope que impida que una zona con mucho movimiento devuelva una lista sin fin.
    ///
    /// Veinte es también el límite del ranking mensual (`ZoneStats.rankingLimit`), y por
    /// la misma razón: más abajo no mira nadie.
    /// Cuántas se enseñan de entrada las decide la interfaz, no esto: el problema de
    /// sitio es suyo, y el «y N más» lo saca de las filas que ya tiene en la mano.
    static let limit = 20

    struct Promotion: Content, Sendable {
        let username: String
        /// Clave, no nombre: lo traduce el navegador, igual que en el resto del sistema.
        let level: String
        let gotes: Int
    }

    struct Climber: Content, Sendable {
        let username: String
        /// El nivel que persigue, no el que tiene: es lo que da sentido a `remaining`.
        let nextLevel: String
        let gotes: Int
        /// Gotas que le faltan. Viaja calculado desde aquí y no se deja al cliente por lo
        /// mismo que los porcentajes de `ZoneStats.Coverage`: dos restas en dos sitios
        /// acaban discrepando.
        let remaining: Int
        let pct: Int
    }

    struct Snapshot: Content, Sendable {
        let promotions: [Promotion]
        let climbers: [Climber]

        /// Para que el cliente no tenga que mirar dos arrays antes de decidir si pinta
        /// la sección entera.
        var isEmpty: Bool { promotions.isEmpty && climbers.isEmpty }
    }

    /// Una fila por usuario: lo que lleva ahora y lo que llevaba antes del corte.
    ///
    /// El corte va sobre `occurred_at` y **no** sobre `settled_at`, que es lo que parecía
    /// natural. `settled_at` se rellena cuando pasa la sincronización, así que el día que
    /// se importe el histórico todas las aportaciones de años quedarían liquidadas a la
    /// vez y la app anunciaría que el censo entero acaba de subir de nivel. Con
    /// `occurred_at` la pregunta que se contesta es la correcta: qué nivel tendrías con
    /// lo que habías hecho hace una semana, comparado con el de ahora.
    struct Row: Decodable, Sendable {
        let username: String
        let total: Int64
        let before: Int64
    }

    /// La clasificación, separada de la consulta para poder probarla con filas a mano:
    /// los casos que importan (el tramo largo del final de la escalera, el que sube y no
    /// debe salir además como aspirante) no necesitan una base de datos para fallar.
    static func classify(_ filas: [Row]) -> Snapshot {
        var promotions: [Promotion] = []
        var climbers: [Climber] = []

        for fila in filas {
            let total = Int(fila.total)
            let antes = Int(fila.before)
            let ahora = ContributionScore.level(for: total)

            // Subió si el peldaño de hoy no es el que tenía con lo de hace una semana.
            // Comparar por `from` y no por clave: es el orden, y basta con que suba.
            if ContributionScore.level(for: antes).from < ahora.from {
                promotions.append(Promotion(username: fila.username, level: ahora.key, gotes: total))
                // Quien acaba de subir no sale además en «a punto» del siguiente: son la
                // misma persona dos veces en la misma tira, y la noticia es el ascenso.
                continue
            }

            guard let siguiente = ContributionScore.nextLevel(after: total) else { continue }
            // Progreso **dentro del tramo**, no sobre el umbral absoluto. Con `total /
            // siguiente.from`, cualquiera en la mitad alta de la escalera sale al 90 %
            // para siempre: entre Lago (25.000) y Acuífero (60.000) hay un salto enorme,
            // y quien acaba de llegar a Lago no está a punto de nada.
            let tramo = siguiente.from - ahora.from
            guard tramo > 0 else { continue }
            let avance = Double(total - ahora.from) / Double(tramo)
            guard avance >= nearlyThere else { continue }
            climbers.append(Climber(username: fila.username, nextLevel: siguiente.key, gotes: total,
                                    remaining: siguiente.from - total,
                                    pct: Int((avance * 100).rounded())))
        }

        // Los ascensos, por altura: subir a Río es más noticia que subir a Manantial.
        // El desempate va por nombre **ascendente** aunque las gotas vayan descendentes:
        // lo único que se le pide es ser estable, o dos lecturas seguidas con los mismos
        // datos devolverían la lista en otro orden.
        promotions.sort { $0.gotes != $1.gotes ? $0.gotes > $1.gotes : $0.username < $1.username }
        // Los aspirantes, por lo poco que les falta: el primero es el que está más cerca.
        climbers.sort { $0.remaining != $1.remaining ? $0.remaining < $1.remaining : $0.username < $1.username }

        return Snapshot(promotions: Array(promotions.prefix(limit)),
                        climbers: Array(climbers.prefix(limit)))
    }

    static func snapshot(on db: any Database, now: Date = Date()) async throws -> Snapshot {
        guard let sql = db as? SQLDatabase else { return Snapshot(promotions: [], climbers: []) }
        let corte = now.addingTimeInterval(-recentDays * 86_400)

        let filas = try await sql.raw("""
            SELECT u.username AS username,
                   SUM(e.gotes)::bigint AS total,
                   COALESCE(SUM(e.gotes) FILTER (WHERE e.occurred_at < \(bind: corte)), 0)::bigint AS before
            FROM contribution_events e
            JOIN users u ON u.id = e.user_id
            WHERE e.status = 'settled'
              AND u.gamification_opt_out = false
              AND u.anonymized_at IS NULL
            GROUP BY u.username
            HAVING SUM(e.gotes) > 0
            """).all(decoding: Row.self)

        return classify(filas)
    }
}
