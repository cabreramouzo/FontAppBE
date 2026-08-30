import Fluent
import Foundation
import SQLKit
import Vapor

/// El inventario de fuentes de un municipio: cuántas hay, de qué tipo y qué se sabe de
/// ellas.
///
/// Vive aparte porque tiene **dos llamadores** y tienen que decir exactamente lo mismo:
/// el comando `municipal-report`, que escribe el informe que se enseña en una reunión, y
/// `GET /municipalities/:ine`, que pinta la página pública. Dos consultas parecidas se
/// separan al primer arreglo, y aquí eso significaría que el PDF que firma alguien y la
/// página que ese alguien abre en su móvil dan cifras distintas. Es el mismo motivo por
/// el que `ContributionLedger.sync()` la comparten el comando y el trabajador.
///
/// ## Lo que este informe NO afirma
///
/// - **No certifica potabilidad.** `drinkable` es lo que declara el origen del dato o
///   quien editó la ficha, y por eso se llama «declarada» en todas partes.
/// - **No promete estado.** La cobertura de estado de la base entera es del orden del
///   0,2 %, así que el informe dice cuántas están sin comprobar en voz alta en vez de
///   enseñar un cuadro de mandos vacío que parezca una avería.
struct MunicipalReport: Content, Sendable {
    /// Sin comprobar desde hace más de esto, en días. Es el corte de «Centinela» y el de
    /// la curva del baremo: tres cortes distintos para la misma idea serían tres
    /// explicaciones distintas de por qué algo sale en rojo.
    static let olvidadaDias = 365

    struct Item: Content, Sendable {
        let id: UUID
        let name: String?
        let latitude: Double
        let longitude: Double
        let source: String?
        let drinkable: String?
        let hasPhoto: Bool
        let reviews: Int
        /// Último parte de estado, si alguien ha pasado alguna vez.
        let lastStatus: String?
        /// Días desde el último parte. `nil` = nadie ha pasado nunca.
        let days: Int?
        let openReports: Int
    }

    let municipality: String
    let ine: String
    /// Fuentes visibles. Las duplicadas y las retiradas van aparte: no son inventario,
    /// pero callarlas del todo haría que las cifras no cuadraran con el mapa.
    let fonts: Int
    let withPhoto: Int
    let byPeople: Int
    let hiddenDuplicates: Int
    let retired: Int
    let bySource: [String: Int]
    let byDrinkable: [String: Int]
    let checkedEver: Int
    let neverChecked: Int
    let staleOverYear: Int
    let openReports: Int
    let byLastStatus: [String: Int]
    let items: [Item]

    private struct Fila: Decodable {
        let id: UUID
        let name: String?
        let latitude: Double
        let longitude: Double
        let source: String?
        let drinkable: String?
        let image: String?
        let created_by: UUID?
        let last_status: String?
        let last_at: Date?
        let reviews: Int
        let open_reports: Int
        let municipality: String?
    }

    private struct Escondidas: Decodable { let duplicadas: Int; let retiradas: Int }

