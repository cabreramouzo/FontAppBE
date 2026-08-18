import Fluent
import Foundation
import Vapor

/// Fase 1 de la gamificación: puntuar el historial **sin escribir nada**.
///
/// Todo lo que hace falta para saber quién aportó qué y cuándo ya está en las tablas
/// actuales, así que el día que se abra nadie empieza en cero. Este cálculo existe para
/// **calibrar el baremo con datos reales antes de comprometerse con ningún número**: es
/// mucho más barato mover una constante aquí que migrar una tabla de puntos ya publicada.
///
/// El diseño completo, con el porqué de cada valor, está en `docs/gamificacion.md`.
///
/// Es de solo lectura. No hay ningún `save` en todo el fichero, a propósito.
enum ContributionScore {

    // MARK: - Baremo

    /// Los valores son la escala *relativa*; los absolutos se pueden reescalar. Cada uno
    /// es el valor informativo marginal de la aportación, no el esfuerzo que costó.
    enum Kind: String, CaseIterable, Codable, Sendable {
        case fontCreated      // fuente que no existía
        case firstPhoto       // primera foto de una fuente que no tenía
        case photoReplaced    // sustituir una foto por otra
        case firstReview      // primera reseña de una fuente nunca visitada
        case updateReview     // reseña de actualización (escalada por frescura)
        case relocation       // mover el pin
        case fieldCompleted   // un campo que pasa de vacío a lleno
        case report           // incidencia
        case confirmation     // confirmar la reseña de otro

        /// ¿Prueba que estuviste **delante de la fuente**?
        ///
        /// Lo usan las insignias de recorrido —`regions`, `international`— y la de
        /// Catalunya. Rellenar un campo es edición estilo wiki y mover el pin se hace con
        /// la ortofoto: las dos se pueden hacer sobre una fuente de Tarragona desde el
        /// sofá de Castellcir, y una medalla que dice «has recorrido» no puede contarlas.
        /// Confirmar la reseña de otro es opinar sobre lo que dijo alguien, no haber visto
        /// el agua.
        ///
        /// Nada de esto es **verificable** —lo afirma el cliente, ver `PhotoExif`— pero sí
        /// es difícil de inventar sin haber ido, que es todo lo que una web puede pedir.
        ///
        /// Vive aquí y no en cada insignia para que haya **una sola** lista: cuando se
        /// añada un tipo nuevo, esta pregunta se responde una vez.
        var provesPresence: Bool {
            switch self {
            case .fontCreated, .firstPhoto, .photoReplaced, .firstReview, .updateReview, .report:
                return true
            case .fieldCompleted, .relocation, .confirmation:
                return false
            }
        }

        var base: Int {
            switch self {
            case .firstPhoto:     return 120
            case .fontCreated:    return 100
            case .firstReview:    return 80
            case .relocation:     return 60
            case .report:         return 40
            case .fieldCompleted: return 25
            case .photoReplaced:  return 15
            case .confirmation:   return 10
            case .updateReview:   return 0   // lo pone la curva de frescura
            }
        }

        var label: String {
            switch self {
            case .fontCreated:    return "fuente nueva"
            case .firstPhoto:     return "primera foto"
            case .photoReplaced:  return "foto sustituida"
            case .firstReview:    return "primera reseña"
            case .updateReview:   return "actualización"
            case .relocation:     return "reubicación"
            case .fieldCompleted: return "campo completado"
            case .report:         return "incidencia"
            case .confirmation:   return "confirmación"
            }
        }
    }

    /// Curva de frescura: lo que vale volver a una fuente según el tiempo que hacía que
    /// nadie pasaba. Plana en los extremos a propósito — a la izquierda para no pagar el
    /// pisoteo de los habituales, a la derecha porque a partir del año da igual que haga
    /// trece meses o cuarenta.
    static func freshness(daysSincePrevious dias: Int?) -> Int {
        guard let d = dias else { return 70 }   // nunca reseñada antes
        switch d {
        case ..<8:   return 5
        case ..<31:  return 15
        case ..<91:  return 35
        case ..<181: return 50
        case ..<366: return 60
        default:     return 70
        }
    }

    /// A qué distancia de la fuente reseñada más cercana empieza a contar como «desierto».
    ///
    /// Eran 10 km y saltaba en el 46 % de las aportaciones: en demarcación rural, diez
    /// kilómetros sin una fuente reseñada es lo normal, no la excepción. A 20 km la
    /// condición vuelve a describir lo que decía describir.
    static let desertKm = 20.0
    static let desertFactor = 1.25
    /// Estiaje: julio y agosto, no de junio a septiembre. Con cuatro meses saltaba en el
    /// 79 % de los estados de agua —un tercio del calendario cubre casi toda la actividad,
    /// porque es cuando la gente sale a caminar— y un multiplicador que se aplica a cuatro
    /// de cada cinco aportaciones no es un multiplicador: es el baremo base disfrazado.
    static let dryMonths = 7...8
    static let dryFactor = 1.15
    static let doubtWindowDays = 90.0
    static let doubtFactor = 1.5
    static let crowdedWindowDays = 30.0
    static let maxMultiplier = desertFactor * dryFactor * doubtFactor

