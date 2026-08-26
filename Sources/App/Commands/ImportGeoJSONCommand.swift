import Fluent
import Foundation
import SQLKit
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
        @Flag(name: "dry-run", help: "Calcula y muestra qué se importaría, sin tocar la BD.")
        var dryRun: Bool
        @Flag(name: "titlecase", help: "Pasa los nombres EN MAYÚSCULAS a Tipo Título (los datos de la ACA vienen así).")
        var titlecase: Bool
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
        // El WFS de la ACA sirve cada fuente como `MultiPoint` de un solo punto, así que
        // aceptamos los dos tipos: si no, la importación no metería absolutamente nada.
        var points: [(name: String, lat: Double, lon: Double)] = []
        for feature in collection.features {
            guard let geometry = feature.geometry else { continue }
            let props = feature.properties ?? [:]
            var name = nameKeys.lazy.compactMap { props[$0]?.stringValue }
                .first { !$0.isEmpty } ?? "Font"
            if signature.titlecase { name = Self.titleCased(name) }
            for coords in geometry.points {
                points.append((name, coords.lat, coords.lon))
            }
        }

        context.console.info("Features: \(collection.features.count) · puntos válidos: \(points.count)")
        if points.isEmpty {
            context.console.warning("Ningún punto utilizable: ¿el GeoJSON tiene geometrías Point/MultiPoint en EPSG:4326?")
            return
        }

        if signature.replace && !signature.dryRun {
            try await Font.query(on: db).delete()
            context.console.info("Fuentes existentes borradas (--replace).")
        }

        // Dedupe opcional. Dos cosas que aquí se pagan caras y antes se hacían mal:
        //
        // 1. **No se cargan los modelos de Fluent.** Esto era `Font.query(on: db).all()`,
        //    o sea las 160.738 fuentes de producción como objetos completos — el mismo
        //    error que tumbó al trabajador de gamificación, medido allí en 698 MB. De cada
        //    fuente aquí solo hacen falta cuatro columnas, así que se piden esas cuatro y
        //    se guardan en un struct. El modelo se carga **solo** cuando de verdad hay que
        //    renombrar una, que son unas pocas decenas.
        // 2. **Se indexan en una rejilla.** La comparación era `existing.first(where:)`,
        //    o sea un barrido lineal por cada punto del fichero: importar 70.000 puntos
        //    contra 160.000 existentes son miles de millones de haversines. Con celdas de
        //    ~1,1 km solo se miran las vecinas.
        var vecinas: [Vecina] = []
        var rejilla: [Celda: [Int]] = [:]
        func indexa(_ v: Vecina) {
            vecinas.append(v)
            rejilla[Self.celdaDe(v.lat, v.lon), default: []].append(vecinas.count - 1)
        }
        /// El índice de la vecina más cercana dentro del radio, **la primera insertada** si
        /// hay varias. Devolver la de menor índice no es un capricho: reproduce
        /// exactamente lo que hacía `first(where:)` sobre el array, y así una importación
        /// repetida sigue dando el mismo resultado.
        func cercana(_ lat: Double, _ lon: Double, _ radioKm: Double) -> Int? {
            let pasoLat = max(1, Int((radioKm / (Self.celdaGrados * 111.0)).rounded(.up)))
            // En longitud un grado mide menos según subes en latitud, así que hay que
            // mirar más celdas a los lados. Sin esto, en el norte se escapan vecinas que
            // sí están dentro del radio y se duplican fuentes.
            let cosLat = max(cos(lat * .pi / 180), 0.01)
            let pasoLon = max(1, Int((radioKm / (Self.celdaGrados * 111.0 * cosLat)).rounded(.up)))
            let c = Self.celdaDe(lat, lon)
            var mejor: Int?
            for dx in -pasoLon...pasoLon {
                for dy in -pasoLat...pasoLat {
                    for i in rejilla[Celda(x: c.x + dx, y: c.y + dy)] ?? [] {
                        guard haversineKm(vecinas[i].lat, vecinas[i].lon, lat, lon) < radioKm else { continue }
                        if mejor == nil || i < mejor! { mejor = i }
                    }
                }
            }
            return mejor
        }

        if let dedupeMeters = signature.dedupe {
            if let sql = db as? any SQLDatabase {
                struct Fila: Decodable {
                    let id: UUID
                    let latitude: Double
                    let longitude: Double
                    let name: String?
                }
                for f in try await sql.raw("SELECT id, latitude, longitude, name FROM fonts")
                    .all(decoding: Fila.self) {
                    indexa(Vecina(id: f.id, lat: f.latitude, lon: f.longitude, name: f.name))
                }
            } else {
                for f in try await Font.query(on: db).all() {
                    indexa(Vecina(id: f.id, lat: f.latitude, lon: f.longitude, name: f.name))
                }
            }
            context.console.info("Dedupe activado a \(Int(dedupeMeters)) m (fuentes existentes: \(vecinas.count)).")
        }
        let dedupeKm = signature.dedupe.map { $0 / 1000.0 }

        var inserted = 0
        var skipped = 0
        var renamed = 0
        var samples: [String] = []   // primeras altas, para verlas en el ensayo en seco
        var buffer: [Font] = []
        for p in points {
            if let dedupeKm {
                // ¿Hay ya una fuente a menos de N metros? Entonces NO insertamos otra.
                if let i = cercana(p.lat, p.lon, dedupeKm) {
                    // Si la existente tiene un nombre genérico (p. ej. "Font"/"Manantial"
                    // de OSM) y el topónimo del ICGC es más específico, lo mejoramos.
                    if let id = vecinas[i].id, Self.isGeneric(vecinas[i].name),
                       !Self.isGeneric(p.name), vecinas[i].name != p.name {
                        // El nombre se cambia SIEMPRE en memoria, también en el ensayo en
                        // seco: si no, un segundo punto del origen junto a la misma fuente
                        // la vería aún genérica y contaría otro renombrado que en la
                        // importación real no ocurre (el ensayo inflaba la cifra).
                        vecinas[i].name = p.name
                        // El modelo se carga aquí y no antes: es el único momento en que
                        // hace falta, y son unas decenas de fuentes en toda la pasada.
                        if !signature.dryRun, let font = try await Font.find(id, on: db) {
                            font.name = p.name
                            try await font.save(on: db)
                        }
                        renamed += 1
                    } else {
                        skipped += 1
                    }
                    // Marca el punto como presente para no meter dos ICGC pegados.
                    indexa(Vecina(id: nil, lat: p.lat, lon: p.lon, name: p.name))
                    continue
                }
            }
            if samples.count < 10 { samples.append("\(p.name)  (\(p.lat), \(p.lon))") }
            buffer.append(Font(
                name: p.name,
                latitude: p.lat,
                longitude: p.lon,
                description: attribution,
                source: source,
                drinkable: nil
            ))
            if dedupeKm != nil { indexa(Vecina(id: nil, lat: p.lat, lon: p.lon, name: p.name)) }

            if signature.dryRun {
                inserted += 1
                buffer.removeAll(keepingCapacity: true)
                continue
            }
            if buffer.count >= 500 {
                try await buffer.create(on: db)
                inserted += buffer.count
                buffer.removeAll(keepingCapacity: true)
                context.console.info("  insertadas \(inserted)…")
            }
        }
        if !buffer.isEmpty && !signature.dryRun {
            try await buffer.create(on: db)
            inserted += buffer.count
        }

        if signature.dryRun {
            context.console.info("ENSAYO EN SECO (no se ha tocado la base de datos)")
            context.console.info("Se añadirían \(inserted) fuentes" +
                (renamed > 0 ? " · \(renamed) existentes se renombrarían con el topónimo oficial" : "") +
                (skipped > 0 ? " · \(skipped) se saltarían por proximidad" : "") + ".")
            if !samples.isEmpty {
                context.console.info("Primeras que entrarían:")
                for sample in samples { context.console.print("  • \(sample)") }
            }
            return
        }

        context.console.info("Importadas \(inserted) fuentes desde \(signature.file)" +
            (renamed > 0 ? " · \(renamed) renombradas con el topónimo del ICGC" : "") +
            (skipped > 0 ? " · \(skipped) saltadas por proximidad" : "") + ".")
    }

    /// "FONT DE LA VALLMITJANA" → "Font de la Vallmitjana". Los datos de la ACA vienen
    /// todos en mayúsculas y, al lado de los nombres de OSM, cantan mucho en el mapa.
    /// Las preposiciones y artículos quedan en minúscula, como se escribe un topónimo.
    static func titleCased(_ name: String) -> String {
        // Si no está todo en mayúsculas, es que alguien ya lo escribió bien: no lo tocamos.
        guard name == name.uppercased() else { return name }
        let minor: Set<String> = ["de", "del", "dels", "des", "la", "les", "el", "els", "l'", "d'", "i", "o",
                                  "en", "na", "ca", "can", "sa", "ses", "a", "al", "als", "amb", "per", "sota", "sobre"]
        return name.lowercased().split(separator: " ").enumerated().map { index, word -> String in
            let w = String(word)
            if index > 0 && minor.contains(w) { return w }
            // "d'olzinelles" → "d'Olzinelles"
            if let apos = w.firstIndex(where: { $0 == "'" || $0 == "’" }), apos < w.index(before: w.endIndex) {
                let prefix = String(w[...apos])
                let rest = String(w[w.index(after: apos)...])
                return prefix + rest.prefix(1).uppercased() + rest.dropFirst()
            }
            return w.prefix(1).uppercased() + w.dropFirst()
        }.joined(separator: " ")
    }

    /// Nombres genéricos que conviene sustituir por un topónimo más específico.
    /// Incluye los valores por defecto que pone el import de OSM a nodos sin nombre.
    /// Sin nombre (`nil`) cuenta como genérico: es el caso más claro de «adopta el
    /// topónimo del ICGC», no una excepción.
    /// Una fuente ya presente, reducida a lo que el dedupe necesita. `id` nulo significa
    /// «insertada en esta misma pasada», que no está en la base y no hay que renombrar.
    private struct Vecina {
        let id: UUID?
        let lat: Double
        let lon: Double
        var name: String?
    }

    /// Celda de la rejilla espacial. ~1,1 km de lado en latitud: lo bastante fina para que
    /// una celda tenga pocas fuentes incluso en el centro de Barcelona, y lo bastante
    /// gruesa para que un `--dedupe` normal (25–50 m) se resuelva mirando 3×3.
    private struct Celda: Hashable {
        let x: Int
        let y: Int
    }

    private static let celdaGrados = 0.01

    private static func celdaDe(_ lat: Double, _ lon: Double) -> Celda {
        Celda(x: Int((lon / celdaGrados).rounded(.down)), y: Int((lat / celdaGrados).rounded(.down)))
    }

    private static func isGeneric(_ name: String?) -> Bool {
        guard let name else { return true }
        let limpio = name.trimmingCharacters(in: .whitespaces)
        if limpio.isEmpty { return true }
        // La lista es la de `Font.placeholderNames` y no una copia: eran dos listas que ya
        // se habían separado —ésta tenía «deu» y le faltaban los rellenos de Francia,
        // Portugal y los nórdicos—, así que un topónimo del ICGC no llegaba a sustituir a
        // un «Fontaine» aunque ese era exactamente el caso para el que se escribió.
        return Font.placeholderNames.contains { $0.lowercased() == limpio.lowercased() }
            || limpio.lowercased() == "deu"
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
    /// Puntos de la geometría, ya en (lat, lon). Vacío para líneas y polígonos.
    let points: [(lat: Double, lon: Double)]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = try container.decode(String.self, forKey: .type)
        // GeoJSON es [lon, lat]. `Point` trae un par; `MultiPoint`, una lista de pares
        // (así sirve la ACA cada fuente). El resto de geometrías no nos interesan.
        if type == "Point", let c = try? container.decode([Double].self, forKey: .coordinates), c.count >= 2 {
            points = [(c[1], c[0])]
        } else if type == "MultiPoint", let cs = try? container.decode([[Double]].self, forKey: .coordinates) {
            points = cs.filter { $0.count >= 2 }.map { ($0[1], $0[0]) }
        } else {
            points = []
        }
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
