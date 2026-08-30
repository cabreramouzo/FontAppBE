import Fluent
import Foundation
import Vapor

/// Carga los contornos municipales del IGN en la base.
///
///     swift run App import-municipal-boundaries municipios-es.geojson [--only 08055]
///
/// El fichero lo produce `scripts/ign-municipios.py`, el **mismo** que alimenta
/// `populate-municipalities`. Que el polígono que se dibuja sea el que clasificó las
/// fuentes es lo que impide que aparezca una fuente pintada fuera de su municipio.
///
/// Idempotente: vuelve a escribir el contorno que ya estuviera. Los 8.219 municipios
/// ocupan del orden de 15 MB en la tabla (mediana medida por contorno: 1,8 KB).
struct ImportMunicipalBoundariesCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Argument(name: "fichero", help: "GeoJSON de recintos municipales")
        var fichero: String
        @Option(name: "only", help: "Cargar solo este código INE (para probar)")
        var only: String?
        @Flag(name: "dry-run", help: "No escribe: solo cuenta")
        var dryRun: Bool
    }

    var help: String { "Carga los contornos municipales para dibujarlos en el mapa" }

    func run(using context: CommandContext, signature: Signature) async throws {
        let db = context.application.db
        let datos = try Data(contentsOf: URL(fileURLWithPath: signature.fichero))
        guard let root = try JSONSerialization.jsonObject(with: datos) as? [String: Any],
              let features = root["features"] as? [[String: Any]] else {
            context.console.error("El fichero no es un GeoJSON FeatureCollection.")
            return
        }

        var escritos = 0, saltados = 0
        for f in features {
            guard let props = f["properties"] as? [String: Any],
                  let ine = props["ine"] as? String,
                  let nombre = props["name"] as? String,
                  let geom = f["geometry"] as? [String: Any],
                  let tipo = geom["type"] as? String else { saltados += 1; continue }
            if let solo = signature.only, solo != ine { continue }

            // Todo se normaliza a MultiPolygon: un `Polygon` se envuelve en una lista. Así
            // el cliente dibuja una sola forma y no dos casos.
            let anillos: [[[[Double]]]]
            switch tipo {
            case "MultiPolygon": anillos = (geom["coordinates"] as? [[[[Double]]]]) ?? []
            case "Polygon": anillos = [(geom["coordinates"] as? [[[Double]]]) ?? []]
            default: saltados += 1; continue
            }
            guard !anillos.isEmpty else { saltados += 1; continue }

            var minLat = 90.0, maxLat = -90.0, minLong = 180.0, maxLong = -180.0
            for poligono in anillos {
                for anillo in poligono {
                    for punto in anillo where punto.count >= 2 {
                        minLong = min(minLong, punto[0]); maxLong = max(maxLong, punto[0])
                        minLat = min(minLat, punto[1]); maxLat = max(maxLat, punto[1])
                    }
                }
            }
            guard minLat <= maxLat else { saltados += 1; continue }

            if !signature.dryRun {
                // Borrar y volver a insertar en vez de `save()`: con `@ID(generatedBy:
                // .user)` Fluent no sabe si la fila existe y un `create` sobre una que ya
                // está revienta con violación de clave.
                try await MunicipalBoundary.query(on: db).filter(\.$id == ine).delete()
                try await MunicipalBoundary(ine: ine, name: nombre, rings: anillos,
                                            minLat: minLat, maxLat: maxLat,
                                            minLong: minLong, maxLong: maxLong).create(on: db)
            }
            escritos += 1
        }
        context.console.info("Contornos \(signature.dryRun ? "que se cargarían" : "cargados"): \(escritos). Saltados: \(saltados).")
    }
}