    // MARK: - Resultado

    /// De qué tabla sale la aportación. Junto con `subjectID` y `detail` forma su
    /// identidad estable: es lo que permite volver a pasar el cálculo tantas veces como
    /// haga falta sin duplicar nada en el registro de la fase 2.
    enum Source: String, Codable, Sendable {
        case font, comment, edit, report, confirmation
    }

    struct Contribution: Sendable {
        let userID: UUID
        let kind: Kind
        let fontID: UUID
        let fontName: String
        let at: Date
        /// Identidad: tabla de origen, fila concreta y, cuando una misma fila genera
        /// varias aportaciones (una edición que completa tres campos), cuál de ellas.
        let source: Source
        let subjectID: UUID
        let detail: String
        let base: Int
        let multiplier: Double
        let note: String
        /// Qué multiplicadores se activaron. Se guarda aparte de `note` porque la
        /// frecuencia con que salta cada uno es justo lo que hay que calibrar: un
        /// multiplicador que se aplica al 80 % de las aportaciones no es un multiplicador,
        /// es el baremo base disfrazado.
        let reasons: [String]

        var gotes: Int { Int((Double(base) * multiplier).rounded()) }
    }

    /// Grado de una insignia. Viaja como clave, igual que el nivel; el rótulo lo pone el
    /// navegador. `name` es solo para la salida de los comandos.
    enum Tier: String, Sendable {
        case bronze, silver, gold
        /// Las que no tienen grados: se consiguen una vez y ya está.
        case unique

        var name: String {
            switch self {
            case .bronze: return "bronce"
            case .silver: return "plata"
            case .gold:   return "oro"
            case .unique: return "única"
            }
        }
    }

    struct BadgeAward: Sendable {
        /// Clave estable (`firstLight`), lo que se manda al cliente.
        let key: String
        /// Castellano, para la consola. La interfaz NO usa esto.
        let name: String
        let tier: Tier
        let progress: Int
        let threshold: Int
    }

    struct UserScore: Sendable {
        let userID: UUID
        let username: String
        var gotes: Int
        var byKind: [Kind: (count: Int, gotes: Int)]
        var badges: [BadgeAward]
        var regions: Set<String>
        var level: Level
    }

    /// Niveles. En fase 1 son informativos: no desbloquean nada todavía.
    ///
    /// La escalera es **la misma agua haciéndose más grande**, de una gota al acuífero que
    /// alimenta todas las fuentes del mapa. Diez peldaños y no cinco porque con cinco se
    /// llegaba al tercero en una semana intensa (medido: 2 853 gotas y nivel 3 de 5 tras
    /// 31 aportaciones), y un nivel alto alcanzado pronto deja de motivar.
    ///
    /// `key` es lo que viaja al cliente y a la base: `name` es solo para la consola. El
    /// nombre traducido lo pone el navegador — mandar «Arroyo» a alguien que tiene la app
    /// en catalán es el fallo que teníamos antes.
    struct Level: Sendable {
        let key: String
        /// Castellano, para la salida de los comandos. La interfaz NO usa esto.
        let name: String
        let from: Int
    }

    /// De mayor a menor: `level(for:)` se queda con el primero que alcanzas.
    ///
    /// Los cortes doblan de peldaño en peldaño a partir del tercero. Un factor constante
    /// hace que subir cueste siempre «el doble que lo que llevas», que es la única forma
    /// de que el escalón 9 signifique lo mismo que el 3 para quien está ahí. Los dos
    /// primeros van más juntos a propósito: el primer ascenso tiene que llegar en una o
    /// dos aportaciones o nadie descubre que los niveles existen.
    static let levels: [Level] = [
        .init(key: "aquifer",   name: "Acuífero",  from: 60_000),
        .init(key: "lake",      name: "Lago",      from: 28_000),
        .init(key: "reservoir", name: "Embalse",   from: 14_000),
        .init(key: "waterfall", name: "Cascada",   from: 7_000),
        .init(key: "river",     name: "Río",       from: 3_500),
        .init(key: "stream",    name: "Riachuelo", from: 1_700),
        .init(key: "torrent",   name: "Torrente",  from: 800),
        .init(key: "brook",     name: "Arroyo",    from: 350),
        .init(key: "spring",    name: "Manantial", from: 100),
        .init(key: "drop",      name: "Gota",      from: 0),
    ]

    static func level(for gotes: Int) -> Level {
        levels.first { gotes >= $0.from } ?? levels[levels.count - 1]
    }

