import Fluent
import Foundation
import Vapor

/// Fase 2: materializa el cálculo de `ContributionScore` en `contribution_events` y
/// gestiona la liquidación a las 72 horas.
///
/// **Por qué materializar y no seguir calculando al vuelo.** Recalcular a cada consulta
/// funcionaba en la fase 1 —el resultado no lo veía nadie— pero como sistema en marcha
/// tiene dos defectos que se pagan caros: el marcador de todo el mundo cambiaría el día
/// que se toque una constante del baremo, y no habría dónde anotar «esto está pendiente» o
/// «esto se anuló porque lo denunciaron». Guardar la fila resuelve las dos cosas.
///
/// **Por qué se sincroniza y no se escribe desde los controladores.** Sería más inmediato
/// escribir el evento dentro de `create` de cada controlador, pero eso mete la
/// gamificación en el camino crítico de escribir una fuente: si el registro falla o tarda,
/// el usuario pierde su aportación por culpa de un contador. Un barrido periódico es
/// idempotente, no puede romper nada aguas arriba y se puede volver a pasar entero cuando
/// se cambia el baremo. El precio es que una aportación tarda hasta un ciclo en aparecer,
/// y con una ventana de liquidación de 72 h ese retraso no lo nota nadie.
enum ContributionLedger {

    /// 72 horas: lo que tarda una aportación en cobrar. La ventana existe para que una
    /// reversión, una denuncia o un borrado lleguen a tiempo de impedir el pago.
    static let settlementWindow: TimeInterval = 72 * 3_600

    /// **Fecha desde la que los puntos son definitivos** (`GAMIFICATION_EPOCH`, en formato
    /// `AAAA-MM-DD`).
    ///
    /// Mientras se calibra el baremo hace falta poder recalcularlo todo: cambiar cuánto
    /// vale una primera foto y volver a pasar el histórico. Eso es aceptable con cuatro
    /// usuarios y es inaceptable en cuanto alguien se ha fijado en su marcador — ver que
    /// tus puntos bajan de un día para otro sin haber hecho nada es la forma más rápida de
    /// que a nadie le importen.
    ///
    /// La línea separa las dos etapas. Antes de ella, todo es provisional y `--rescore` lo
    /// reconstruye. A partir de ella, las aportaciones son intocables: `--rescore` se
    /// niega a borrarlas.
    ///
    /// Ojo con lo que **no** congela: si una reseña se borra o se denuncia, su aportación
    /// se anula igual, esté al lado que esté de la línea. La fecha protege del baremo, no
    /// de que el contenido desaparezca.
    ///
    /// Sin definir, todo es provisional. Es el estado correcto hasta que se decida.
    static var epoch: Date? {
        guard let raw = Environment.get("GAMIFICATION_EPOCH")?.trimmingCharacters(in: .whitespaces),
              !raw.isEmpty else { return nil }
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.date(from: raw)
    }

    /// Techo de gotas por persona y **día de la aportación**. Lo que pasa del techo en un
    /// mismo día no llega a cobrar nunca: se anula.
    ///
    /// Se cuenta por el día en que se aportó y no por el día en que se cobra, aunque lo
    /// segundo sea más indulgente, por dos razones. Volcar el historial de golpe con un
    /// techo por día de cobro estrangula la importación (medido: 109 de 274 aportaciones
    /// se quedaban esperando turno); y un techo que se puede agotar y esperar a mañana no
    /// disuade de nada, porque el guion también sabe esperar.
    ///
    /// 4 000 sale de mirar los datos, no de un número redondo: la mejor jornada real
    /// medida son 1 256 gotas en 8 aportaciones. Esto deja tres veces ese margen —una ruta
    /// de veinte fuentes con foto cabe holgada— y sigue muy por debajo de lo que sacaría
    /// un guion, que haría cientos.
    static let dailyCap = 4_000

    struct SyncResult: Sendable {
        var inserted = 0
        var settled = 0
        var voided = 0
        var overCap = 0         // anuladas por pasarse del techo de su día
        var alreadyKnown = 0
        var voidReasons: [String: Int] = [:]
    }

    // MARK: - Sincronización

