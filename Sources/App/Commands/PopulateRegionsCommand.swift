import Fluent
import Foundation
import SQLKit
import Vapor

/// Rellena `country` y `region` de las fuentes a partir de sus coordenadas, usando
/// un fichero **offline** de fronteras administrativas (GeoJSON de polígonos), sin
/// llamadas a terceros. `region` = **primera división administrativa** del país
/// (comunidad autónoma en España, région en Francia, Land en Alemania, distrito en
/// Portugal…), una semántica consistente en todo el mundo.
///
/// Uso: `swift run App populate-regions <fronteras.geojson> [--all]
///       [--country-field admin] [--region-field name]`
///
/// Dataset recomendado (global, una sola descarga): **Natural Earth 1:10m Admin 1 –
/// States, Provinces** en GeoJSON (`ne_10m_admin_1_states_provinces`). De cada feature
/// se leen dos PROPIEDADES del GeoJSON (no son "administradores": es cómo Natural Earth
/// nombró los campos): `"admin"` = nombre del país, `"name"` = primera división. Si usas
/// GADM nivel 1, esas propiedades se llaman `NAME_0`/`NAME_1`, pasa
/// `--country-field NAME_0 --region-field NAME_1`.
///
/// - `--all`: reprocesa TODAS las fuentes. Por defecto solo las que aún no tienen región.
struct PopulateRegionsCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Argument(name: "file", help: "GeoJSON de fronteras (polígonos de la 1ª división administrativa)")
        var file: String
        @Flag(name: "all", help: "Reprocesa todas las fuentes (por defecto, solo las que no tienen región)")
        var all: Bool
        @Option(name: "country-field", help: "Propiedad con el nombre del país (por defecto autodetecta admin/NAME_0/country)")
        var countryField: String?
        @Option(name: "region-field", help: "Propiedad con el nombre de la región (por defecto autodetecta name/NAME_1)")
        var regionField: String?
    }

    var help: String { "Rellena país/región de las fuentes por point-in-polygon contra un GeoJSON offline de fronteras" }

    func run(using context: CommandContext, signature: Signature) async throws {
        let db = context.application.db

        // --- Parsear el GeoJSON de fronteras (polígonos) con JSONSerialization: la
        // anidación de coordenadas varía (Polygon vs MultiPolygon) y así es más simple. ---
        let data = try Data(contentsOf: URL(fileURLWithPath: signature.file))
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rawFeatures = root["features"] as? [[String: Any]] else {
            context.console.error("El fichero no es un GeoJSON FeatureCollection válido.")
            return
        }

        let countryKeys = ([signature.countryField].compactMap { $0 }) + ["admin", "NAME_0", "country", "COUNTRY", "sovereignt"]
        let regionKeys = ([signature.regionField].compactMap { $0 }) + ["name", "NAME_1", "name_en", "region", "gn_name"]

        var regions: [Boundary] = []
        for feature in rawFeatures {
            guard let geom = feature["geometry"] as? [String: Any],
                  let type = geom["type"] as? String,
                  let coords = geom["coordinates"] else { continue }
            let props = feature["properties"] as? [String: Any] ?? [:]
            let country = Self.firstString(props, keys: countryKeys)
            let region = Self.firstString(props, keys: regionKeys)
            guard let country, let region else { continue }
            let polys = Self.polygons(from: coords, type: type)
            guard !polys.isEmpty else { continue }
            regions.append(Boundary(country: country, region: region, polygons: polys))
        }
        context.console.info("Fronteras cargadas: \(regions.count) (de \(rawFeatures.count) features).")
        guard !regions.isEmpty else {
            context.console.error("No se extrajo ninguna frontera; revisa --country-field/--region-field.")
            return
        }

        // --- Fuentes objetivo (todas, o solo las que aún no tienen región). ---
        let query = Font.query(on: db)
        if !signature.all { query.filter(\.$region == nil) }
        let fonts = try await query.all()
        context.console.info("Fuentes a procesar: \(fonts.count)\(signature.all ? " (todas)" : " (sin región)").")

        // --- Point-in-polygon: agrupamos por (país, región) para actualizar en bloque. ---
        var groups: [BoundaryKey: [UUID]] = [:]
        var matched = 0
        var unmatched = 0
        for font in fonts {
            guard let id = font.id else { continue }
            if let hit = regions.first(where: { $0.contains(lon: font.longitude, lat: font.latitude) }) {
                groups[BoundaryKey(country: hit.country, region: hit.region), default: []].append(id)
                matched += 1
            } else {
                unmatched += 1
            }
        }

        // --- Persistir: un UPDATE por grupo (WHERE id = ANY(...)), o Fluent si no hay SQL. ---
        if let sql = db as? SQLDatabase {
            for (key, ids) in groups {
                try await sql.raw("""
                    UPDATE fonts SET country = \(bind: key.country), region = \(bind: key.region)
                    WHERE id = ANY(\(bind: ids))
                    """).run()
            }
        } else {
            for font in fonts {
                guard let id = font.id else { continue }
                if let key = groups.first(where: { $0.value.contains(id) })?.key {
                    font.country = key.country
                    font.region = key.region
                    try await font.save(on: db)
                }
            }
        }

        context.console.info("Actualizadas \(matched) fuentes · \(unmatched) sin región (fuera de cualquier polígono).")
        // Resumen por zona, para verificar la granularidad de un vistazo.
        let summary = groups.map { ($0.key, $0.value.count) }.sorted { $0.1 > $1.1 }
        context.console.info("Regiones encontradas (\(summary.count)):")
        for (key, count) in summary.prefix(60) {
            context.console.info("  \(key.country) / \(key.region): \(count)")
        }
    }

    /// Primer valor de texto no vacío entre varias claves candidatas de `properties`.
    private static func firstString(_ props: [String: Any], keys: [String]) -> String? {
        for k in keys {
            if let s = props[k] as? String, !s.trimmingCharacters(in: .whitespaces).isEmpty { return s }
        }
        return nil
    }

    /// Normaliza las coordenadas de un Polygon/MultiPolygon a `[polígono][anillo][(lon,lat)]`.
    private static func polygons(from coords: Any, type: String) -> [[[Point]]] {
        func ring(_ any: Any) -> [Point] {
            (any as? [Any])?.compactMap { p -> Point? in
                guard let pair = p as? [Any], pair.count >= 2,
                      let lon = (pair[0] as? NSNumber)?.doubleValue,
                      let lat = (pair[1] as? NSNumber)?.doubleValue else { return nil }
                return Point(lon: lon, lat: lat)
            } ?? []
        }
        func polygon(_ any: Any) -> [[Point]] {
            (any as? [Any])?.map { ring($0) } ?? []
        }
        switch type {
        case "Polygon":
            return [polygon(coords)]
        case "MultiPolygon":
            return (coords as? [Any])?.map { polygon($0) } ?? []
        default:
            return []
        }
    }
}