    /// El siguiente peldaño, o `nil` si ya está arriba del todo.
    static func nextLevel(after gotes: Int) -> Level? {
        levels.last { $0.from > gotes }
    }

    // MARK: - Cálculo

    struct Report: Sendable {
        var users: [UserScore]
        var contributions: [Contribution]
        /// Cosas que en fase 1 no se pueden saber; se listan para que nadie lea las
        /// cifras como si fueran definitivas.
        var caveats: [String]
    }

    static func compute(on db: any Database) async throws -> Report {
        let users = try await User.query(on: db).all()
        let fonts = try await Font.query(on: db).all()
        let comments = try await FontComment.query(on: db).sort(\.$createdAt, .ascending).all()
        let confirmations = try await FontConfirmation.query(on: db).all()
        let reports = try await FontReport.query(on: db).sort(\.$createdAt, .ascending).all()
        let edits = try await FontEdit.query(on: db).sort(\.$createdAt, .ascending).all()

        let fontsByID = Dictionary(uniqueKeysWithValues: fonts.compactMap { f in f.id.map { ($0, f) } })
        let commentsByID = Dictionary(uniqueKeysWithValues: comments.compactMap { c in c.id.map { ($0, c) } })
        var caveats: [String] = []

        // Fechas de reseña por fuente, para la curva de frescura y los multiplicadores.
        var reviewDates: [UUID: [Date]] = [:]
        for c in comments {
            guard let d = c.createdAt else { continue }
            reviewDates[c.$font.id, default: []].append(d)
        }
        // Fechas de incidencia por fuente, para el multiplicador de "dudosa".
        var reportDates: [UUID: [Date]] = [:]
        for r in reports {
            guard let d = r.createdAt else { continue }
            reportDates[r.$font.id, default: []].append(d)
        }

        // Fuentes con al menos una reseña, ordenadas por su primera reseña: sirve para
        // saber si un punto estaba en un desierto de datos *en aquel momento*.
        let reviewedFonts: [(date: Date, lat: Double, long: Double)] = reviewDates
            .compactMap { id, fechas in
                guard let f = fontsByID[id], let primera = fechas.min() else { return nil }
                return (primera, f.latitude, f.longitude)
            }
            .sorted { $0.date < $1.date }
        // La comprobación del desierto es O(aportaciones × fuentes reseñadas). Con pocas
        // miles va sobrado; si algún día son muchas, más vale no aplicarla que tardar
        // media hora en un cálculo que solo sirve para calibrar.
        let desertComputable = reviewedFonts.count <= 5_000
        if !desertComputable {
            caveats.append("Multiplicador de desierto omitido: hay \(reviewedFonts.count) fuentes reseñadas y el cálculo sería cuadrático.")
        }

        func multiplier(fontID: UUID, at fecha: Date, isWaterStatus: Bool) -> (Double, [String]) {
            var m = 1.0
            var razones: [String] = []
            if let f = fontsByID[fontID], desertComputable {
                let previas = reviewedFonts.prefix { $0.date < fecha }
                let cerca = previas.contains { haversineKm(f.latitude, f.longitude, $0.lat, $0.long) <= desertKm }
                if !previas.isEmpty && !cerca { m *= desertFactor; razones.append("desierto") }
            }
            if isWaterStatus {
                let mes = Calendar(identifier: .gregorian).component(.month, from: fecha)
                if dryMonths.contains(mes) { m *= dryFactor; razones.append("estiaje") }
            }
            if let incidencias = reportDates[fontID],
               incidencias.contains(where: { $0 < fecha && fecha.timeIntervalSince($0) <= doubtWindowDays * 86_400 }) {
                m *= doubtFactor; razones.append("dudosa")
            }
            // Amortiguación: si la fuente ya tiene 3+ reseñas frescas, un testimonio más
            // de la misma semana no añade casi nada.
            let frescas = (reviewDates[fontID] ?? []).filter {
                $0 < fecha && fecha.timeIntervalSince($0) <= crowdedWindowDays * 86_400
            }
            if frescas.count >= 3 { m *= 0.2; razones.append("saturada") }
            return (min(m, maxMultiplier), razones)
        }

        var contribs: [Contribution] = []
        func add(_ userID: UUID?, _ kind: Kind, fontID: UUID, at fecha: Date?,
                 from source: Source, subject: UUID?, detail: String = "",
                 base: Int? = nil, applyMultiplier: Bool = true, isWaterStatus: Bool = false,
                 note: String = "") {
            guard let userID, let fecha, let subject, let font = fontsByID[fontID] else { return }
            var m = 1.0
            var razones: [String] = []
            if applyMultiplier { (m, razones) = multiplier(fontID: fontID, at: fecha, isWaterStatus: isWaterStatus) }
            let nota = [note, razones.joined(separator: "+")].filter { !$0.isEmpty }.joined(separator: " · ")
            contribs.append(Contribution(userID: userID, kind: kind, fontID: fontID,
                                         fontName: font.name, at: fecha,
                                         source: source, subjectID: subject, detail: detail,
                                         base: base ?? kind.base, multiplier: m, note: nota,
                                         reasons: razones))
        }

        // --- Fuentes creadas ---------------------------------------------------
        for f in fonts {
            guard let id = f.id else { continue }
            add(f.$creator.id, .fontCreated, fontID: id, at: f.createdAt, from: .font, subject: id)
        }

        // --- Reseñas: primera vs actualización ---------------------------------
        var porFuente: [UUID: [FontComment]] = [:]
        for c in comments { porFuente[c.$font.id, default: []].append(c) }
        for (fontID, lista) in porFuente {
            var anterior: Date?
            for c in lista.sorted(by: { ($0.createdAt ?? .distantPast) < ($1.createdAt ?? .distantPast) }) {
                guard let fecha = c.createdAt else { continue }
                let tieneEstado = c.waterStatus != nil
                if anterior == nil {
                    add(c.$user.id, .firstReview, fontID: fontID, at: fecha,
                        from: .comment, subject: c.id, isWaterStatus: tieneEstado)
                } else {
                    let dias = Int(fecha.timeIntervalSince(anterior!) / 86_400)
                    add(c.$user.id, .updateReview, fontID: fontID, at: fecha,
                        from: .comment, subject: c.id,
                        base: freshness(daysSincePrevious: dias), isWaterStatus: tieneEstado,
                        note: "\(dias) d sin visitas")
                }
                anterior = fecha
            }
        }

        // --- Fotos: primera vs sustitución -------------------------------------
        // `fonts.image` no guarda autor, así que la autoría se reconstruye con lo que sí
        // deja rastro: reseñas con foto y ediciones que tocaron el campo `image`.
        struct PhotoEvent { let userID: UUID?; let at: Date; let source: Source; let subject: UUID? }
        var photoEvents: [UUID: [PhotoEvent]] = [:]
        for c in comments where c.image != nil {
            guard let d = c.createdAt else { continue }
            photoEvents[c.$font.id, default: []].append(
                PhotoEvent(userID: c.$user.id, at: d, source: .comment, subject: c.id))
        }
        for e in edits where e.before.image != e.after.image && e.after.image != nil {
            guard let d = e.createdAt else { continue }
            photoEvents[e.$font.id, default: []].append(
                PhotoEvent(userID: e.$editor.id, at: d, source: .edit, subject: e.id))
        }
        // La foto que se sube **en el formulario de crear la fuente** no deja ninguno de
        // los dos rastros: no hay reseña y no hay edición, la columna nace con la imagen
        // puesta. Sin esto, quien crea una fuente con su foto —el caso normal cuando
        // alguien añade una fuente nueva estando delante de ella— no cobraba la primera
        // foto y en la ficha salía «no consta quién la puso», teniendo el autor delante.
        //
        // La condición es que la fuente tenga imagen y **ningún** rastro: si hay una
        // reseña con foto o una edición que la puso, la foto llegó después y el mérito es
        // de quien la trajo, no del creador. Queda un caso que sigue sin poderse decidir
        // —una edición antigua, de cuando el snapshot todavía no guardaba `image`— y ahí
        // esto atribuye al creador algo que quizá hizo otro; es un fallo menos malo que
        // el anterior, que era no pagárselo a nadie, pero es un fallo.
        for f in fonts {
            guard let id = f.id, f.image != nil, photoEvents[id] == nil else { continue }
            guard let d = f.createdAt else { continue }
            photoEvents[id] = [PhotoEvent(userID: f.$creator.id, at: d, source: .font, subject: id)]
        }
        for (fontID, eventos) in photoEvents {
            for (i, ev) in eventos.sorted(by: { $0.at < $1.at }).enumerated() {
                add(ev.userID, i == 0 ? .firstPhoto : .photoReplaced, fontID: fontID, at: ev.at,
                    from: ev.source, subject: ev.subject, detail: "foto")
            }
        }
        // Lo que queda sin dueño son las importadas: tienen foto y no tienen creador.
        let conFotoSinAutor = fonts.filter { $0.image != nil && $0.$creator.id == nil }.count
        if conFotoSinAutor > 0 {
            caveats.append("\(conFotoSinAutor) fuentes tienen foto y no tienen creador: no las cobra nadie.")
        }

        // --- Ediciones: reubicación y campos completados -----------------------
        var editsPorFuente: [UUID: [FontEdit]] = [:]
        for e in edits { editsPorFuente[e.$font.id, default: []].append(e) }

        /// Una edición se da por revertida si alguna posterior sobre la misma fuente
        /// devuelve exactamente el estado previo. Es una aproximación: la fase 2 lo
        /// sabrá de primera mano porque registrará el evento cuando ocurra.
        func revertida(_ e: FontEdit, en lista: [FontEdit]) -> Bool {
            guard let cuando = e.createdAt else { return false }
            return lista.contains { otra in
                (otra.createdAt ?? .distantPast) > cuando && otra.after == e.before
            }
        }

        for (fontID, lista) in editsPorFuente {
            for e in lista {
                if revertida(e, en: lista) { continue }
                if let la = e.before.latitude, let lo = e.before.longitude,
                   let na = e.after.latitude, let no = e.after.longitude,
                   la != na || lo != no {
                    add(e.$editor.id, .relocation, fontID: fontID, at: e.createdAt,
                        from: .edit, subject: e.id, applyMultiplier: false,
                        note: String(format: "%.0f m", haversineKm(la, lo, na, no) * 1000))
                }
                var completados: [String] = []
                if esVacia(e.before.description) && !esVacia(e.after.description) { completados.append("descripción") }
                if e.before.drinkable == nil && e.after.drinkable != nil { completados.append("potabilidad") }
                if e.before.source == nil && e.after.source != nil { completados.append("tipo") }
                for campo in completados {
                    add(e.$editor.id, .fieldCompleted, fontID: fontID, at: e.createdAt,
                        from: .edit, subject: e.id, detail: campo,
                        applyMultiplier: false, note: campo)
                }
            }
        }

        // --- Incidencias --------------------------------------------------------
        for r in reports {
            add(r.$user.id, .report, fontID: r.$font.id, at: r.createdAt,
                from: .report, subject: r.id, applyMultiplier: false)
        }

        // --- Confirmaciones -----------------------------------------------------
        var autoConfirmaciones = 0
        for c in confirmations {
            guard let comentario = commentsByID[c.$comment.id] else { continue }
            if comentario.$user.id == c.$user.id { autoConfirmaciones += 1; continue }
            add(c.$user.id, .confirmation, fontID: comentario.$font.id, at: c.createdAt,
                from: .confirmation, subject: c.id, applyMultiplier: false)
        }
        if autoConfirmaciones > 0 {
            caveats.append("\(autoConfirmaciones) confirmaciones son sobre la propia reseña: no puntúan.")
        }

        // --- Agregado por usuario ----------------------------------------------
        var porUsuario: [UUID: [Contribution]] = [:]
        for c in contribs { porUsuario[c.userID, default: []].append(c) }

        var scores: [UserScore] = []
        for u in users {
            guard let uid = u.id else { continue }
            let mias = porUsuario[uid] ?? []
            guard !mias.isEmpty else { continue }

            var byKind: [Kind: (count: Int, gotes: Int)] = [:]
            for c in mias {
                let previo = byKind[c.kind] ?? (0, 0)
                byKind[c.kind] = (previo.count + 1, previo.gotes + c.gotes)
            }
            let total = mias.reduce(0) { $0 + $1.gotes }
            let regiones = Set(mias.compactMap { fontsByID[$0.fontID]?.region })

            scores.append(UserScore(
                userID: uid, username: u.username, gotes: total, byKind: byKind,
                badges: badges(for: mias, regions: regiones, fontsByID: fontsByID),
                regions: regiones, level: level(for: total)
            ))
        }
        scores.sort { $0.gotes > $1.gotes }

        caveats.append("Sin multiplicador de verificación in situ: no se guarda la posición de quien reseña, así que todo cuenta como no verificado y las cifras salen conservadoras.")
        caveats.append("Insignias «Fora de casa» y «Sense cobertura» no calculables: no se guarda ni la distancia al domicilio ni si la aportación vino de la bandeja de salida.")

        return Report(users: scores, contributions: contribs.sorted { $0.at > $1.at }, caveats: caveats)
    }

