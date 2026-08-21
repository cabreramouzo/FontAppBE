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
    let createdAt: Date?
    let lastWaterStatus: String?
    let lastUpdate: Date?

    init(_ font: Font, lastWaterStatus: String?, lastUpdate: Date?) {
        self.id = font.id
        self.name = font.name
        self.latitude = font.latitude
        self.longitude = font.longitude
        self.image = font.image
        self.description = font.description
        self.source = font.source
        self.drinkable = font.drinkable
        self.createdAt = font.createdAt
        self.lastWaterStatus = lastWaterStatus
        self.lastUpdate = lastUpdate
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
        var lastConfirm: [UUID: Date] = [:]
        if !statusCommentIDs.isEmpty {
            let confs = try await FontConfirmation.query(on: db)
                .filter(\.$comment.$id ~~ statusCommentIDs)
                .all()
            for c in confs {
                let cid = c.$comment.id
                if let d = c.createdAt, lastConfirm[cid] == nil || d > lastConfirm[cid]! {
                    lastConfirm[cid] = d
                }
            }
        }

        return fonts.map { font in
            guard let l = font.id.flatMap({ latest[$0] }) else {
                return FontSummary(font, lastWaterStatus: nil, lastUpdate: nil)
            }
            // La frescura es la fecha más reciente entre el comentario y su última confirmación.
            let confDate = l.commentID.flatMap { lastConfirm[$0] }
            let freshest = [l.date, confDate].compactMap { $0 }.max()
            return FontSummary(font, lastWaterStatus: l.status, lastUpdate: freshest)
        }
    }
}
