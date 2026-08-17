import Fluent
import Foundation
import NIOConcurrencyHelpers
import SQLKit
import Vapor

/// Mantiene el registro de gamificación al día **sin que el resto de la app sepa que
/// existe**.
///
/// ## Qué es, antes de por qué
///
/// Un `scheduleRepeatedTask` de NIO **dentro del mismo proceso que sirve el HTTP** — la
/// misma llamada que `configure.swift` usa para borrar tokens caducados cada 6 h. No es un
/// servicio, ni un proceso, ni nada del alojamiento: del entorno solo necesita que la app
/// siga viva. Y no calcula nada propio; llama a `ContributionLedger.sync()`, exactamente la
/// misma función que el comando `gamification-sync`. **Cron y trabajador no son dos
/// implementaciones sino dos formas de decidir cuándo se lanza una sola**, y conviven sin
/// estorbarse porque el barrido es idempotente. Lo único que no hace nunca es `--rescore`.
///
/// ## Por qué así
///
/// La forma obvia de conseguir puntos «al momento» sería llamar al contador desde el
/// `create` de cada controlador. Eso mete la gamificación en el camino crítico de guardar
/// una fuente: si el contador falla o tarda, el usuario pierde su aportación por culpa de
/// un marcador. Y ensucia seis controladores con una responsabilidad que no es suya.
///
/// En vez de eso, la gamificación **se suscribe** a los cambios con un middleware de
/// modelo de Fluent (`GamificationNudge`). Cuando alguien crea una fuente o una reseña, lo
/// único que ocurre en la petición es marcar un booleano en memoria. El recuento lo hace
/// después este bucle, en segundo plano. Ningún controlador la menciona, y si el contador
/// explota, la aportación ya está guardada.
///
/// Se activa con `GAMIFICATION_WORKER=true`. Sin eso no arranca, y el barrido se hace con
/// `swift run App gamification-sync` desde un cron, que sigue funcionando igual.
final class GamificationWorker: Sendable {
    static let shared = GamificationWorker()

    /// Cada cuánto mira si hay trabajo. No es cada cuánto puntúa: si nadie ha aportado
    /// nada, no hace nada.
    static let tickSeconds: Int64 = 20

    /// Aunque no se mueva nada, hay que pasar de vez en cuando: la liquidación de las
    /// 72 h ocurre por el paso del tiempo, no porque alguien haga algo.
    static let idleSweep: TimeInterval = 30 * 60

    private let sucio = NIOLockedValueBox(false)
    private let enMarcha = NIOLockedValueBox(false)
    private let ultimaPasada = NIOLockedValueBox(Date.distantPast)
    private let arrancado = NIOLockedValueBox(false)

    private init() {}

    /// Marca que hay algo nuevo que puntuar. Lo llama el middleware de modelo, dentro de
    /// la petición: por eso no hace absolutamente nada más que tocar un booleano.
    func nudge() {
        sucio.withLockedValue { $0 = true }
    }

    /// Arranca el bucle. Idempotente: llamarlo dos veces no crea dos bucles.
    func start(on app: Application) {
        let yaEstaba = arrancado.withLockedValue { estaba -> Bool in
            defer { estaba = true }
            return estaba
        }
        guard !yaEstaba else { return }

        app.databases.middleware.use(GamificationNudge<Font>(), on: .psql)
        app.databases.middleware.use(GamificationNudge<FontComment>(), on: .psql)
        app.databases.middleware.use(GamificationNudge<FontReport>(), on: .psql)
        app.databases.middleware.use(GamificationNudge<FontEdit>(), on: .psql)
        app.databases.middleware.use(GamificationNudge<FontConfirmation>(), on: .psql)
        // Las denuncias también: una denuncia dentro de la ventana tiene que impedir el
        // cobro, y cuanto antes se anote, menos margen hay de que se cuele.
        app.databases.middleware.use(GamificationNudge<ContentFlag>(), on: .psql)

        app.eventLoopGroup.next().scheduleRepeatedTask(
            initialDelay: .seconds(30), delay: .seconds(Self.tickSeconds)
        ) { _ in
            Task { await self.tick(app: app) }
        }
        app.logger.info("Gamificación: recuento en segundo plano activo (cada \(Self.tickSeconds) s si hay novedades)")
    }