    /// Pasa el cálculo sobre el historial y pone el registro al día. Idempotente: llamarla
    /// dos veces seguidas no cambia nada la segunda vez.
    ///
    /// - Parameter dryRun: calcula y devuelve el resultado sin tocar la base de datos.
    @discardableResult
    static func sync(on db: any Database, now: Date = Date(), dryRun: Bool = false) async throws -> SyncResult {
        var result = SyncResult()

        let informe = try await ContributionScore.compute(on: db)
        let existentes = try await ContributionEvent.query(on: db).all()

        // La clave de identidad, la misma que el índice único de la tabla.
        func clave(_ source: String, _ subject: UUID, _ kind: String, _ detail: String) -> String {
            "\(source)|\(subject)|\(kind)|\(detail)"
        }
        var porClave: [String: ContributionEvent] = [:]
        for e in existentes { porClave[clave(e.source, e.subjectID, e.kind, e.detail)] = e }

        var vistas = Set<String>()
        var nuevas: [ContributionEvent] = []

        for c in informe.contributions {
            let k = clave(c.source.rawValue, c.subjectID, c.kind.rawValue, c.detail)
            vistas.insert(k)
            if porClave[k] != nil { result.alreadyKnown += 1; continue }
            result.inserted += 1
            nuevas.append(ContributionEvent(
                userID: c.userID, fontID: c.fontID,
                source: c.source.rawValue, subjectID: c.subjectID, detail: c.detail,
                kind: c.kind.rawValue, base: c.base, multiplier: c.multiplier, gotes: c.gotes,
                occurredAt: c.at, settlesAt: c.at.addingTimeInterval(settlementWindow),
                status: .pending))
        }

        // Lo que estaba registrado y ya no sale del cálculo ha desaparecido: reseña
        // borrada, edición revertida, fuente eliminada. Se anula, no se borra — que quede
        // el rastro es justamente el punto de tener un registro.
        let desaparecidas = existentes.filter {
            $0.status != .void && !vistas.contains(clave($0.source, $0.subjectID, $0.kind, $0.detail))
        }

        // Denuncias: una aportación con contenido denunciado no cobra. Solo afecta a lo
        // que aún está pendiente; lo ya liquidado se revisa a mano desde moderación.
        let denunciadas = try await flagged(on: db, among: existentes.filter { $0.status == .pending })

        guard !dryRun else {
            result.voided = desaparecidas.count + denunciadas.count
            result.voidReasons["desaparecida"] = desaparecidas.count
            result.voidReasons["denunciada"] = denunciadas.count
            let (liquidables, pasadas) = try await settleable(on: db, now: now, extraPending: nuevas)
            result.settled = liquidables.count
            result.overCap = pasadas.count
            result.voided += pasadas.count
            result.voidReasons["techo diario"] = pasadas.count
            return result
        }

        for e in nuevas { try await e.save(on: db) }

        for e in desaparecidas {
            e.status = .void
            e.voidReason = "la aportación ya no existe (borrada o revertida)"
            try await e.save(on: db)
            result.voided += 1
            result.voidReasons["desaparecida", default: 0] += 1
        }
        for e in denunciadas {
            e.status = .void
            e.voidReason = "contenido denunciado durante la ventana de liquidación"
            try await e.save(on: db)
            result.voided += 1
            result.voidReasons["denunciada", default: 0] += 1
        }

        let (liquidables, pasadas) = try await settleable(on: db, now: now, extraPending: [])
        for e in liquidables {
            e.status = .settled
            e.settledAt = now
            try await e.save(on: db)
            result.settled += 1
        }
        for e in pasadas {
            e.status = .void
            e.voidReason = "por encima del techo de \(dailyCap) gotas de ese día"
            try await e.save(on: db)
            result.voided += 1
            result.overCap += 1
            result.voidReasons["techo diario", default: 0] += 1
        }

        return result
    }

    // MARK: - Recalcular el histórico

    struct RescoreResult: Sendable {
        var deleted = 0
        var protected = 0
        var rebuilt = 0
    }

    /// Tira las aportaciones **provisionales** y las vuelve a calcular con el baremo de
    /// hoy. Es la única forma de reescalar el histórico, y es deliberadamente explícita:
    /// no ocurre nunca sola.
    ///
    /// Lo ocurrido a partir de `epoch` no se toca. Si no hay `epoch`, todo es provisional
    /// y se reconstruye entero.
    static func rescore(on db: any Database, now: Date = Date()) async throws -> RescoreResult {
        var r = RescoreResult()
        let linea = epoch

        let todos = try await ContributionEvent.query(on: db).all()
        let protegidos = linea.map { l in todos.filter { $0.occurredAt >= l } } ?? []
        r.protected = protegidos.count

        let borrables = linea.map { l in todos.filter { $0.occurredAt < l } } ?? todos
        for e in borrables { try await e.delete(on: db) }
        r.deleted = borrables.count

        let sync = try await self.sync(on: db, now: now)
        r.rebuilt = sync.inserted
        return r
    }

