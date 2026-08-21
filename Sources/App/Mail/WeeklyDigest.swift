import Fluent
import Foundation
import Vapor

/// Datos del resumen semanal de UN usuario. Lo calcula `build(for:since:on:)` y lo
/// pinta `WeeklyDigestEmail`. Separado del envío para poder probarlo y para que el
/// comando pueda hacer un ensayo en seco sin tocar el proveedor de correo.
struct WeeklyDigest {
    /// Aportaciones propias de la semana (los números de la cabecera).
    var fontsAdded: Int = 0
    var statusesConfirmed: Int = 0

    /// Novedad de otra persona en una fuente "tuya" (creada por ti o reseñada por ti).
    struct Activity {
        enum Kind { case comment, report, edit }
        let kind: Kind
        let fontID: UUID
        /// `nil` si la fuente no tiene nombre propio; lo rotula la plantilla, que sabe
        /// en qué idioma escribe. Ver `Font.name`.
        let fontName: String?
        /// Estado del agua que dejó la reseña (para el distintivo de color), si lo indicó.
        let waterStatus: String?
        /// Texto de la reseña / incidencia. En una edición no hay texto.
        let body: String?
        let author: String
        let createdAt: Date
    }

    /// Fuente nueva de otra persona cerca de las tuyas.
    struct Nearby {
        let id: UUID
        let name: String?
        let source: WaterSource?
        let region: String?
        let author: String
    }

    var activity: [Activity] = []
    var nearby: [Nearby] = []

    /// Cobertura de la zona donde más aporta esta persona. Fase 5: «cómo va tu demarcación»
    /// es mejor correo que «has hecho 340 puntos», porque habla de un sitio de verdad y
    /// no del contador de nadie.
    var zone: ZoneStats.Coverage?

    /// ¿Merece la pena mandar el correo? Un resumen sin novedades solo enseña a
    /// ignorarlo, así que si no ha pasado nada NO se envía.
    ///
    /// La cobertura de zona **no cuenta** para esto a propósito: se mueve de mes en mes,
    /// no de semana en semana, y un correo semanal cuya única novedad es un número que
    /// no ha cambiado es exactamente el correo que se aprende a ignorar. Viaja de
    /// acompañante cuando ya hay algo que contar.
    var isWorthSending: Bool { !activity.isEmpty || !nearby.isEmpty }

    var newsCount: Int { activity.count + nearby.count }

    /// Radio alrededor de las fuentes del usuario para "nuevas fuentes cerca".
    static let nearbyRadiusKm = 25.0
    /// Topes para que el correo no se convierta en un listado infinito.
    static let maxActivity = 8
    static let maxNearby = 6

    // MARK: - Cálculo

