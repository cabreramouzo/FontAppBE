import Fluent
import Vapor

/// Siembra la BD con fuentes de ejemplo de la comarca del Moianès.
/// Uso: `swift run App seed` (o `swift run App seed --force` para reemplazar).
struct SeedCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Flag(name: "force", help: "Borra las fuentes existentes antes de sembrar")
        var force: Bool
    }

    var help: String { "Inserta fuentes de ejemplo del Moianès" }

    func run(using context: CommandContext, signature: Signature) async throws {
        let db = context.application.db

        let existing = try await Font.query(on: db).count()
        if existing > 0 && !signature.force {
            context.console.warning("Ya hay \(existing) fuentes. Usa --force para reemplazarlas.")
            return
        }
        if signature.force {
            try await Font.query(on: db).delete()
        }

        for (name, lat, long, desc) in Self.moianesFonts {
            try await Font(name: name, latitude: lat, longitude: long, description: desc).save(on: db)
        }
        context.console.info("Insertadas \(Self.moianesFonts.count) fuentes del Moianès.")
    }

    // Fuentes repartidas por los pueblos del Moianès (coordenadas aproximadas).
    static let moianesFonts: [(String, Double, Double, String?)] = [
        ("Font Nova", 41.8105, 2.0975, "En el casc antic de Moià."),
        ("Font del Sant Crist", 41.8112, 2.0990, nil),
        ("Font de Sant Sebastià", 41.8088, 2.0951, nil),
        ("Font de les Coves del Toll", 41.8201, 2.1052, "Prop del jaciment prehistòric."),
        ("Font Bona", 41.7548, 2.1230, "Castellterçol."),
        ("Font de la Salut", 41.7562, 2.1201, nil),
        ("Font del Pinar", 41.7509, 2.1178, nil),
        ("Font del Racó", 41.7583, 2.1502, "Castellcir."),
        ("Font de la Vila", 41.7601, 2.1488, nil),
        ("Font Fresca", 41.7205, 2.1701, "Sant Quirze Safaja."),
        ("Font del Ferro", 41.7189, 2.1725, "Aigua ferruginosa."),
        ("Font del Bosc", 41.7168, 2.1668, nil),
        ("Font de les Tres Aigües", 41.8352, 2.1805, "Collsuspina."),
        ("Font Vella", 41.8338, 2.1789, nil),
        ("Font de l'Alzina", 41.8375, 2.1832, nil),
        ("Font del Monestir", 41.8662, 2.1122, "L'Estany, vora el monestir."),
        ("Font de la Bassa", 41.8648, 2.1105, nil),
        ("Font Rodona", 41.8688, 2.1149, nil),
        ("Font del Molí", 41.7622, 2.0151, "Monistrol de Calders."),
        ("Font Calenta", 41.7635, 2.0138, nil),
        ("Font de la Teuleria", 41.8681, 2.0285, "Santa Maria d'Oló."),
        ("Font Grossa", 41.8695, 2.0271, nil),
        ("Font del Pont", 41.7832, 1.9985, "Calders."),
        ("Font de l'Om", 41.7845, 1.9971, nil),
        ("Font del Castell", 41.7061, 2.0952, "Granera."),
        ("Font Amagada", 41.7075, 2.0938, nil),
    ]
}