    // MARK: - Liquidación

    /// Aportaciones pendientes que ya han cumplido las 72 horas, separadas en las que
    /// caben en el techo de su día y las que se pasan (que se anularán).
    private static func settleable(on db: any Database, now: Date,
                                   extraPending: [ContributionEvent]) async throws
                                   -> (liquidables: [ContributionEvent], pasadas: [ContributionEvent]) {
        let maduras = try await ContributionEvent.query(on: db)
            .filter(\.$status == .pending)
            .filter(\.$settlesAt <= now)
            .sort(\.$occurredAt, .ascending)
            .all()
        // En dry-run las recién calculadas todavía no están en la tabla.
        let candidatas = (maduras + extraPending.filter { $0.settlesAt <= now })
            .sorted { $0.occurredAt < $1.occurredAt }
        guard !candidatas.isEmpty else { return ([], []) }

        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        func cubo(_ userID: UUID, _ cuando: Date) -> String {
            let d = cal.dateComponents([.year, .month, .day], from: cuando)
            return "\(userID)|\(d.year ?? 0)-\(d.month ?? 0)-\(d.day ?? 0)"
        }

        // Lo ya cobrado de cada día cuenta contra el techo de ese día, para que liquidar
        // en varias tandas dé el mismo resultado que liquidar todo de una vez.
        let usuarios = Array(Set(candidatas.map { $0.$user.id }))
        let yaLiquidadas = try await ContributionEvent.query(on: db)
            .filter(\.$status == .settled)
            .filter(\.$user.$id ~~ usuarios)
            .all()
        var gastado: [String: Int] = [:]
        for e in yaLiquidadas { gastado[cubo(e.$user.id, e.occurredAt), default: 0] += e.gotes }

        var liquidables: [ContributionEvent] = []
        var pasadas: [ContributionEvent] = []
        for e in candidatas {
            let c = cubo(e.$user.id, e.occurredAt)
            if (gastado[c] ?? 0) + e.gotes > dailyCap { pasadas.append(e); continue }
            gastado[c, default: 0] += e.gotes
            liquidables.append(e)
        }
        return (liquidables, pasadas)
    }

    /// Eventos cuyo contenido (la reseña, o la fuente) tiene alguna denuncia abierta.
    private static func flagged(on db: any Database,
                                among pendientes: [ContributionEvent]) async throws -> [ContributionEvent] {
        guard !pendientes.isEmpty else { return [] }
        let flags = try await ContentFlag.query(on: db).all()
        guard !flags.isEmpty else { return [] }
        let comentarios = Set(flags.filter { $0.targetType == "comment" }.map { $0.targetID })
        let fuentes = Set(flags.filter { $0.targetType == "font" }.map { $0.targetID })
        return pendientes.filter { e in
            (e.source == ContributionScore.Source.comment.rawValue && comentarios.contains(e.subjectID))
                || (e.$font.id.map { fuentes.contains($0) } ?? false)
        }
    }

    // MARK: - Consulta

    struct Totals: Sendable {
        let userID: UUID
        let settled: Int
        let pending: Int
        var level: ContributionScore.Level { ContributionScore.level(for: settled) }
    }

    /// Marcador de una persona: solo cuenta lo liquidado. Lo pendiente se enseña aparte,
    /// porque «tienes 120 gotas en camino» explica la espera y «120 gotas que luego
    /// desaparecen» destruye la confianza.
    static func totals(for userID: UUID, on db: any Database) async throws -> Totals {
        let eventos = try await ContributionEvent.query(on: db)
            .filter(\.$user.$id == userID)
            .filter(\.$status != .void)
            .all()
        return Totals(
            userID: userID,
            settled: eventos.filter { $0.status == .settled }.reduce(0) { $0 + $1.gotes },
            pending: eventos.filter { $0.status == .pending }.reduce(0) { $0 + $1.gotes })
    }

