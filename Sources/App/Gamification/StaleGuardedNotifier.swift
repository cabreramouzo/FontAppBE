import Fluent
import Foundation
import SQLKit
import Vapor

/// Recuerda a cada quien que las fuentes que cuida se están quedando viejas.
///
/// Es el único aviso de esta app que **nadie envía**: no nace de que otra persona haga
/// algo, sino del paso del tiempo. Y es a propósito el sustituto de una racha — no
/// castiga a nadie por no salir, solo señala que la información que diste está caducando,
/// que es verdad y es accionable.
///
/// ## Las tres reglas que lo hacen soportable
///
/// - **Una vez cada `cooldownDays`.** Sin eso sería un recordatorio cada media hora, que
///   es como se enseña a la gente a no mirar la campana.
/// - **Solo si hay algo que decir**: al menos una fuente pasada de `Guardianship.staleDays`.
/// - **Sin correo.** Va solo a la campana. Un correo mensual no solicitado diciendo «ve a
///   dar una vuelta» es exactamente el tipo de mensaje que hace que te marquen como spam;
///   quien no vuelve a la app tampoco quiere que se lo recuerden por escrito.
///
/// La reincidencia se controla mirando la propia tabla de avisos, sin columna nueva: si ya
/// hay uno de este tipo en la ventana, no se manda otro.
enum StaleGuardedNotifier {
    /// Cada cuánto, como mucho, se recuerda esto a la misma persona.
    static let cooldownDays = 30.0

    @discardableResult
    static func run(on db: any Database, now: Date = Date()) async throws -> Int {
        guard let sql = db as? any SQLDatabase else { return 0 }

        // Candidatos: quien tiene al menos una fuente suya pasada del corte y no ha
        // recibido este aviso hace poco. Se resuelve en una consulta para no recorrer la
        // tabla de usuarios entera cada media hora.
        let corte = now.addingTimeInterval(-Guardianship.staleDays * 86_400)
        let desde = now.addingTimeInterval(-cooldownDays * 86_400)
        struct Fila: Decodable { let user_id: UUID }
        let candidatos = try await sql.raw("""
            SELECT DISTINCT ultima.user_id
            FROM (
              SELECT DISTINCT ON (font_id) font_id, user_id, created_at AS last_at
              FROM font_comments
              ORDER BY font_id, created_at DESC
            ) ultima
            JOIN fonts f ON f.id = ultima.font_id
            WHERE ultima.last_at < \(bind: corte)
              AND \(unsafeRaw: Font.visibleSQL)
              AND NOT EXISTS (
                SELECT 1 FROM notifications n
                WHERE n.user_id = ultima.user_id
                  AND n.kind = 'staleGuarded'
                  AND n.created_at >= \(bind: desde)
              )
            """).all(decoding: Fila.self)

        var enviados = 0
        for c in candidatos {
            let cuidadas = try await Guardianship.of(c.user_id, on: db, now: now)
            let viejas = cuidadas.filter { $0.stale }
            // La más olvidada abre el aviso: es la que hay que ir a ver primero, y darle
            // nombre y cara convierte «tienes tareas» en «la Font del Roure te espera».
            guard let primera = viejas.first else { continue }
            let resto = viejas.count - 1
            let aviso = Notification(
                userID: c.user_id, kind: .staleGuarded, actorID: nil, actorName: "",
                fontID: primera.fontID, fontName: primera.name,
                // El texto se compone en el cliente a partir de estas dos cifras, para que
                // salga en el idioma de quien lo lee y no en el del servidor.
                excerpt: "\(viejas.count)|\(resto)|\(primera.days)")
            try await aviso.save(on: db)
            enviados += 1
        }
        return enviados
    }
}
