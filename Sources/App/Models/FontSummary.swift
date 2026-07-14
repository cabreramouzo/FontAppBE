import Fluent
import Vapor

/// Fuente + resumen del último estado del agua reportado. Para el listado del mapa,
/// de modo que el popup pueda mostrar el estado sin abrir el detalle.
struct FontSummary: Content {
    let id: UUID?
    let name: String
    let latitude: Double
    let longitude: Double
    let image: String?
    let description: String?
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
        var latest: [UUID: (status: String, date: Date?)] = [:]
        for c in comments {
            let fid = c.$font.id
            if latest[fid] == nil, let status = c.waterStatus {
                latest[fid] = (status, c.createdAt)
            }
        }

        return fonts.map { font in
            let l = font.id.flatMap { latest[$0] }
            return FontSummary(font, lastWaterStatus: l?.status, lastUpdate: l?.date)
        }
    }
}