    /// Lo que ve una persona en su perfil. Fase 3.
    struct Profile: Content {
        /// `family` y `tier` son **claves** (`firstLight`, `bronze`), no rótulos: los
        /// traduce el navegador, igual que el nivel.
        struct Badge: Content { let family: String, tier: String; let progress: Int, threshold: Int }
        struct KindTotal: Content { let kind: String, label: String; let count: Int, gotes: Int }
        /// Las tres cifras de impacto. Son deliberadamente **sobre el mapa y no sobre la
        /// persona**: «12 fuentes tienen foto gracias a ti» dice algo verdadero del mundo,
        /// «llevas 1 240 puntos» solo dice algo del contador.
        struct Impact: Content {
            let fontsWithPhotoThanksToYou: Int
            let fontsYouKeepFresh: Int
            let fontsYouPutOnTheMap: Int
        }
        let gotes: Int
        let pending: Int
        /// Clave del nivel (`drop`, `spring`, `brook`…), no su nombre: el rótulo lo
        /// traduce el navegador. Mandar «Arroyo» a quien tiene la app en euskera era el
        /// fallo de la fase 3.
        let level: String
        let nextLevel: String?
        let gotesToNextLevel: Int?
        let badges: [Badge]
        let byKind: [KindTotal]
        let impact: Impact
        /// Si los puntos todavía se pueden recalcular. Se dice en la interfaz: prometer
        /// que no cambian y que cambien es peor que avisar.
        let provisional: Bool
        /// Fase 6: qué abre el nivel. Lo rellena el controlador, no el cálculo — depende
        /// del rol y de la configuración del despliegue, no del historial de puntos.
        var grant: Capabilities.Grant?
        /// La vitrina: los diez peldaños con su umbral y si están alcanzados. Va en la
        /// respuesta y no escrito en el cliente para que la escalera exista **una sola
        /// vez**; si mañana se recalibra, la vitrina la sigue sin tocar nada.
        let levels: [LevelStanding]
        /// Todas las familias de insignias, conseguidas o no. Las que no, con su progreso:
        /// una casilla gris que dice «3 de 5» invita, y una que solo dice «bloqueada» no.
        let collection: [ContributionScore.BadgeSlot]
    }

    struct LevelStanding: Content, Sendable {
        let key: String
        let from: Int
        let reached: Bool
        /// El que tienes ahora mismo. Exactamente uno lo es.
        let current: Bool
    }

    /// Cuántas fuentes mantiene al día esta persona: aquellas cuya reseña más reciente es
    /// suya y no ha caducado. Es la cifra que mejor describe lo que hace un colaborador
    /// habitual, y no se puede inflar reseñando mucho la misma tarde.
    static let freshnessHorizon: TimeInterval = 180 * 86_400

