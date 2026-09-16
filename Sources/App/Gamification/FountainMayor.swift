import Fluent
import Foundation
import SQLKit
import Vapor

/// El **guardián** de una fuente: quien más la ha comprobado en los últimos 60 días.
///
/// Es la mecánica del *mayor* de Foursquare/Swarm, adaptada a lo que esta app sí tiene.
/// El documento de ideación (`docs/gamificacion-visitas.md`) la apoya en un sistema de
/// check-in por GPS que no existe todavía, así que aquí el «visitar» es lo único que hoy
/// deja rastro verificable de que alguien estuvo delante: **una reseña con estado**. Esa
/// es la misma razón por la que las gotas se pagan por reseñar y no por pulsar un botón —
/// el GPS del navegador se falsea, una reseña útil no tanto.
///
/// ## Por qué NO es lo mismo que `Guardianship`
///
/// `Guardianship` («fuentes que dependen de ti») es un **relevo**: eres su cuidador
/// mientras la última reseña sea tuya, y pierdes el puesto en cuanto otro reseña después.
/// No compite: no castiga a nadie. Esto es lo contrario —una **competición** por quién la
/// comprueba más—, y por eso vive aparte y con otro nombre. Se añade porque se pidió ver
/// cómo queda; convive con el relevo sin sustituirlo.
///
/// ## Ventana móvil, no histórico
///
/// 60 días, como en Foursquare y como pide el documento: el título tiene que ser
/// **reconquistable**. Con el histórico total lo ganaría para siempre quien llegó primero
/// —el mismo defecto que el ranking mensual de zonas evita a propósito—.
///
/// ## Se calcula en vivo, no se guarda
///
/// Igual que `Guardianship` y `ZoneStats`: nada de columna `guardian_id` en `fonts`. Un
/// guardián guardado se queda viejo solo con que pase el tiempo (sus reseñas salen de la
/// ventana sin que nadie escriba nada), y entonces la ficha enseñaría a alguien que ya no
/// lo es —una segunda verdad que contradice al cálculo—. Las reseñas de una fuente son
/// pocas, así que la consulta es barata y siempre dice la verdad.
enum FountainMayor {
    /// Ventana móvil sobre la que se cuenta.
    static let windowDays = 60.0

    /// Cuántas comprobaciones hacen falta para que haya guardián.
    ///
    /// Dos, no una: con una sola reseña no hay competición —eso ya lo cubre el relevo de
    /// `Guardianship`—, y coronar a alguien por pasar una vez vacía la palabra «guardián».
    /// Es la misma disciplina que `WorthChip` o la leyenda del municipio: no se enseña un
    /// título donde no dice nada. Con datos escasos casi ninguna ficha tendrá guardián
    /// todavía, y eso es honesto, no un fallo.
    static let minReviews = 2

    /// Quién manda ahora mismo en una fuente.
    struct Mayor: Content, Sendable {
        let userID: UUID
        let username: String
        /// Comprobaciones en la ventana. Es lo que hace el título reconquistable: se ve
        /// cuánto falta para superarlo.
        let reviews: Int
    }

    /// El guardián de `fontID`, o `nil` si nadie llega al mínimo.
    ///
    /// `excludingComment` sirve para preguntar «¿quién era el guardián **antes** de esta
    /// reseña?»: se recalcula el mismo cómputo sin contar el comentario recién creado. Es
    /// lo que permite detectar un destronamiento sin guardar estado.
    static func of(fontID: UUID, on db: any Database, now: Date = Date(),
                   excludingComment: UUID? = nil) async throws -> Mayor? {
        guard let sql = db as? any SQLDatabase else { return nil }
        let since = now.addingTimeInterval(-windowDays * 86_400)
        struct Fila: Decodable { let user_id: UUID; let username: String; let n: Int }

        // El opt-out y las cuentas anonimizadas quedan fuera, igual que en el ranking
        // mensual y el pulso: donde saldría un nombre por gamificación, el interruptor del
        // perfil tiene que valer. Las reseñas siguen siendo públicas con su autor; lo que
        // no se concede es el **título**, que sí es una distinción del sistema de puntos.
        // El `user_id` de `font_comments` es opcional: el JOIN descarta las reseñas
        // huérfanas (autor anonimizado por borrado físico) sin más.
        let excl = excludingComment.map { "AND c.id <> '\($0.uuidString)'" } ?? ""
        let filas = try await sql.raw("""
            SELECT c.user_id, u.username, count(*) AS n
            FROM font_comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.font_id = \(bind: fontID)
              AND c.created_at >= \(bind: since)
              AND u.gamification_opt_out = false
              AND u.anonymized_at IS NULL
              \(unsafeRaw: excl)
            GROUP BY c.user_id, u.username
            ORDER BY n DESC, min(c.created_at) ASC
            LIMIT 1
            """).all(decoding: Fila.self)

        guard let f = filas.first, f.n >= minReviews else { return nil }
        return Mayor(userID: f.user_id, username: f.username, reviews: f.n)
    }