private struct Point { let lon: Double; let lat: Double }

private struct BoundaryKey: Hashable { let country: String; let region: String }

/// Una región con sus polígonos y su bounding box (para descartar rápido).
private struct Boundary {
    let country: String
    let region: String
    let polygons: [[[Point]]] // [polígono][anillo][punto]
    let minLon: Double, minLat: Double, maxLon: Double, maxLat: Double

    init(country: String, region: String, polygons: [[[Point]]]) {
        self.country = country
        self.region = region
        self.polygons = polygons
        var minLon = Double.greatestFiniteMagnitude, minLat = Double.greatestFiniteMagnitude
        var maxLon = -Double.greatestFiniteMagnitude, maxLat = -Double.greatestFiniteMagnitude
        for poly in polygons {
            for ring in poly {
                for p in ring {
                    minLon = min(minLon, p.lon); maxLon = max(maxLon, p.lon)
                    minLat = min(minLat, p.lat); maxLat = max(maxLat, p.lat)
                }
            }
        }
        self.minLon = minLon; self.minLat = minLat; self.maxLon = maxLon; self.maxLat = maxLat
    }

    /// ¿El punto cae dentro de esta región? Prefiltro por bbox y luego ray casting:
    /// dentro de un polígono = dentro de su anillo exterior y fuera de sus huecos.
    func contains(lon: Double, lat: Double) -> Bool {
        guard lon >= minLon, lon <= maxLon, lat >= minLat, lat <= maxLat else { return false }
        for poly in polygons where !poly.isEmpty {
            if Self.inRing(lon: lon, lat: lat, ring: poly[0]) {
                // ¿Está en algún hueco? Entonces no cuenta.
                let inHole = poly.dropFirst().contains { Self.inRing(lon: lon, lat: lat, ring: $0) }
                if !inHole { return true }
            }
        }
        return false
    }

    /// Ray casting estándar sobre un anillo (x = lon, y = lat).
    private static func inRing(lon x: Double, lat y: Double, ring: [Point]) -> Bool {
        guard ring.count > 2 else { return false }
        var inside = false
        var j = ring.count - 1
        for i in 0..<ring.count {
            let xi = ring[i].lon, yi = ring[i].lat
            let xj = ring[j].lon, yj = ring[j].lat
            if ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
                inside.toggle()
            }
            j = i
        }
        return inside
    }
}