    /// El informe de un municipio, o `nil` si no tiene ninguna fuente visible.
    static func of(ine: String, on db: any Database, now: Date = Date()) async throws -> MunicipalReport? {
        guard let sql = db as? any SQLDatabase else { return nil }

        // Una sola consulta con todo lo que cuelga de cada fuente. Los `LEFT JOIN LATERAL`
        // evitan traerse el historial de reseñas: de cada fuente solo interesan la última
        // con estado y dos recuentos.
        let filas = try await sql.raw("""
            SELECT f.id, f.name, f.latitude, f.longitude, f.source, f.drinkable, f.image,
                   f.created_by, f.municipality,
                   ultima.water_status AS last_status, ultima.created_at AS last_at,
                   COALESCE(r.n, 0)::int AS reviews,
                   COALESCE(inc.n, 0)::int AS open_reports
            FROM fonts f
            LEFT JOIN LATERAL (
              SELECT c.water_status, c.created_at FROM font_comments c
              WHERE c.font_id = f.id AND c.water_status IS NOT NULL
              ORDER BY c.created_at DESC LIMIT 1
            ) ultima ON true
            LEFT JOIN LATERAL (
              SELECT count(*) AS n FROM font_comments c WHERE c.font_id = f.id
            ) r ON true
            LEFT JOIN LATERAL (
              SELECT count(*) AS n FROM font_reports fr
              WHERE fr.font_id = f.id AND fr.resolved_at IS NULL
            ) inc ON true
            WHERE f.municipality_ine = \(bind: ine)
              AND \(unsafeRaw: Font.visibleSQL)
            ORDER BY f.name NULLS LAST, f.id
            """).all(decoding: Fila.self)
        guard !filas.isEmpty else { return nil }

        let escondidas = try await sql.raw("""
            SELECT count(*) FILTER (WHERE duplicate_of IS NOT NULL)::int AS duplicadas,
                   count(*) FILTER (WHERE retired_at IS NOT NULL)::int AS retiradas
            FROM fonts WHERE municipality_ine = \(bind: ine)
            """).first(decoding: Escondidas.self) ?? Escondidas(duplicadas: 0, retiradas: 0)

        let dias: (Date?) -> Int? = { f in f.map { Int(now.timeIntervalSince($0) / 86_400) } }
        let items = filas.map {
            Item(id: $0.id, name: $0.name, latitude: $0.latitude, longitude: $0.longitude,
                 source: $0.source, drinkable: $0.drinkable, hasPhoto: $0.image != nil,
                 reviews: $0.reviews, lastStatus: $0.last_status, days: dias($0.last_at),
                 openReports: $0.open_reports)
        }

        func reparto(_ clave: (Fila) -> String?) -> [String: Int] {
            var r: [String: Int] = [:]
            for f in filas { r[clave(f) ?? "unknown", default: 0] += 1 }
            return r
        }

        return MunicipalReport(
            municipality: filas.first?.municipality ?? ine,
            ine: ine,
            fonts: filas.count,
            withPhoto: filas.filter { $0.image != nil }.count,
            byPeople: filas.filter { $0.created_by != nil }.count,
            hiddenDuplicates: escondidas.duplicadas,
            retired: escondidas.retiradas,
            bySource: reparto { $0.source },
            byDrinkable: reparto { $0.drinkable },
            checkedEver: filas.filter { $0.reviews > 0 }.count,
            neverChecked: filas.filter { $0.last_at == nil }.count,
            staleOverYear: items.filter { ($0.days ?? -1) >= olvidadaDias }.count,
            openReports: filas.filter { $0.open_reports > 0 }.count,
            byLastStatus: {
                var r: [String: Int] = [:]
                for f in filas { if let s = f.last_status { r[s, default: 0] += 1 } }
                return r
            }(),
            items: items
        )
    }

    /// Un municipio por nombre. Devuelve **todos** los candidatos: hay municipios que se
    /// llaman igual en provincias distintas, y elegir uno por su cuenta significaría
    /// entregarle a un ayuntamiento el inventario de otro. Quien llama decide qué hacer
    /// con el empate.
    struct Candidato: Content, Sendable { let municipality: String; let ine: String; let fonts: Int }

    static func candidates(name: String, on db: any Database) async throws -> [Candidato] {
        guard let sql = db as? any SQLDatabase else { return [] }
        struct Fila: Decodable { let municipality: String; let municipality_ine: String; let n: Int }
        let filas = try await sql.raw("""
            SELECT municipality, municipality_ine, count(*)::int AS n FROM fonts
            WHERE lower(municipality) = lower(\(bind: name.trimmingCharacters(in: .whitespaces)))
            GROUP BY 1, 2 ORDER BY 3 DESC
            """).all(decoding: Fila.self)
        return filas.map { Candidato(municipality: $0.municipality, ine: $0.municipality_ine, fonts: $0.n) }
    }
}