    /// De cuántas fuentes **visibles** es guardián esta persona ahora mismo.
    ///
    /// Cierra el bucle del título: un motivo para defenderlo. Es una sola consulta con una
    /// ventana (`row_number`) que corona a la de cabeza por fuente y cuenta las que salen a
    /// nombre de este usuario, así que no cuesta un `of` por fuente.
    ///
    /// Filtra por `Font.visibleSQL`, a diferencia de `of` (que sirve una ficha suelta
    /// alcanzable por enlace viejo aunque esté escondida): en un recuento, contar fuentes
    /// que ya no están en el mapa lo inflaría. Mismo criterio que la lista de `Guardianship`.
    static func countFor(_ userID: UUID, on db: any Database, now: Date = Date()) async throws -> Int {
        guard let sql = db as? any SQLDatabase else { return 0 }
        let since = now.addingTimeInterval(-windowDays * 86_400)
        struct Fila: Decodable { let n: Int }
        let filas = try await sql.raw("""
            WITH counts AS (
              SELECT c.font_id, c.user_id, count(*) AS reviews, min(c.created_at) AS first_at
              FROM font_comments c
              JOIN users u ON u.id = c.user_id
              JOIN fonts f ON f.id = c.font_id
              WHERE c.created_at >= \(bind: since)
                AND u.gamification_opt_out = false
                AND u.anonymized_at IS NULL
                AND \(unsafeRaw: Font.visibleSQL)
              GROUP BY c.font_id, c.user_id
            ),
            ranked AS (
              SELECT font_id, user_id, reviews,
                     row_number() OVER (PARTITION BY font_id ORDER BY reviews DESC, first_at ASC) AS rk
              FROM counts
            )
            SELECT count(*) AS n
            FROM ranked
            WHERE rk = 1 AND reviews >= \(bind: minReviews) AND user_id = \(bind: userID)
            """).all(decoding: Fila.self)
        return filas.first?.n ?? 0
    }

    /// Avisa al guardián anterior de que le han quitado el puesto, si es que ha pasado.
    ///
    /// **Solo campana, sin push.** El criterio de siempre para la notificación del sistema
    /// es «¿cambia lo que voy a hacer?», y perder un título no te hace desviarte a ninguna
    /// parte: es un gancho social, no una avería. Mismo trato que `commentLike`.
    ///
    /// No lanza nunca: como el resto de avisos, se llama con `Task.detached` y un fallo
    /// aquí no puede tumbar la reseña que lo provocó.
    static func notifyIfDethroned(fontID: UUID, newComment: UUID, reviewerID: UUID,
                                  on db: any Database, now: Date = Date()) async {
        do {
            let after = try await of(fontID: fontID, on: db, now: now)
            // El nuevo guardián solo puede ser quien acaba de reseñar: una reseña suya solo
            // sube su propio recuento. Si no ha pasado a ser suyo, no hay destronamiento.
            guard let after, after.userID == reviewerID else { return }
            let before = try await of(fontID: fontID, on: db, now: now, excludingComment: newComment)
            // Tenía que haber un guardián distinto antes, y no puede ser el propio autor
            // (nadie se destrona a sí mismo actualizando su ventaja).
            guard let before, before.userID != after.userID else { return }

            guard let reviewer = try await User.find(reviewerID, on: db) else { return }
            let font = try await Font.find(fontID, on: db)
            let aviso = Notification(
                userID: before.userID, kind: .mayorTaken,
                actorID: reviewerID, actorName: reviewer.username,
                fontID: fontID, fontName: font?.name,
                // Sin cifras: el cliente compone el texto con el nombre del actor y el de
                // la fuente. Un aviso, no un marcador.
                excerpt: "")
            try await aviso.save(on: db)
        } catch {
            // Silencioso a propósito: quien llama ya ha guardado su reseña.
        }
    }
}
