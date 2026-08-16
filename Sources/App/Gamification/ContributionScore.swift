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

    static let desertKm = 10.0
    static let doubtWindowDays = 90.0
    static let crowdedWindowDays = 30.0
    static let maxMultiplier = 1.5 * 1.4 * 1.5   // el techo de ×3 del documento, sin llegar

    // MARK: - Resultado

    struct Contribution: Sendable {
        let userID: UUID
        let kind: Kind
        let fontID: UUID
        let fontName: String
        let at: Date
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

    struct BadgeAward: Sendable {
        let family: String
        let tier: String        // bronce · plata · oro, o "única"
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
        var level: String
    }

    /// Niveles. En fase 1 son informativos: no desbloquean nada todavía.
    static let levels: [(name: String, from: Int)] = [
        ("Acuífero", 12_000), ("Río", 4_000), ("Arroyo", 1_200), ("Reguero", 300), ("Gota", 0),
    ]

    static func level(for gotes: Int) -> String {
        levels.first { gotes >= $0.from }?.name ?? "Gota"
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
                if !previas.isEmpty && !cerca { m *= 1.5; razones.append("desierto") }
            }
            if isWaterStatus {
                let mes = Calendar(identifier: .gregorian).component(.month, from: fecha)
                if (6...9).contains(mes) { m *= 1.4; razones.append("estiaje") }
            }
            if let incidencias = reportDates[fontID],
               incidencias.contains(where: { $0 < fecha && fecha.timeIntervalSince($0) <= doubtWindowDays * 86_400 }) {
                m *= 1.5; razones.append("dudosa")
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
                 base: Int? = nil, applyMultiplier: Bool = true, isWaterStatus: Bool = false,
                 note: String = "") {
            guard let userID, let fecha, let font = fontsByID[fontID] else { return }
            var m = 1.0
            var razones: [String] = []
            if applyMultiplier { (m, razones) = multiplier(fontID: fontID, at: fecha, isWaterStatus: isWaterStatus) }
            let nota = [note, razones.joined(separator: "+")].filter { !$0.isEmpty }.joined(separator: " · ")
            contribs.append(Contribution(userID: userID, kind: kind, fontID: fontID,
                                         fontName: font.name, at: fecha,
                                         base: base ?? kind.base, multiplier: m, note: nota,
                                         reasons: razones))
        }

        // --- Fuentes creadas ---------------------------------------------------
        for f in fonts {
            guard let id = f.id else { continue }
            add(f.$creator.id, .fontCreated, fontID: id, at: f.createdAt)
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
                    add(c.$user.id, .firstReview, fontID: fontID, at: fecha, isWaterStatus: tieneEstado)
                } else {
                    let dias = Int(fecha.timeIntervalSince(anterior!) / 86_400)
                    add(c.$user.id, .updateReview, fontID: fontID, at: fecha,
                        base: freshness(daysSincePrevious: dias), isWaterStatus: tieneEstado,
                        note: "\(dias) d sin visitas")
                }
                anterior = fecha
            }
        }

        // --- Fotos: primera vs sustitución -------------------------------------
        // `fonts.image` no guarda autor, así que la autoría se reconstruye con lo que sí
        // deja rastro: reseñas con foto y ediciones que tocaron el campo `image`.
        struct PhotoEvent { let userID: UUID?; let at: Date }
        var photoEvents: [UUID: [PhotoEvent]] = [:]
        for c in comments where c.image != nil {
            guard let d = c.createdAt else { continue }
            photoEvents[c.$font.id, default: []].append(PhotoEvent(userID: c.$user.id, at: d))
        }
        for e in edits where e.before.image != e.after.image && e.after.image != nil {
            guard let d = e.createdAt else { continue }
            photoEvents[e.$font.id, default: []].append(PhotoEvent(userID: e.$editor.id, at: d))
        }
        for (fontID, eventos) in photoEvents {
            for (i, ev) in eventos.sorted(by: { $0.at < $1.at }).enumerated() {
                add(ev.userID, i == 0 ? .firstPhoto : .photoReplaced, fontID: fontID, at: ev.at)
            }
        }
        let conFotoSinAutor = fonts.filter { $0.image != nil && photoEvents[$0.id ?? UUID()] == nil }.count
        if conFotoSinAutor > 0 {
            caveats.append("\(conFotoSinAutor) fuentes tienen foto sin rastro de quién la puso (anteriores a que el snapshot guardara `image`): no las cobra nadie.")
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
                        applyMultiplier: false,
                        note: String(format: "%.0f m", haversineKm(la, lo, na, no) * 1000))
                }
                var completados: [String] = []
                if esVacia(e.before.description) && !esVacia(e.after.description) { completados.append("descripción") }
                if e.before.drinkable == nil && e.after.drinkable != nil { completados.append("potabilidad") }
                if e.before.source == nil && e.after.source != nil { completados.append("tipo") }
                for campo in completados {
                    add(e.$editor.id, .fieldCompleted, fontID: fontID, at: e.createdAt,
                        applyMultiplier: false, note: campo)
                }
            }
        }

        // --- Incidencias --------------------------------------------------------
        for r in reports {
            add(r.$user.id, .report, fontID: r.$font.id, at: r.createdAt, applyMultiplier: false)
        }

        // --- Confirmaciones -----------------------------------------------------
        var autoConfirmaciones = 0
        for c in confirmations {
            guard let comentario = commentsByID[c.$comment.id] else { continue }
            if comentario.$user.id == c.$user.id { autoConfirmaciones += 1; continue }
            add(c.$user.id, .confirmation, fontID: comentario.$font.id, at: c.createdAt,
                applyMultiplier: false)
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
                badges: badges(for: mias, regions: regiones, fontsByID: fontsByID, comments: comments),
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

    private static func badges(for mias: [Contribution], regions: Set<String>,
                               fontsByID: [UUID: Font], comments: [FontComment]) -> [BadgeAward] {
        func tier(_ n: Int, _ t: [Int]) -> String? {
            if n >= t[2] { return "oro" }
            if n >= t[1] { return "plata" }
            if n >= t[0] { return "bronce" }
            return nil
        }
        func award(_ familia: String, _ n: Int, _ t: [Int]) -> BadgeAward? {
            guard let grado = tier(n, t) else { return nil }
            let siguiente = t.first { $0 > n } ?? t[2]
            return BadgeAward(family: familia, tier: grado, progress: n, threshold: siguiente)
        }

        let creadas = mias.filter { $0.kind == .fontCreated }.count
        let primerasFotos = mias.filter { $0.kind == .firstPhoto }.count
        let centinela = mias.filter { $0.kind == .updateReview && $0.base >= 50 }.count
        let cartografia = mias.filter { $0.kind == .relocation || $0.kind == .fieldCompleted }.count
        let estiaje = mias.filter {
            guard $0.kind == .firstReview || $0.kind == .updateReview else { return false }
            let mes = Calendar(identifier: .gregorian).component(.month, from: $0.at)
            return (6...9).contains(mes)
        }.count

        var out: [BadgeAward] = []
        out += [award("Descubridora", creadas, [10, 50, 200])].compactMap { $0 }
        out += [award("Primera luz", primerasFotos, [5, 25, 100])].compactMap { $0 }
        out += [award("Centinela", centinela, [15, 60, 250])].compactMap { $0 }
        out += [award("Cartógrafa", cartografia, [10, 40, 150])].compactMap { $0 }
        out += [award("Comarcas", regions.count, [3, 8, 20])].compactMap { $0 }
        out += [award("Estiaje", estiaje, [10, 40, 120])].compactMap { $0 }

        // Pionera: primera reseña de una fuente importada (sin creador). Es la insignia
        // que mide exactamente lo que le falta al mapa.
        let pionera = mias.contains { $0.kind == .firstReview && fontsByID[$0.fontID]?.$creator.id == nil }
        if pionera { out.append(BadgeAward(family: "Pionera", tier: "única", progress: 1, threshold: 1)) }

        return out
    }
}
