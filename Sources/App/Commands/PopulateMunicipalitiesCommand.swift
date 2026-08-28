import Fluent
import Foundation
import SQLKit
import Vapor

/// Rellena `municipality` y `municipality_ine` por point-in-polygon, sin llamar a nadie.
///
///     swift run App populate-municipalities municipios-es.geojson [--all] [--dry-run]
///
/// El fichero lo produce `scripts/ign-municipios.py` desde los recintos municipales del
/// IGN. Por defecto solo toca las que están sin clasificar; con `--all`, todas.
///
/// ## Por qué esto y no «el pueblo más cercano»
///
/// Porque no son lo mismo y está medido: sobre 2.000 fuentes catalanas, la distancia al
/// núcleo más próximo tiene mediana de 1,64 km y **una de cada cuatro está a más de 3 km**.
/// El más cercano es una pista; el polígono es el dato.
///
/// ## Cuidado con la proyección
///
/// El GeoJSON tiene que estar en grados (EPSG:4258 o 4326). Si viniera en UTM, esto **no
/// da ningún error**: simplemente no encuentra ni un municipio y deja todo sin clasificar.
/// `scripts/ign-municipios.py` lo comprueba en el `.prj` y lo explica.
struct PopulateMunicipalitiesCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Argument(name: "fichero", help: "GeoJSON de recintos municipales")
        var fichero: String
        @Flag(name: "all", help: "Recalcula también las que ya tienen municipio")
        var all: Bool
        @Flag(name: "dry-run", help: "No escribe: solo cuenta")
        var dryRun: Bool
    }

    var help: String { "Asigna el municipio exacto a cada fuente (límites del IGN)" }

    /// Un municipio con su caja, para descartar rápido antes del point-in-polygon.
    private struct Municipio {
        let name: String
        let ine: String
        let anillos: [[(Double, Double)]]
        let minLat, maxLat, minLong, maxLong: Double
    }

    /// Lado de la rejilla del índice, en grados. 0,1° ≈ 11 km: un municipio medio cae en
    /// una o dos celdas y una consulta mira unos pocos candidatos en vez de 8.219.
    private static let celda = 0.1

    func run(using context: CommandContext, signature: Signature) async throws {
        let db = context.application.db
        let datos = try Data(contentsOf: URL(fileURLWithPath: signature.fichero))
        guard let root = try JSONSerialization.jsonObject(with: datos) as? [String: Any],
              let features = root["features"] as? [[String: Any]] else {
            context.console.error("El fichero no es un GeoJSON FeatureCollection.")
            return
        }

        var municipios: [Municipio] = []
        for f in features {
            guard let props = f["properties"] as? [String: Any],
                  let name = props["name"] as? String,
                  let geom = f["geometry"] as? [String: Any],
                  let coords = geom["coordinates"] as? [Any] else { continue }
            let ine = (props["ine"] as? String) ?? ""
            var anillos: [[(Double, Double)]] = []
            // MultiPolygon: [ [ anillo ] ]. `ign-municipios.py` emite un anillo por
            // polígono, así que no hay agujeros que distinguir.
            for poly in coords {
                for anillo in (poly as? [Any] ?? []) {
                    let puntos = (anillo as? [[Double]] ?? []).compactMap { p -> (Double, Double)? in
                        p.count >= 2 ? (p[0], p[1]) : nil
                    }
                    if puntos.count >= 4 { anillos.append(puntos) }
                }
            }
            guard !anillos.isEmpty else { continue }
            let lats = anillos.flatMap { $0.map { $0.1 } }
            let longs = anillos.flatMap { $0.map { $0.0 } }
            municipios.append(Municipio(name: name, ine: ine, anillos: anillos,
                                        minLat: lats.min()!, maxLat: lats.max()!,
                                        minLong: longs.min()!, maxLong: longs.max()!))
        }
        context.console.info("Municipios cargados: \(municipios.count)")
        guard !municipios.isEmpty else {
            context.console.error("Ninguno. ¿Seguro que es el fichero de recintos?")
            return
        }

        // Índice por celdas: cada municipio se apunta en todas las que toca su caja.
        var rejilla: [Int: [Int]] = [:]
        for (i, m) in municipios.enumerated() {
            for celdaLat in Int(floor(m.minLat / Self.celda))...Int(floor(m.maxLat / Self.celda)) {
                for celdaLong in Int(floor(m.minLong / Self.celda))...Int(floor(m.maxLong / Self.celda)) {
                    rejilla[celdaLat &* 100_000 &+ celdaLong, default: []].append(i)
                }
            }
        }

        var query = Font.query(on: db).field(\.$id).field(\.$latitude).field(\.$longitude)
        if !signature.all { query = query.filter(\.$municipality == nil) }
        let fuentes = try await query.all()
        context.console.info("Fuentes a clasificar: \(fuentes.count)")

        // Se agrupan por municipio para escribir con un UPDATE por municipio y no uno por
        // fuente: son 160.000 filas y de una en una son horas contra una base remota.
        var porMunicipio: [Int: [UUID]] = [:]
        var sinMunicipio = 0
        for f in fuentes {
            guard let id = f.id else { continue }
            let clave = Int(floor(f.latitude / Self.celda)) &* 100_000
                      &+ Int(floor(f.longitude / Self.celda))
            var encontrado: Int?
            for i in rejilla[clave] ?? [] {
                let m = municipios[i]
                guard f.latitude >= m.minLat, f.latitude <= m.maxLat,
                      f.longitude >= m.minLong, f.longitude <= m.maxLong else { continue }
                if Self.dentro(lat: f.latitude, long: f.longitude, anillos: m.anillos) {
                    encontrado = i
                    break
                }
            }
            if let encontrado { porMunicipio[encontrado, default: []].append(id) }
            else { sinMunicipio += 1 }
        }

        context.console.info("Clasificadas: \(fuentes.count - sinMunicipio) · sin municipio: \(sinMunicipio)")
        if signature.dryRun {
            context.console.warning("--dry-run: no se ha escrito nada.")
            return
        }

        guard let sql = db as? any SQLDatabase else {
            context.console.error("Hace falta PostgreSQL.")
            return
        }
        var escritas = 0
        for (i, ids) in porMunicipio {
            let m = municipios[i]
            // Por lotes: un `IN (...)` con veinte mil UUID es una consulta que Postgres
            // acepta pero que nadie quiere depurar.
            for lote in stride(from: 0, to: ids.count, by: 500).map({ Array(ids[$0..<min($0 + 500, ids.count)]) }) {
                try await sql.raw("""
                    UPDATE fonts SET municipality = \(bind: m.name),
                                     municipality_ine = \(bind: m.ine)
                    WHERE id = ANY(\(bind: lote))
                    """).run()
                escritas += lote.count
            }
        }
        context.console.info("Escritas: \(escritas)")
    }

    /// Point-in-polygon por número de cruces (ray casting). Un punto está dentro si cruza
    /// un número impar de aristas hacia su derecha.
    static func dentro(lat: Double, long: Double, anillos: [[(Double, Double)]]) -> Bool {
        var dentro = false
        for anillo in anillos {
            var j = anillo.count - 1
            for i in 0..<anillo.count {
                let (xi, yi) = anillo[i]
                let (xj, yj) = anillo[j]
                if (yi > lat) != (yj > lat),
                   long < (xj - xi) * (lat - yi) / (yj - yi) + xi {
                    dentro.toggle()
                }
                j = i
            }
        }
        return dentro
    }
}
