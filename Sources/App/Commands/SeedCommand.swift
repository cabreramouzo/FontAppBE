import Fluent
import Vapor

/// Siembra la BD con fuentes REALES de la comarca del Moianès.
/// Fuente de datos: OpenStreetMap (Overpass API, área comarcal), licencia ODbL — © colaboradores de OSM.
/// Uso: `swift run App seed` (o `swift run App seed --force` para reemplazar).
struct SeedCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Flag(name: "force", help: "Borra las fuentes existentes antes de sembrar")
        var force: Bool
    }

    var help: String { "Inserta fuentes reales del Moianès (datos de OpenStreetMap, ODbL)" }

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

        for (name, lat, long) in Self.moianesFonts {
            try await Font(name: name, latitude: lat, longitude: long).save(on: db)
        }
        context.console.info("Insertadas \(Self.moianesFonts.count) fuentes reales del Moianès (OSM, ODbL).")
    }

    // Fonts reales con nombre de la comarca del Moianès (OpenStreetMap, natural=spring / amenity=drinking_water).
    static let moianesFonts: [(String, Double, Double)] = [
        ("Font", 41.81363, 2.09872),
        ("Font Antic Camí Can Patiràs", 41.81355, 2.10154),
        ("Font Calda", 41.76084, 1.95038),
        ("Font Isabel", 41.82957, 2.09722),
        ("Font d'Armenteres", 41.84992, 1.99914),
        ("Font d'en Prat de la Riba", 41.7654, 2.09763),
        ("Font de Bellveí", 41.76659, 1.9804),
        ("Font de Bussanya", 41.81754, 2.0632),
        ("Font de Cal Gira", 41.82303, 2.1215),
        ("Font de Marfà", 41.77909, 2.07631),
        ("Font de Montserrat", 41.82955, 2.09682),
        ("Font de Montví de Dalt", 41.82613, 2.09213),
        ("Font de Moretones", 41.86068, 2.02601),
        ("Font de Passarell", 41.82548, 2.09964),
        ("Font de Puig Castellar", 41.72171, 2.12594),
        ("Font de Sant Antoni", 41.74631, 2.12838),
        ("Font de Sant Josep", 41.81271, 2.09504),
        ("Font de Sant Lluís", 41.76001, 1.93672),
        ("Font de Sant Pere", 41.81282, 2.09234),
        ("Font de Vilalta", 41.83778, 2.08632),
        ("Font de l'Abellar", 41.75044, 2.00536),
        ("Font de l'Angle", 41.7563, 1.92392),
        ("Font de l'Avellaner", 41.7329, 2.07732),
        ("Font de l'Avi", 41.82986, 2.1051),
        ("Font de l'Om", 41.74578, 2.02946),
        ("Font de l'Àngel", 41.75925, 2.12384),
        ("Font de la Blada", 41.7562, 2.09248),
        ("Font de la Crespiera", 41.81269, 2.097),
        ("Font de la Creu de Terme", 41.82593, 2.17528),
        ("Font de la Falzia", 41.7945, 2.09834),
        ("Font de la Mare de Deu", 41.81548, 2.09482),
        ("Font de la Plaça de Sant Sebastià", 41.81315, 2.09707),
        ("Font de la Plaça del Castell de Clarà", 41.81284, 2.08883),
        ("Font de la Sauva Negra", 41.78343, 2.1858),
        ("Font de la Serra", 41.78706, 2.09657),
        ("Font de la Tosca", 41.77897, 2.07648),
        ("Font de la Vinyota", 41.76329, 2.13014),
        ("Font de les Bruixes", 41.85769, 2.01713),
        ("Font de les Tàpies", 41.77845, 1.93481),
        ("Font del Bac", 41.88152, 2.00956),
        ("Font del Boixar", 41.75555, 1.92174),
        ("Font del Bosquet", 41.81954, 2.10877),
        ("Font del Campaner", 41.77523, 2.03159),
        ("Font del Casal", 41.81196, 2.09732),
        ("Font del Dr. Vilardell", 41.8679, 2.11308),
        ("Font del Girbau", 41.74301, 2.05447),
        ("Font del Mo", 41.75767, 1.93531),
        ("Font del Molí d'en Brotons", 41.78148, 2.07888),
        ("Font del Molí del Vent", 41.80611, 2.06044),
        ("Font del Pollancre", 41.72876, 2.22816),
        ("Font del Pontarró", 41.73499, 2.13502),
        ("Font del Prat", 41.8, 2.11474),
        ("Font del Prat del Pou", 41.74351, 2.1165),
        ("Font del Regàs", 41.84281, 2.18234),
        ("Font del Roc", 41.86933, 2.03675),
        ("Font del Solà del Sot", 41.72326, 2.1043),
        ("Font del Sot", 41.75602, 1.92349),
        ("Font del Viver", 41.75152, 2.11302),
        ("Font del l'Avi", 41.76091, 1.93472),
        ("Font nova de Sant Lluís", 41.75996, 1.93699),
        ("Font nova de la Tosca", 41.77998, 2.07521),
        ("Font plaça del Saiol", 41.80645, 2.09793),
        ("Fontscalents", 41.77351, 2.13801),
        ("Pou Castellnou", 41.79796, 2.10042),
        ("Pou de Coromines", 41.8256, 2.07956),
        ("Poua del Vapor", 41.76219, 2.12276),
        ("font Sant Miquel del Fai", 41.71568, 2.18902),
    ]
}