    static func profile(for userID: UUID, on db: any Database, now: Date = Date()) async throws -> Profile {
        let eventos = try await ContributionEvent.query(on: db)
            .filter(\.$user.$id == userID)
            .filter(\.$status != .void)
            .all()
        let liquidados = eventos.filter { $0.status == .settled }
        let gotes = liquidados.reduce(0) { $0 + $1.gotes }
        let pending = eventos.filter { $0.status == .pending }.reduce(0) { $0 + $1.gotes }

        // Insignias y desglose, solo sobre lo cobrado: enseñar una insignia que luego se
        // retira porque la aportación se anuló es peor que no enseñarla.
        var tally = ContributionScore.BadgeTally()
        var porTipo: [String: (count: Int, gotes: Int)] = [:]
        let fontIDs = Array(Set(liquidados.compactMap { $0.$font.id }))
        let fonts = fontIDs.isEmpty ? [] : try await Font.query(on: db).filter(\.$id ~~ fontIDs).all()
        let fontsByID = Dictionary(uniqueKeysWithValues: fonts.compactMap { f in f.id.map { ($0, f) } })

        for e in liquidados {
            let previo = porTipo[e.kind] ?? (0, 0)
            porTipo[e.kind] = (previo.count + 1, previo.gotes + e.gotes)
            if let r = e.$font.id.flatMap({ fontsByID[$0]?.region }) { tally.regions.insert(r) }
            guard let kind = ContributionScore.Kind(rawValue: e.kind) else { continue }
            switch kind {
            case .fontCreated: tally.fontsCreated += 1
            case .firstPhoto: tally.firstPhotos += 1
            case .relocation, .fieldCompleted: tally.mapFixes += 1
            case .updateReview where e.base >= 50: tally.sentinelUpdates += 1
            default: break
            }
            if kind == .firstReview || kind == .updateReview {
                if ContributionScore.isSummer(e.occurredAt) { tally.summerReviews += 1 }
                if kind == .firstReview, let f = e.$font.id.flatMap({ fontsByID[$0] }), f.$creator.id == nil {
                    tally.pioneer = true
                }
            }
        }

        // Las cuatro estaciones. Sobre `occurredAt` y no sobre la fecha de liquidación:
        // una reseña del 20 de marzo liquidada el 23 sigue siendo de primavera, y en los
        // cambios de estación las dos fechas caen a lados distintos.
        tally.fourSeasonFonts = ContributionScore.fourSeasonFonts(
            from: liquidados.compactMap { e in
                guard let kind = ContributionScore.Kind(rawValue: e.kind),
                      kind == .firstReview || kind == .updateReview,
                      let fid = e.$font.id else { return nil }
                return (fontID: fid, at: e.occurredAt)
            })

        // Fuentes que mantiene al día: su reseña es la última de esa fuente y es reciente.
        var alDia = 0
        if !fontIDs.isEmpty {
            let comentarios = try await FontComment.query(on: db).filter(\.$font.$id ~~ fontIDs).all()
            var ultimaPorFuente: [UUID: FontComment] = [:]
            for c in comentarios {
                let actual = ultimaPorFuente[c.$font.id]
                if actual == nil || (c.createdAt ?? .distantPast) > (actual?.createdAt ?? .distantPast) {
                    ultimaPorFuente[c.$font.id] = c
                }
            }
            alDia = ultimaPorFuente.values.filter {
                $0.$user.id == userID && now.timeIntervalSince($0.createdAt ?? .distantPast) <= freshnessHorizon
            }.count
        }

        let nivel = ContributionScore.level(for: gotes)
        let siguiente = ContributionScore.nextLevel(after: gotes)

        return Profile(
            gotes: gotes,
            pending: pending,
            level: nivel.key,
            nextLevel: siguiente?.key,
            gotesToNextLevel: siguiente.map { $0.from - gotes },
            badges: ContributionScore.badges(for: tally)
                .map { .init(family: $0.key, tier: $0.tier.rawValue, progress: $0.progress, threshold: $0.threshold) },
            byKind: ContributionScore.Kind.allCases.compactMap { k in
                guard let d = porTipo[k.rawValue], d.count > 0 else { return nil }
                return .init(kind: k.rawValue, label: k.label, count: d.count, gotes: d.gotes)
            },
            impact: .init(fontsWithPhotoThanksToYou: tally.firstPhotos,
                          fontsYouKeepFresh: alDia,
                          fontsYouPutOnTheMap: tally.fontsCreated),
            provisional: epoch.map { now < $0 } ?? true,
            // De abajo arriba: la vitrina se lee como una escalera y `levels` viene
            // ordenada de mayor a menor porque `level(for:)` necesita ese orden.
            levels: ContributionScore.levels.reversed().map {
                LevelStanding(key: $0.key, from: $0.from,
                              reached: gotes >= $0.from, current: $0.key == nivel.key)
            },
            collection: ContributionScore.catalogue(for: tally))
    }

    /// Marcador de todos, de más a menos. `since` acota a un periodo (los rankings del
    /// documento son mensuales a propósito: uno histórico lo gana para siempre quien llegó
    /// primero y nadie más juega).
    static func leaderboard(on db: any Database, since: Date? = nil,
                            region: String? = nil, limit: Int = 50) async throws -> [(userID: UUID, gotes: Int)] {
        var query = ContributionEvent.query(on: db).filter(\.$status == .settled)
        if let since { query = query.filter(\.$occurredAt >= since) }
        if let region {
            let ids = try await Font.query(on: db).filter(\.$region == region).all().compactMap { $0.id }
            guard !ids.isEmpty else { return [] }
            query = query.filter(\.$font.$id ~~ ids)
        }
        var suma: [UUID: Int] = [:]
        for e in try await query.all() { suma[e.$user.id, default: 0] += e.gotes }
        return suma.sorted { $0.value > $1.value }.prefix(limit).map { (userID: $0.key, gotes: $0.value) }
    }
}
