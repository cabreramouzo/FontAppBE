import Fluent
import SQLKit
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
    /// El último parte, identificado y con SU propia fecha. Es lo que permite al globo del
    /// mapa confirmar en vez de crear una reseña repetida cuando tocas el chip que dice lo
    /// mismo que ya consta. Ver `ClusteredMarkers`.
    ///
    /// La fecha va aparte de `lastUpdate` y no se puede reutilizar aquella: `lastUpdate` es
    /// la más fresca entre el parte y sus confirmaciones, mientras que la curva de frescura
    /// del baremo mide **desde la reseña anterior** (`freshness(daysSincePrevious:)`, que
    /// solo mira fechas de reseña). Con `lastUpdate` una fuente reseñada hace un año y
    /// confirmada ayer parecería fresca, y cambiaríamos por 10 gotas una reseña que paga 60.
    let lastCommentID: UUID?
    let lastReportAt: Date?

    init(_ font: Font, lastWaterStatus: String?, lastUpdate: Date?, latestConfirmations: Int = 0,
         recentStatusReporters: Int = 0, recentStatusConflict: Bool = false,
         lastCommentID: UUID? = nil, lastReportAt: Date? = nil) {
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
        self.lastCommentID = lastCommentID
        self.lastReportAt = lastReportAt
    }

    /// Construcción directa desde la consulta compacta del mapa. Evita materializar
    /// modelos Fluent de reseñas y confirmaciones que solo se usan para resumirlas.
    fileprivate init(row: any SQLRow) throws {
        self.id = try row.decode(column: "id", as: UUID.self)
        self.name = try row.decode(column: "name", as: String?.self)
        self.latitude = try row.decode(column: "latitude", as: Double.self)
        self.longitude = try row.decode(column: "longitude", as: Double.self)
        self.image = try row.decode(column: "image", as: String?.self)
        self.description = try row.decode(column: "description", as: String?.self)
        let source = try row.decode(column: "source", as: String?.self)
        self.source = source.flatMap(WaterSource.init(rawValue:))
        let drinkable = try row.decode(column: "drinkable", as: String?.self)
        self.drinkable = drinkable.flatMap(Drinkable.init(rawValue:))
        self.country = try row.decode(column: "country", as: String?.self)
        self.region = try row.decode(column: "region", as: String?.self)
        self.admin1 = try row.decode(column: "admin1", as: String?.self)
        self.createdAt = try row.decode(column: "created_at", as: Date?.self)
        self.lastWaterStatus = try row.decode(column: "last_water_status", as: String?.self)
        self.lastUpdate = try row.decode(column: "last_update", as: Date?.self)
        self.latestConfirmations = Int(try row.decode(column: "latest_confirmations", as: Int64.self))
        self.recentStatusReporters = Int(try row.decode(column: "recent_status_reporters", as: Int64.self))
        self.recentStatusConflict = try row.decode(column: "recent_status_conflict", as: Bool.self)
        self.lastCommentID = try row.decode(column: "last_comment_id", as: UUID?.self)
        self.lastReportAt = try row.decode(column: "last_report_at", as: Date?.self)
    }
}

extension Font {
    /// Resumen de un conjunto de fuentes **a partir de sus ids**, en el orden pedido.
    ///
    /// Existe porque el mapa y `in-bounds` ya sacan los ids con su propia consulta y no
    /// necesitan los modelos: cargarlos era leer las mismas filas por tercera vez —una
    /// para los ids, otra para los `Font` de Fluent y otra dentro de este resumen— y
    /// dejar 3.000 modelos vivos en memoria sólo para extraerles el id. En un cambio que
    /// existe para no quedarse sin RAM, eso contaba doble.
    ///
    /// Una fuente sin fila (borrada entre las dos consultas) simplemente no sale: aquí no
    /// hay modelo con el que reponerla, al contrario que en `summaries(for:)`.
    static func summaries(forIDs ids: [UUID], on db: Database) async throws -> [FontSummary] {
        guard !ids.isEmpty else { return [] }
        guard let sql = db as? SQLDatabase else {
            let fonts = try await Font.query(on: db).filter(\.$id ~~ ids).all()
            return try await summaries(for: fonts, on: db)
        }
        let porID = try await sqlSummaries(ids: ids, on: sql)
        return ids.compactMap { porID[$0] }
    }