    private func tick(app: Application) async {
        let hayNovedades = sucio.withLockedValue { $0 }
        let tocaBarrido = Date().timeIntervalSince(ultimaPasada.withLockedValue { $0 }) >= Self.idleSweep
        guard hayNovedades || tocaBarrido else { return }

        // Si la pasada anterior sigue en marcha, no encadenamos otra encima.
        let ocupado = enMarcha.withLockedValue { activo -> Bool in
            defer { activo = true }
            return activo
        }
        guard !ocupado else { return }
        defer { enMarcha.withLockedValue { $0 = false } }

        // Se limpia ANTES de calcular: lo que llegue mientras dura la pasada tiene que
        // volver a marcar, o se perdería hasta el barrido de reserva.
        sucio.withLockedValue { $0 = false }

        do {
            // El recordatorio de fuentes que cuidas y se quedan viejas. Va con el barrido
            // porque nace del **paso del tiempo** y no de que nadie haga nada, así que
            // necesita justo esto: algo que pase solo cada rato. Su propio cerrojo de
            // reincidencia (30 días por persona) hace que pasar cada media hora no moleste.
            try? await StaleGuardedNotifier.run(on: app.db)

            let r = try await Self.runExclusively(on: app.db)
            ultimaPasada.withLockedValue { $0 = Date() }
            if let r, r.inserted > 0 || r.settled > 0 || r.voided > 0 {
                app.logger.info("Gamificación: +\(r.inserted) registradas · \(r.settled) liquidadas · \(r.voided) anuladas")
            }
        } catch {
            // Que falle el recuento no puede tumbar nada: se reintenta al siguiente tick.
            sucio.withLockedValue { $0 = true }
            app.logger.report(error: error)
        }
    }

    /// Ejecuta la sincronización tomando antes un cerrojo de Postgres, para que dos
    /// instancias no hagan a la vez el mismo trabajo.
    ///
    /// El barrido es idempotente, así que solaparse no corrompería nada — pero con varias
    /// máquinas sería recorrer el historial entero dos veces cada pocos minutos, y eso sí
    /// se nota en la base de datos. Devuelve `nil` si otra instancia lo tenía cogido.
    @discardableResult
    static func runExclusively(on db: any Database) async throws -> ContributionLedger.SyncResult? {
        // Clave arbitraria pero fija: identifica "el barrido de gamificación".
        let clave = 8_314_207
        return try await db.withConnection { conn in
            guard let sql = conn as? any SQLDatabase else {
                return try await ContributionLedger.sync(on: conn)
            }
            struct Cerrojo: Decodable { let locked: Bool }
            let cogido = try await sql.raw("SELECT pg_try_advisory_lock(\(bind: clave)) AS locked")
                .first(decoding: Cerrojo.self)?.locked ?? false
            guard cogido else { return nil }
            do {
                let r = try await ContributionLedger.sync(on: conn)
                _ = try? await sql.raw("SELECT pg_advisory_unlock(\(bind: clave))").first()
                return r
            } catch {
                _ = try? await sql.raw("SELECT pg_advisory_unlock(\(bind: clave))").first()
                throw error
            }
        }
    }
}

/// Middleware de modelo que solo avisa. Genérico porque la lista de modelos puntuables
/// crecerá, y así añadir uno es una línea en `GamificationWorker.start`.
///
/// No mira *qué* cambió: decidir si un cambio puntúa es trabajo de `ContributionScore`, y
/// duplicar aquí ese criterio sería garantizar que los dos se desincronizan.
struct GamificationNudge<M: Model>: AsyncModelMiddleware {
    typealias Model = M

    func create(model: M, on db: any Database, next: any AnyAsyncModelResponder) async throws {
        try await next.create(model, on: db)
        GamificationWorker.shared.nudge()
    }

    func update(model: M, on db: any Database, next: any AnyAsyncModelResponder) async throws {
        try await next.update(model, on: db)
        GamificationWorker.shared.nudge()
    }

    func delete(model: M, force: Bool, on db: any Database, next: any AnyAsyncModelResponder) async throws {
        try await next.delete(model, force: force, on: db)
        GamificationWorker.shared.nudge()
    }
}
