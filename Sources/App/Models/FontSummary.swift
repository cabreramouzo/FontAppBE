import Fluent
import Vapor

/// Fuente + resumen del último estado del agua reportado. Para el listado del mapa,
/// de modo que el popup pueda mostrar el estado sin abrir el detalle.
struct FontSummary: Content {
    let id: UUID?
    /// `nil` si la fuente no tiene nombre propio. El rótulo lo compone el cliente con
    /// `source` y su idioma; ver `Font.name`.
    let name: String?
    let latitude: Double
    let longitude: Double
    let image: String?
    let description: String?
    let source: WaterSource?
    let drinkable: Drinkable?
    let country: String?
    let region: String?
    let admin1: String?
    let createdAt: Date?
    let lastWaterStatus: String?
    let lastUpdate: Date?
    /// Apoyos independientes al último parte y partes de los últimos 30 días. Permiten
    /// explicar confianza sin mandar todas las reseñas al mapa.
    let latestConfirmations: Int
    let recentStatusReporters: Int
    let recentStatusConflict: Bool

    init(_ font: Font, lastWaterStatus: String?, lastUpdate: Date?, latestConfirmations: Int = 0,
         recentStatusReporters: Int = 0, recentStatusConflict: Bool = false) {
        self.id = font.id
        self.name = font.name
        self.latitude = font.latitude
        self.longitude = font.longitude
        self.image = font.image
        self.description = font.description
        self.source = font.source
        self.drinkable = font.drinkable
        self.country = font.country
        self.region = font.region
        self.admin1 = font.admin1
        self.createdAt = font.createdAt
        self.lastWaterStatus = lastWaterStatus
        self.lastUpdate = lastUpdate
        self.latestConfirmations = latestConfirmations
        self.recentStatusReporters = recentStatusReporters
        self.recentStatusConflict = recentStatusConflict
    }
}

extension Font {
    /// Enriquece una lista de fuentes con el último estado del agua reportado.
    /// Una sola query de comentarios para todas (evita N+1).
    static func summaries(for fonts: [Font], on db: Database) async throws -> [FontSummary] {
        let ids = fonts.compactMap { $0.id }
        guard !ids.isEmpty else {
            return fonts.map { FontSummary($0, lastWaterStatus: nil, lastUpdate: nil) }
        }

        let comments = try await FontComment.query(on: db)
            .filter(\.$font.$id ~~ ids)
            .sort(\.$createdAt, .descending)
            .all()

        // Primer comentario (más reciente) con estado de agua por cada fuente.
        var latest: [UUID: (commentID: UUID?, status: String, date: Date?)] = [:]
        for c in comments {
            let fid = c.$font.id
            if latest[fid] == nil, let status = c.waterStatus {
                latest[fid] = (c.id, status, c.createdAt)
            }
        }

        // Frescura: una confirmación ("sigue igual") también cuenta como actualización.
        // Tomamos la confirmación más reciente de cada comentario de estado (una query).
        let statusCommentIDs = latest.values.compactMap { $0.commentID }
        let authorByComment: [UUID: UUID] = Dictionary(uniqueKeysWithValues: comments.compactMap { comment -> (UUID, UUID)? in
            guard let id = comment.id, let userID = comment.$user.id else { return nil }
            return (id, userID)
        })
        var lastConfirm: [UUID: Date] = [:]
        var confirmationCounts: [UUID: Int] = [:]
        if !statusCommentIDs.isEmpty {
            let confs = try await FontConfirmation.query(on: db)
                .filter(\.$comment.$id ~~ statusCommentIDs)
                .all()
            for c in confs {
                let cid = c.$comment.id
                // Ignora también filas históricas creadas antes de prohibir que el autor
                // se confirmase a sí mismo.
                guard authorByComment[cid] != c.$user.id else { continue }
                confirmationCounts[cid, default: 0] += 1
                if let d = c.createdAt, lastConfirm[cid] == nil || d > lastConfirm[cid]! {
                    lastConfirm[cid] = d
                }
            }
        }

        let cutoff = Date().addingTimeInterval(-30 * 86_400)
        var recentByFont: [UUID: [FontComment]] = [:]
        for comment in comments where (comment.createdAt ?? .distantPast) >= cutoff
            && comment.waterStatus != nil && comment.waterStatus != "unknown" {
            recentByFont[comment.$font.id, default: []].append(comment)
        }

        return fonts.map { font in
            guard let fid = font.id, let l = latest[fid] else {
                return FontSummary(font, lastWaterStatus: nil, lastUpdate: nil)
            }
            // La frescura es la fecha más reciente entre el comentario y su última confirmación.
            let confDate = l.commentID.flatMap { lastConfirm[$0] }
            let freshest = [l.date, confDate].compactMap { $0 }.max()
            let recent = recentByFont[fid] ?? []
            // Fluye/poca agua cuentan como la misma afirmación. Seca, rota o retirada
            // contradicen esa afirmación; cambios antiguos no convierten el presente en
            // disputa porque solo miramos treinta días.
            func family(_ status: String?) -> String? {
                switch status {
                case "flowing", "trickle": return "water"
                case "dry", "broken", "gone": return "unavailable"
                default: return nil
                }
            }
            let families = Set(recent.compactMap { family($0.waterStatus) })
            let reporters = Set(recent.compactMap { $0.$user.id })
            return FontSummary(font, lastWaterStatus: l.status, lastUpdate: freshest,
                               latestConfirmations: l.commentID.flatMap { confirmationCounts[$0] } ?? 0,
                               recentStatusReporters: reporters.count,
                               recentStatusConflict: families.count > 1)
        }
    }
}