    /// Una descripción que solo es la atribución de la fuente de datos no es contenido.
    static func esVacia(_ texto: String?) -> Bool {
        guard let t = texto?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return true }
        return t.hasPrefix("©") || t == "Manantial (OpenStreetMap)" || t == "Font (OpenStreetMap)"
    }

    // MARK: - Insignias

    /// Lo que hace falta contar para repartir insignias. Existe como tipo aparte porque
    /// las insignias se calculan en dos sitios —sobre el cálculo en vivo (fase 1) y sobre
    /// el registro ya liquidado (fase 3)— y tener dos copias del criterio sería tener dos
    /// criterios que se separan a la primera de cambio.
    struct BadgeTally: Sendable {
        var fontsCreated = 0
        var firstPhotos = 0
        /// Actualizaciones sobre fuentes olvidadas 6 meses o más (base ≥ 50 en la curva).
        var sentinelUpdates = 0
        var mapFixes = 0
        /// Reseñas hechas entre junio y septiembre, cuando las fuentes se secan.
        var summerReviews = 0
        var regions: Set<String> = []
        /// Primera reseña de una fuente importada: convierte un punto en una fuente vista.
        var pioneer = false
        /// Fuentes que esta persona ha reseñado en las **cuatro** estaciones.
        ///
        /// Es la única insignia que no se puede acelerar: hacen falta doce meses reales,
        /// pase lo que pase. Y premia exactamente lo que la curva de frescura quiere —
        /// volver a la misma fuente cuando ha pasado tiempo— en vez de premiar el volumen.
        var fourSeasonFonts = 0
        /// Incidencias avisadas: fuentes rotas, secas o que ya no están.
        ///
        /// Avisar de un problema es la aportación más ingrata que hay —no añade nada
        /// bonito a la ficha, la estropea— y es de las más útiles: una fuente que ya no
        /// existe en el mapa manda a alguien a andar para nada.
        var incidents = 0
        /// Aportaciones en zona sin datos (el multiplicador «desierto»).
        var farAwayContributions = 0
        /// Aportaciones creadas **sin cobertura**, desde la bandeja de salida.
        var offlineContributions = 0
        /// Fuentes cuya última reseña reciente y liquidada pertenece a la persona.
        var fountainsKeptFresh = 0
        /// Fuentes distintas que volvieron a constar como `flowing` después de `dry`.
        var recoveredFountains = 0
        /// Jornadas con reseñas liquidadas en tres fuentes distintas como mínimo.
        var routeDays = 0
        /// Confirmaciones de reseñas ajenas.
        var verifications = 0
        /// Fuentes completas a las que la persona aportó alguno de los datos que faltaban.
        var rescuedFountains = 0
        /// Países distintos en los que hay aportaciones liquidadas.
        var countries: Set<String> = []
        /// Días UTC distintos con al menos una aportación liquidada.
        var activeDays = 0
        /// Reseñas tras más de un año sin que nadie actualizara la fuente.
        var reunions = 0
        /// Fuentes recientes de otra persona a las que se aportó durante sus primeros 30 días.
        var teamworkFountains = 0
        /// Incidencias propias tras las que consta una reseña liquidada de recuperación.
        var resolvedIncidents = 0
    }

    /// Estación meteorológica (0 invierno · 1 primavera · 2 verano · 3 otoño). Se usa el
    /// corte meteorológico y no el astronómico porque los equinoccios se mueven de año en
    /// año y aquí lo que importa es que una reseña de marzo y otra de junio cuenten como
    /// dos estaciones distintas, no clavar el día exacto.
    static func season(_ d: Date) -> Int {
        let mes = Calendar(identifier: .gregorian).component(.month, from: d)
        return (mes % 12) / 3
    }

    /// Cuántas fuentes tienen las cuatro estaciones cubiertas por esta persona.
    static func fourSeasonFonts(from visitas: [(fontID: UUID, at: Date)]) -> Int {
        var porFuente: [UUID: Set<Int>] = [:]
        for v in visitas { porFuente[v.fontID, default: []].insert(season(v.at)) }
        return porFuente.values.count { $0.count == 4 }
    }

    /// Las familias de insignias, en un solo sitio.
    ///
    /// Está extraído aquí porque hay **dos** lecturas de la misma tabla: el marcador, que
    /// solo enseña lo conseguido, y la vitrina de `/me/badges`, que enseña también lo que
    /// falta. Con la tabla escrita dos veces, una silueta gris podría pedir un umbral que
    /// no es el que luego se cobra.
    struct BadgeFamily: Sendable {
        let key: String
        /// Castellano, para la consola. La interfaz traduce por `key`.
        let name: String
        /// Bronce · plata · oro. `Pionera` tiene uno solo y es `unique`.
        let thresholds: [Int]
        let unique: Bool
        let count: @Sendable (BadgeTally) -> Int
    }

    static let badgeFamilies: [BadgeFamily] = [
        .init(key: "discoverer", name: "Descubridor", thresholds: [10, 50, 200], unique: false) { $0.fontsCreated },
        .init(key: "firstLight", name: "Primera luz", thresholds: [5, 25, 100], unique: false) { $0.firstPhotos },
        .init(key: "sentinel", name: "Centinela", thresholds: [15, 60, 250], unique: false) { $0.sentinelUpdates },
        .init(key: "cartographer", name: "Cartógrafo", thresholds: [10, 40, 150], unique: false) { $0.mapFixes },
        // `regions` y no `counties`: la columna guarda **provincias** en España (52 con
        // Ceuta y Melilla), distritos en Portugal, départements en Francia y parròquies en
        // Andorra. Catalunya tiene 42 demarcacions y en la base no hay ni una. El nombre en
        // inglés era lo que inducía a traducir «demarcacions» una y otra vez.
        .init(key: "regions", name: "Demarcaciones", thresholds: [3, 8, 20], unique: false) { $0.regions.count },
        .init(key: "drySeason", name: "Estiaje", thresholds: [10, 40, 120], unique: false) { $0.summerReviews },
        // Umbrales bajos porque el precio ya lo pone el calendario: la de bronce cuesta
        // un año entero de volver a la misma fuente, y no hay forma de acortarlo.
        .init(key: "fourSeasons", name: "Las cuatro estaciones", thresholds: [1, 3, 10], unique: false) { $0.fourSeasonFonts },
        .init(key: "pioneer", name: "Pionero", thresholds: [1], unique: true) { $0.pioneer ? 1 : 0 },
        // Umbrales más bajos que los de crear o fotografiar: avisar de que una fuente está
        // rota es raro por definición —la mayoría funcionan— y quien lo hace no está
        // coleccionando, está avisando. Pedirle 200 sería pedirle que ojalá se rompan más.
        .init(key: "incidents", name: "Vigía", thresholds: [3, 15, 50], unique: false) { $0.incidents },
        // Lejanía: el multiplicador de desierto ya marca estas aportaciones, así que el
        // umbral es alto a propósito. En demarcación rural saltaría constantemente y sería la
        // insignia de vivir en el campo, no la de haberse desviado a buscar algo.
        .init(key: "farAway", name: "Lejanía", thresholds: [10, 40, 150], unique: false) { $0.farAwayContributions },
        // Sin cobertura: es un dato que afirma el móvil y el servidor no puede comprobar,
        // así que **no da gotas, solo la insignia**. Falsear la cabecera daría una medalla
        // y ni un punto de ventaja, que es justo el incentivo que se busca.
        .init(key: "offline", name: "Sin cobertura", thresholds: [1, 10, 40], unique: false) { $0.offlineContributions },
        .init(key: "guardianLocal", name: "Guardián local", thresholds: [5, 20, 75], unique: false) { $0.fountainsKeptFresh },
        .init(key: "waterRecovered", name: "Agua recuperada", thresholds: [1, 5, 20], unique: false) { $0.recoveredFountains },
        .init(key: "routes", name: "Ruta de fuentes", thresholds: [3, 10, 30], unique: false) { $0.routeDays },
        .init(key: "verifier", name: "Verificador", thresholds: [10, 50, 200], unique: false) { $0.verifications },
        .init(key: "fountainRescued", name: "Fuente rescatada", thresholds: [5, 20, 75], unique: false) { $0.rescuedFountains },
        .init(key: "international", name: "Explorador internacional", thresholds: [2, 5, 10], unique: false) { $0.countries.count },
        .init(key: "consistency", name: "Constancia", thresholds: [7, 30, 100], unique: false) { $0.activeDays },
        .init(key: "reunion", name: "Reencuentro", thresholds: [1, 10, 40], unique: false) { $0.reunions },
        .init(key: "teamwork", name: "Trabajo en equipo", thresholds: [5, 25, 100], unique: false) { $0.teamworkFountains },
        .init(key: "incidentResolved", name: "Incidencia resuelta", thresholds: [1, 5, 20], unique: false) { $0.resolvedIncidents },
    ]

    /// Una casilla de la vitrina: la familia, cómo va y si está conseguida.
    struct BadgeSlot: Content, Sendable {
        let family: String
        /// `bronze` · `silver` · `gold` · `unique`, o **nulo si todavía no la tienes**.
        /// Es lo que decide si la casilla se pinta en color o como silueta.
        let tier: String?
        let progress: Int
        /// El umbral que persigues ahora. Al máximo, el último.
        let threshold: Int
        /// Los tres (o uno) escalones, para poder dibujar la escalera completa.
        let thresholds: [Int]
        /// El grado que tendrías **contando lo que aún no ha liquidado**, cuando es mejor
        /// que el que ya tienes. Nulo si no hay nada en camino.
        ///
        /// Existe porque la felicitación **sí** cuenta lo pendiente y la vitrina no, así
        /// que durante 72 h se podía ver el confeti por una insignia y encontrarla después
        /// en gris y con candado. Las dos cosas eran correctas por separado y juntas
        /// parecían una avería — pasó, y a quien se lo encontró fue al autor de la app.
        var pendingTier: String?

        /// `tier` se escribe **explícitamente como `null`** y no se omite.
        ///
        /// El codificador sintetizado de Swift usa `encodeIfPresent` para los opcionales,
        /// así que una insignia sin conseguir salía del servidor *sin* la clave `tier`.
        /// En el cliente eso llega como `undefined`, y `undefined !== null` es cierto: la
        /// vitrina daba por conseguidas justo las que están bloqueadas. Un campo cuya
        /// ausencia significa lo contrario de lo que quiere decir tiene que viajar.
        func encode(to encoder: any Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(family, forKey: .family)
            try c.encode(tier, forKey: .tier)
            try c.encode(progress, forKey: .progress)
            try c.encode(threshold, forKey: .threshold)
            try c.encode(thresholds, forKey: .thresholds)
            // Explícito, como `tier` y por lo mismo.
            try c.encode(pendingTier, forKey: .pendingTier)
        }
    }

    /// Grado alcanzado con `n` en una familia, o `nil`.
    static func tier(_ f: BadgeFamily, _ n: Int) -> Tier? {
        if f.unique { return n >= f.thresholds[0] ? .unique : nil }
        if n >= f.thresholds[2] { return .gold }
        if n >= f.thresholds[1] { return .silver }
        if n >= f.thresholds[0] { return .bronze }
        return nil
    }

    /// **Todas** las familias, conseguidas o no. Es lo que pinta la vitrina.
    static func catalogue(for t: BadgeTally) -> [BadgeSlot] {
        badgeFamilies.map { f in
            let n = f.count(t)
            return BadgeSlot(family: f.key,
                             tier: tier(f, n)?.rawValue,
                             progress: n,
                             threshold: f.thresholds.first { $0 > n } ?? f.thresholds[f.thresholds.count - 1],
                             thresholds: f.thresholds)
        }
    }

    /// Solo las conseguidas. Lo usan el marcador y los comandos.
    static func badges(for t: BadgeTally) -> [BadgeAward] {
        badgeFamilies.compactMap { f in
            let n = f.count(t)
            guard let grado = tier(f, n) else { return nil }
            return BadgeAward(key: f.key, name: f.name, tier: grado, progress: n,
                              threshold: f.thresholds.first { $0 > n } ?? f.thresholds[f.thresholds.count - 1])
        }
    }

    /// Vista de demostración: todas las familias en su grado máximo, sin fabricar
    /// aportaciones ni tocar el total de gotas de la cuenta.
    static func allBadgesUnlocked() -> ([BadgeAward], [BadgeSlot]) {
        let awards = badgeFamilies.map { f in
            BadgeAward(key: f.key, name: f.name, tier: f.unique ? .unique : .gold,
                       progress: f.thresholds.last!, threshold: f.thresholds.last!)
        }
        let slots = badgeFamilies.map { f in
            BadgeSlot(family: f.key, tier: (f.unique ? Tier.unique : Tier.gold).rawValue,
                      progress: f.thresholds.last!, threshold: f.thresholds.last!,
                      thresholds: f.thresholds)
        }
        return (awards, slots)
    }

    static func isSummer(_ d: Date) -> Bool {
        (6...9).contains(Calendar(identifier: .gregorian).component(.month, from: d))
    }

    /// Clave de día UTC: la misma frontera temporal que usan rankings y liquidaciones.
    static func utcDay(_ d: Date) -> String {
        let c = ZoneStats.utcCalendar.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Número de jornadas que pueden llamarse ruta: tres fuentes distintas o más.
    static func routeDays(from visits: [(fontID: UUID, at: Date)], minimumFonts: Int = 3) -> Int {
        var byDay: [String: Set<UUID>] = [:]
        for visit in visits { byDay[utcDay(visit.at), default: []].insert(visit.fontID) }
        return byDay.values.count { $0.count >= minimumFonts }
    }

    private static func badges(for mias: [Contribution], regions: Set<String>,
                               fontsByID: [UUID: Font]) -> [BadgeAward] {
        var t = BadgeTally()
        t.regions = regions
        for c in mias {
            if let country = fontsByID[c.fontID]?.country { t.countries.insert(country) }
            switch c.kind {
            case .fontCreated: t.fontsCreated += 1
            case .firstPhoto: t.firstPhotos += 1
            case .relocation, .fieldCompleted: t.mapFixes += 1
            case .updateReview where c.base >= 50: t.sentinelUpdates += 1
            case .confirmation: t.verifications += 1
            default: break
            }
            if (c.kind == .firstReview || c.kind == .updateReview) && isSummer(c.at) { t.summerReviews += 1 }
            if c.kind == .firstReview && fontsByID[c.fontID]?.$creator.id == nil { t.pioneer = true }
        }
        t.fourSeasonFonts = fourSeasonFonts(from: mias
            .filter { $0.kind == .firstReview || $0.kind == .updateReview }
            .map { (fontID: $0.fontID, at: $0.at) })
        let reviews = mias.filter { $0.kind == .firstReview || $0.kind == .updateReview }
        t.routeDays = routeDays(from: reviews.map { (fontID: $0.fontID, at: $0.at) })
        t.activeDays = Set(mias.map { utcDay($0.at) }).count
        t.reunions = mias.count { $0.kind == .updateReview && $0.base >= 70 }
        t.teamworkFountains = Set(mias.compactMap { c -> UUID? in
            guard c.kind != .fontCreated, let f = fontsByID[c.fontID],
                  let creator = f.$creator.id, creator != c.userID,
                  let created = f.createdAt,
                  c.at >= created, c.at.timeIntervalSince(created) <= 30 * 86_400
            else { return nil }
            return c.fontID
        }).count
        return badges(for: t)
    }
}