    /// Enriquece una lista de fuentes con el último estado del agua reportado.
    /// Una sola query de comentarios para todas (evita N+1).
    static func summaries(for fonts: [Font], on db: Database) async throws -> [FontSummary] {
        let ids = fonts.compactMap { $0.id }
        guard !ids.isEmpty else {
            return fonts.map { FontSummary($0, lastWaterStatus: nil, lastUpdate: nil) }
        }

        // Con SQL crudo no hace falta nada de los modelos que nos pasan salvo el id, así
        // que se resuelve por la misma puerta que `summaries(forIDs:)` y sólo se usan los
        // `Font` para reponer el orden y para las fuentes que la consulta no devuelva
        // (borradas entre las dos consultas). Quien ya llega con ids debería llamar
        // directamente a la otra y ahorrarse cargarlos.
        if let sql = db as? SQLDatabase {
            let porID = try await sqlSummaries(ids: ids, on: sql)
            return fonts.compactMap { font in
                guard let id = font.id else { return nil }
                return porID[id] ?? FontSummary(font, lastWaterStatus: nil, lastUpdate: nil)
            }
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
                               recentStatusConflict: families.count > 1,
                               lastCommentID: l.commentID, lastReportAt: l.date)
        }
    }

    /// El resumen agregado en PostgreSQL, indexado por id. Sin orden: lo pone quien llama.
    private static func sqlSummaries(ids: [UUID], on sql: SQLDatabase) async throws -> [UUID: FontSummary] {
        // PostgreSQL hace el trabajo de resumen y devuelve una fila por fuente. Antes se
        // cargaban en Swift TODAS las reseñas históricas de hasta 3.000 fuentes, se
        // agrupaban en diccionarios y después se cargaban sus confirmaciones. Con varias
        // peticiones de mapa simultáneas esos arrays sobrevivían a la vez y agotaban los
        // 512 MB de Fly. La consulta conserva exactamente las mismas reglas: último parte,
        // confirmaciones independientes y conflicto/autores distintos en 30 días.
        let rows = try await sql.raw("""
            WITH selected_fonts AS (
              SELECT id, name, latitude, longitude, image, description, source,
                     drinkable, country, region, admin1, created_at
              FROM fonts
              WHERE id = ANY(\(bind: ids))
            ), latest AS (
              SELECT DISTINCT ON (c.font_id)
                     c.font_id, c.id AS comment_id, c.user_id, c.water_status, c.created_at
              FROM font_comments c
              JOIN selected_fonts f ON f.id = c.font_id
              WHERE c.water_status IS NOT NULL
              ORDER BY c.font_id, c.created_at DESC
            ), confirmations AS (
              -- Corroboración y actualidad son cosas distintas, y aquí se separan:
              --  · `quantity` cuenta SOLO las ajenas. Nadie se da la razón a sí mismo, y
              --    de esto depende que una fuente llegue a «confirmada».
              --  · `last_at` las cuenta TODAS. Que quien la reseñó haya vuelto a pasar y
              --    siga igual dice CUÁNDO se miró por última vez, que es justo lo que hace
              --    falta saber antes de desviarse tres kilómetros.
              SELECT l.font_id,
                     count(fc.id) FILTER (
                       WHERE l.user_id IS NULL OR fc.user_id <> l.user_id
                     )::bigint AS quantity,
                     max(fc.created_at) AS last_at
              FROM latest l
              LEFT JOIN font_confirmations fc ON fc.comment_id = l.comment_id
              GROUP BY l.font_id
            ), recent AS (
              SELECT c.font_id,
                     count(DISTINCT c.user_id)::bigint AS reporters,
                     (bool_or(c.water_status IN ('flowing', 'trickle')) AND
                      bool_or(c.water_status IN ('dry', 'broken', 'gone'))) AS conflict
              FROM font_comments c
              JOIN selected_fonts f ON f.id = c.font_id
              WHERE c.created_at >= now() - interval '30 days'
                AND c.water_status IS NOT NULL
                AND c.water_status <> 'unknown'
              GROUP BY c.font_id
            )
            SELECT f.*,
                   l.water_status AS last_water_status,
                   greatest(l.created_at, cf.last_at) AS last_update,
                   coalesce(cf.quantity, 0)::bigint AS latest_confirmations,
                   coalesce(r.reporters, 0)::bigint AS recent_status_reporters,
                   coalesce(r.conflict, false) AS recent_status_conflict,
                   l.comment_id AS last_comment_id,
                   l.created_at AS last_report_at
            FROM selected_fonts f
            LEFT JOIN latest l ON l.font_id = f.id
            LEFT JOIN confirmations cf ON cf.font_id = f.id
            LEFT JOIN recent r ON r.font_id = f.id
            """).all()
        var porID = [UUID: FontSummary](minimumCapacity: rows.count)
        for row in rows {
        let summary = try FontSummary(row: row)
        if let id = summary.id { porID[id] = summary }
        }
        return porID
    }
}
