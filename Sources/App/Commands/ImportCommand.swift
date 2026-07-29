import Fluent
import Foundation
import Vapor

/// Importa fuentes desde un JSON de Overpass (OpenStreetMap).
/// Uso: `swift run App import-fonts <fichero.json> [--replace]`.
struct ImportCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Argument(name: "file", help: "Ruta al JSON de Overpass (nodos)")
        var file: String
        @Flag(name: "replace", help: "Borra las fuentes existentes antes de importar")
        var replace: Bool
    }

    var help: String { "Importa fuentes desde un JSON de Overpass (OpenStreetMap, ODbL)" }

    func run(using context: CommandContext, signature: Signature) async throws {
        let db = context.application.db

        let data = try Data(contentsOf: URL(fileURLWithPath: signature.file))
        let response = try JSONDecoder().decode(OverpassResponse.self, from: data)

        // Mapea cada nodo a una Font, con nombre por defecto y tipo en la descripción.
        let fonts: [Font] = response.elements.compactMap { node in
            guard let lat = node.lat, let lon = node.lon else { return nil }
            let tags = node.tags ?? [:]
            let isSpring = tags["natural"] == "spring"
            let name = tags["name"].flatMap { $0.isEmpty ? nil : $0 } ?? (isSpring ? "Manantial" : "Font")
            let description = isSpring ? "Manantial (OpenStreetMap)" : nil
            return Font(name: name, latitude: lat, longitude: lon, description: description)
        }

        context.console.info("Nodos en el fichero: \(response.elements.count) · con coordenadas: \(fonts.count)")

        if signature.replace {
            try await Font.query(on: db).delete()
            context.console.info("Fuentes existentes borradas (--replace).")
        }

        var inserted = 0
        for chunk in fonts.chunked(into: 500) {
            try await chunk.create(on: db)
            inserted += chunk.count
            context.console.info("  insertadas \(inserted)/\(fonts.count)…")
        }
        context.console.info("Importadas \(inserted) fuentes desde \(signature.file).")
    }
}

private struct OverpassResponse: Decodable {
    let elements: [OverpassNode]
}

private struct OverpassNode: Decodable {
    let lat: Double?
    let lon: Double?
    let tags: [String: String]?
}

extension Array {
    func chunked(into size: Int) -> [[Element]] {
        stride(from: 0, to: count, by: size).map { Array(self[$0 ..< Swift.min($0 + size, count)]) }
    }
}