    static func build(for user: User, since: Date, on db: any Database) async throws -> WeeklyDigest {
        let userID = try user.requireID()
        var digest = WeeklyDigest()

        // --- Fuentes "tuyas": las que creaste + aquellas en las que has dejado reseña.
        let createdFontIDs = try await Font.query(on: db)
            .filter(\.$creator.$id == userID)
            .all(\.$id)
        let commentedFontIDs = try await FontComment.query(on: db)
            .filter(\.$user.$id == userID)
            .all()
            .map { $0.$font.id }
        let myFontIDs = Array(Set(createdFontIDs + commentedFontIDs))

        // --- Números de la cabecera (lo que aportaste TÚ esta semana).
        digest.fontsAdded = try await Font.query(on: db)
            .filter(\.$creator.$id == userID)
            .filter(\.$createdAt >= since)
            .count()
        digest.statusesConfirmed = try await FontComment.query(on: db)
            .filter(\.$user.$id == userID)
            .filter(\.$createdAt >= since)
            .filter(\.$waterStatus != nil)
            .count()

        guard !myFontIDs.isEmpty else { return digest }

        // Nombres de las fuentes implicadas, en una query (nada de N+1).
        let myFonts = try await Font.query(on: db).filter(\.$id ~~ myFontIDs).all()
        // Las que no tienen nombre propio se quedan fuera y por tanto se leen como `nil`.
        // El `guard` de abajo ya NO puede usar este diccionario para filtrar: las fuentes
        // en juego vienen todas de `myFontIDs`, así que el filtro ya está hecho — y si se
        // usara, una fuente sin nombre desaparecería del resumen.
        let fontNames = Dictionary(uniqueKeysWithValues: myFonts.compactMap { f -> (UUID, String)? in
            guard let id = f.id, let n = f.name else { return nil }
            return (id, n)
        })

        // --- Actividad AJENA en tus fuentes: reseñas, incidencias y ediciones.
        let comments = try await FontComment.query(on: db)
            .filter(\.$font.$id ~~ myFontIDs)
            .filter(\.$createdAt >= since)
            .filter(\.$user.$id != userID)
            .sort(\.$createdAt, .descending)
            .all()
        let reports = try await FontReport.query(on: db)
            .filter(\.$font.$id ~~ myFontIDs)
            .filter(\.$createdAt >= since)
            .filter(\.$user.$id != userID)
            .sort(\.$createdAt, .descending)
            .all()
        let edits = try await FontEdit.query(on: db)
            .filter(\.$font.$id ~~ myFontIDs)
            .filter(\.$createdAt >= since)
            .filter(\.$editor.$id != userID)
            .sort(\.$createdAt, .descending)
            .all()

        // Autores de todo lo anterior, en una sola query.
        let authorIDs = comments.compactMap { $0.$user.id } + reports.compactMap { $0.$user.id } + edits.compactMap { $0.$editor.id }
        let authors = try await User.usernames(for: authorIDs, on: db)
        // Quien borró su cuenta aparece como anónimo, no con su nombre.
        func author(_ id: UUID?) -> String { id.flatMap { authors[$0] } ?? "anònim" }

        var items: [Activity] = []
        for c in comments {
            guard let date = c.createdAt else { continue }
            items.append(.init(kind: .comment, fontID: c.$font.id, fontName: fontNames[c.$font.id],
                               waterStatus: c.waterStatus, body: c.body, author: author(c.$user.id), createdAt: date))
        }
        for r in reports {
            guard let date = r.createdAt else { continue }
            items.append(.init(kind: .report, fontID: r.$font.id, fontName: fontNames[r.$font.id],
                               waterStatus: nil, body: r.message, author: author(r.$user.id), createdAt: date))
        }
        for e in edits {
            guard let date = e.createdAt else { continue }
            items.append(.init(kind: .edit, fontID: e.$font.id, fontName: fontNames[e.$font.id],
                               waterStatus: nil, body: nil, author: author(e.$editor.id), createdAt: date))
        }
        digest.activity = Array(items.sorted { $0.createdAt > $1.createdAt }.prefix(maxActivity))

        // --- Fuentes nuevas cerca de las tuyas. Caja envolvente alrededor de TODAS tus
        // fuentes (una query) y después el filtro fino por distancia real, igual que la
        // búsqueda por cercanía del mapa.
        let lats = myFonts.map(\.latitude), lons = myFonts.map(\.longitude)
        if let minLat = lats.min(), let maxLat = lats.max(), let minLon = lons.min(), let maxLon = lons.max() {
            let dLat = nearbyRadiusKm / 111.0
            let dLon = nearbyRadiusKm / (111.0 * max(cos(((minLat + maxLat) / 2) * .pi / 180), 0.01))
            let candidates = try await Font.query(on: db)
                .filter(\.$createdAt >= since)
                .filter(\.$latitude >= minLat - dLat).filter(\.$latitude <= maxLat + dLat)
                .filter(\.$longitude >= minLon - dLon).filter(\.$longitude <= maxLon + dLon)
                .filter(\.$creator.$id != userID)
                // Puesta por alguien, no por un importador: si no, un lote nuevo llena el
                // correo de «fuentes nuevas cerca» firmadas por nadie.
                .filter(\.$creator.$id != nil)
                .sort(\.$createdAt, .descending)
                .all()
            let mine = Set(myFontIDs)
            let near = candidates.filter { candidate in
                guard let id = candidate.id, !mine.contains(id) else { return false }
                return myFonts.contains { haversineKm($0.latitude, $0.longitude, candidate.latitude, candidate.longitude) <= nearbyRadiusKm }
            }
            let nearbyAuthors = try await User.usernames(for: near.compactMap { $0.$creator.id }, on: db)
            digest.nearby = near.prefix(maxNearby).compactMap { f in
                f.id.map { Nearby(id: $0, name: f.name, source: f.source, region: f.region,
                                  author: f.$creator.id.flatMap { nearbyAuthors[$0] } ?? "anònim") }
            }
        }

        // --- Tu zona. La «tuya» es donde más has aportado y no la del registro: mucha
        // gente se registró desde el sofá de una ciudad y aporta en otra demarcación, y la
        // barra tiene que hablar del sitio donde de verdad camina.
        if let region = dominantRegion(of: myFonts) {
            digest.zone = try await ZoneStats.coverage(ofRegion: region, on: db)
        }

        return digest
    }

    /// La región más repetida entre las fuentes de esta persona, o `nil` si ninguna está
    /// clasificada. Los empates se rompen por nombre para que el correo de una semana a
    /// otra no cambie de demarcación sin motivo.
    static func dominantRegion(of fonts: [Font]) -> String? {
        var cuenta: [String: Int] = [:]
        for f in fonts {
            guard let r = f.region, !r.isEmpty else { continue }
            cuenta[r, default: 0] += 1
        }
        return cuenta.sorted { ($0.value, $1.key) > ($1.value, $0.key) }.first?.key
    }
}
