import Fluent
import Foundation
import Vapor

/// Importa fuentes desde un **GeoJSON** (FeatureCollection de puntos) en WGS84
/// (EPSG:4326), pensado para datasets del ICGC/ACA (p. ej. CercaFonts) ya
/// reproyectados a lat/lon con QGIS/ogr2ogr.
///
/// Uso: `swift run App import-geojson <fichero.geojson> [--replace]
///       [--name-field nom] [--source spring] [--dedupe 50]`
///
/// - `--name-field`: propiedad de la que sacar el nombre (por defecto prueba
///   `nom`, `name`, `NOM`, `toponim`, `TOPONIM`).
/// - `--source`: tipo de punto (`tap|spring|well|fountain|other`, por defecto `spring`).
/// - `--dedupe`: si se indica, salta puntos a < N metros de una fuente ya
///   existente. Por defecto **desactivado** (entran todos).
///
/// Datos del ICGC/ACA: licencia CC BY 4.0 → atribución "© ICGC (i ACA)".
struct ImportGeoJSONCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Argument(name: "file", help: "Ruta al GeoJSON (FeatureCollection de puntos, EPSG:4326)")
        var file: String
        @Flag(name: "replace", help: "Borra las fuentes existentes antes de importar")
        var replace: Bool
        @Option(name: "name-field", help: "Propiedad para el nombre (por defecto autodetecta nom/name/toponim)")
        var nameField: String?
        @Option(name: "source", help: "Tipo: tap|spring|well|fountain|other (por defecto spring)")
        var source: String?
        @Option(name: "dedupe", help: "Salta puntos a < N metros de una fuente existente (por defecto desactivado)")
        var dedupe: Double?
        @Option(name: "attribution", help: "Texto de atribución en la descripción (por defecto '© ICGC/ACA')")
        var attribution: String?
    }

    var help: String { "Importa fuentes desde un GeoJSON de puntos en WGS84 (ICGC/ACA, CC BY 4.0)" }

    func run(using context: CommandContext, signature: Signature) async throws {
        let db = context.application.db

        let data = try Data(contentsOf: URL(fileURLWithPath: signature.file))
        let collection = try JSONDecoder().decode(GeoJSONFeatureCollection.self, from: data)

        let source = signature.source.flatMap(WaterSource.init(rawValue:)) ?? .spring
        let attribution = signature.attribution ?? "© ICGC/ACA"
        // Claves candidatas para el nombre (la explícita primero si se indica).
        let nameKeys = ([signature.nameField].compactMap { $0 }) + ["nom", "name", "NOM", "toponim", "TOPONIM", "topònim"]

        // Parsea features → tuplas (nombre, lat, lon), descartando geometrías no-punto.
        var points: [(name: String, lat: Double, lon: Double)] = []
        for feature in collection.features {
            guard feature.geometry?.type == "Point",
                  let coords = feature.geometry?.coordinates, coords.count >= 2 else { continue }
            let lon = coords[0], lat = coords[1] // GeoJSON es [lon, lat]
            let props = feature.properties ?? [:]
            let name = nameKeys.lazy.compactMap { props[$0]?.stringValue }
                .first { !$0.isEmpty } ?? "Font"
            points.append((name, lat, lon))
        }

        context.console.info("Features: \(collection.features.count) · puntos válidos: \(points.count)")

        if signature.replace {
            try await Font.query(on: db).delete()
            context.console.info("Fuentes existentes borradas (--replace).")
        }

        // Dedupe opcional: carga las fuentes existentes para comparar por proximidad.
        // Guardamos el modelo para poder mejorar su nombre si es genérico (ver abajo).
        var existing: [(lat: Double, lon: Double, font: Font?)] = []
        if let dedupeMeters = signature.dedupe {
            existing = try await Font.query(on: db).all().map { ($0.latitude, $0.longitude, $0) }
            context.console.info("Dedupe activado a \(Int(dedupeMeters)) m (fuentes existentes: \(existing.count)).")
        }
        let dedupeKm = signature.dedupe.map { $0 / 1000.0 }

        var inserted = 0
        var skipped = 0
        var renamed = 0
        var buffer: [Font] = []
        for p in points {
            if let dedupeKm {
                // ¿Hay ya una fuente a menos de N metros? Entonces NO insertamos otra.
                if let hit = existing.first(where: { haversineKm($0.lat, $0.lon, p.lat, p.lon) < dedupeKm }) {
                    // Si la existente tiene un nombre genérico (p. ej. "Font"/"Manantial"
                    // de OSM) y el topónimo del ICGC es más específico, lo mejoramos.
                    if let font = hit.font, Self.isGeneric(font.name), !Self.isGeneric(p.name), font.name != p.name {
                        font.name = p.name
                        try await font.save(on: db)
                        renamed += 1
                    } else {
                        skipped += 1
                    }
                    // Marca el punto como presente para no meter dos ICGC pegados.
                    existing.append((p.lat, p.lon, nil))
                    continue
                }
            }
            buffer.append(Font(
                name: p.name,
                latitude: p.lat,
                longitude: p.lon,
                description: attribution,
                source: source,
                drinkable: nil
            ))
            if dedupeKm != nil { existing.append((p.lat, p.lon, nil)) }

            if buffer.count >= 500 {
                try await buffer.create(on: db)
                inserted += buffer.count
                buffer.removeAll(keepingCapacity: true)
                context.console.info("  insertadas \(inserted)…")
            }
        }
        if !buffer.isEmpty {
            try await buffer.create(on: db)
            inserted += buffer.count
        }
        context.console.info("Importadas \(inserted) fuentes desde \(signature.file)" +
            (renamed > 0 ? " · \(renamed) renombradas con el topónimo del ICGC" : "") +
            (skipped > 0 ? " · \(skipped) saltadas por proximidad" : "") + ".")
    }

    /// Nombres genéricos que conviene sustituir por un topónimo más específico.
    /// Incluye los valores por defecto que pone el import de OSM a nodos sin nombre.
    private static func isGeneric(_ name: String) -> Bool {
        ["font", "manantial", "fuente", "deu", ""].contains(name.trimmingCharacters(in: .whitespaces).lowercased())
    }
}

// MARK: - Decodificación mínima de GeoJSON

private struct GeoJSONFeatureCollection: Decodable {
    let features: [GeoJSONFeature]
}

private struct GeoJSONFeature: Decodable {
    let geometry: GeoJSONGeometry?
    let properties: [String: GeoJSONValue]?
}

private struct GeoJSONGeometry: Decodable {
    let type: String
    // Solo soportamos puntos: [lon, lat]. (Ignoramos multi/línea/polígono.)
    let coordinates: [Double]?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = try container.decode(String.self, forKey: .type)
        coordinates = try? container.decode([Double].self, forKey: .coordinates)
    }
    private enum CodingKeys: String, CodingKey { case type, coordinates }
}

/// Valor escalar arbitrario de las `properties` de GeoJSON, con acceso como String.
private enum GeoJSONValue: Decodable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let d = try? c.decode(Double.self) {
            self = .number(d)
        } else {
            self = .null // objetos/arrays anidados: los ignoramos
        }
    }

    /// Representación como texto (nil para null); los números sin decimales van sin `.0`.
    var stringValue: String? {
        switch self {
        case .string(let s): return s
        case .bool(let b): return b ? "true" : "false"
        case .number(let d): return d == d.rounded() ? String(Int(d)) : String(d)
        case .null: return nil
        }
    }
}
