import Fluent
import SQLKit
import Vapor

/// Siembra la BD con fuentes REALES de la demarcación del Moianès.
/// Fuente de datos: OpenStreetMap (Overpass API, área demarcaciónl), licencia ODbL — © colaboradores de OSM.
/// Uso: `swift run App seed` · `--force` para reemplazar · `--demo` añade usuarios,
/// reseñas y aportaciones liquidadas para poder recorrer también `/zones`.
struct SeedCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Flag(name: "force", help: "Borra las fuentes existentes antes de sembrar")
        var force: Bool
        @Flag(name: "demo", help: "Crea usuarios, reseñas y datos para /zones (contraseña: demo12345)")
        var demo: Bool
        @Option(name: "sample", help: "Con --demo y BD poblada: reseñas sobre N fuentes ALEATORIAS de toda España (en vez de solo el Moianès)")
        var sample: Int?
    }

    /// Imágenes demo incrustadas en la imagen Docker (Public/demo/), permanentes sin R2.
    static let demoImages = ["/demo/fountain-1.svg", "/demo/fountain-2.svg", "/demo/fountain-3.svg"]
    static let demoDrinkable: [Drinkable?] = [.yes, .yes, .yes, .no, .conditional, nil]

    var help: String { "Inserta fuentes reales del Moianès (datos de OpenStreetMap, ODbL)" }

    func run(using context: CommandContext, signature: Signature) async throws {
        let app = context.application
        let db = app.db

        let existing = try await Font.query(on: db).count()
        if existing > 0 && !signature.force {
            // Con la BD ya poblada (p. ej. tras importar toda España), --demo no reinserta
            // fuentes: solo añade usuarios y reseñas sobre las fuentes de la zona del Moianès.
            if signature.demo {
                let targets: [Font]
                if let n = signature.sample, let sql = db as? SQLDatabase {
                    // Muestra aleatoria por toda España (para que la demo no se concentre).
                    let rows = try await sql.raw("SELECT id FROM fonts ORDER BY RANDOM() LIMIT \(bind: n)").all()
                    let ids = try rows.map { try $0.decode(column: "id", as: UUID.self) }
                    targets = try await Font.query(on: db).filter(\.$id ~~ ids).all()
                    context.console.info("Añadiendo reseñas de ejemplo a \(targets.count) fuentes aleatorias de toda España.")
                } else {
                    targets = try await Font.query(on: db)
                        .filter(\.$latitude >= Self.moianesBBox.minLat)
                        .filter(\.$latitude <= Self.moianesBBox.maxLat)
                        .filter(\.$longitude >= Self.moianesBBox.minLong)
                        .filter(\.$longitude <= Self.moianesBBox.maxLong)
                        .all()
                    context.console.info("Añadiendo reseñas de ejemplo a \(targets.count) fuentes de la zona del Moianès (sin tocar el resto).")
                }
                try await seedDemo(app: app, fonts: targets, console: context.console)
                return
            }
            context.console.warning("Ya hay \(existing) fuentes. Usa --force para reemplazarlas, o --demo para añadir reseñas de ejemplo sobre las existentes.")
            return
        }
        if signature.force {
            try await Font.query(on: db).delete()
        }

        var fonts: [Font] = []
        for (name, lat, long) in Self.moianesFonts {
            // El endpoint de zonas excluye deliberadamente las fuentes sin región. El
            // conjunto está íntegramente en el Moianès, así que podemos clasificarlo sin
            // ejecutar `populate-regions`.
            //
            // **`Spain`/`Barcelona` y no `España`/`Catalunya`**, que es lo que decía
            // antes. Los dos valores estaban mal: `region` guarda lo que Natural Earth
            // llame admin-1, y en España eso son **provincias** —Catalunya no aparece por
            // ningún lado—; y `country` guarda el nombre en inglés que trae ese mismo
            // fichero. Comprobado contra las fuentes reales importadas de esa caja: 1.123
            // salen como `Spain`/`Barcelona`.
            //
            // No era cosmético: hacía que toda base local tuviera un país que no existe
            // en producción. Se vio al poner el selector de país de `/zones`, donde
            // salían dos chips llamados «España».
            let font = Font(name: name, latitude: lat, longitude: long,
                            country: "Spain", region: "Barcelona")
            try await font.save(on: db)
            fonts.append(font)
        }
        context.console.info("Insertadas \(fonts.count) fuentes reales del Moianès (OSM, ODbL).")

        if signature.demo {
            try await seedDemo(app: app, fonts: fonts, console: context.console)
        }
    }

    /// Crea usuarios de ejemplo y reseñas con estados y antigüedades variadas. Algunas
    /// fuentes quedan sin revisar y otras llevan más de seis meses sin una reseña para
    /// que las dos barras de `/zones` tengan un progreso reconocible.
    private func seedDemo(app: Application, fonts: [Font], console: Console) async throws {
        let db = app.db

        var users: [User] = []
        for (username, name) in Self.demoUsers {
            if let existing = try await User.query(on: db).filter(\.$username == username).first() {
                users.append(existing)
            } else {
                // xavi123 es admin en la demo (para probar moderación).
                let user = User(name: name, username: username, email: "\(username)@example.com",
                                passwordHash: try Bcrypt.hash("demo12345"), role: username == "xavi123" ? .admin : .user)
                try await user.save(on: db)
                users.append(user)
            }
        }
        console.info("Usuarios demo: \(users.count) (contraseña: demo12345; admin: xavi123).")

        let sql = db as? SQLDatabase
        var reviews = 0
        var withPhoto = 0
        var staleReviews = 0
        var unreviewed = 0
        for (fontIndex, font) in fonts.enumerated() {
            let fontID = try font.requireID()
            // Una distribución determinista garantiza que la barra de fotos siempre sea
            // visible, incluso en un seed pequeño. La variedad interna de las reseñas sí
            // puede seguir siendo aleatoria.
            var fontChanged = false
            // Compatibilidad con bases sembradas antes de que el seed guardase la zona:
            // `seed --demo` las vuelve visibles sin exigir un `--force` destructivo.
            if font.region == nil,
               Self.isInMoianes(lat: font.latitude, long: font.longitude) {
                font.country = "España"
                font.region = "Catalunya"
                fontChanged = true
            }
            if fontIndex.isMultiple(of: 4) { font.image = Self.demoImages[fontIndex % Self.demoImages.count]; fontChanged = true }
            if fontIndex.isMultiple(of: 3) { font.drinkable = Self.demoDrinkable[fontIndex % Self.demoDrinkable.count]; fontChanged = true }
            if fontChanged { try await font.save(on: db) }

            // Una de cada ocho queda sin comprobar; una de cada seis conserva solamente
            // reseñas antiguas. Así se ejercitan 0, reciente y caducada en la misma zona.
            if fontIndex.isMultiple(of: 8) {
                unreviewed += 1
                continue
            }
            let isStale = fontIndex.isMultiple(of: 6)
            let reviewCount = Int.random(in: 1...3)
            for _ in 0..<reviewCount {
                guard let user = users.randomElement() else { continue }
                let status = Self.weightedStatus()
                var (text, rating) = Self.reviewText(for: status)
                // Tres longitudes repartidas: frase suelta, párrafo corto y párrafo
                // largo. De cada una sale un tamaño de pieza distinto en la portada.
                let dado = Int.random(in: 0..<100)
                if dado < 20 { text = Self.longReviewText(for: status) }
                else if dado < 50 { text = Self.mediumReviewText(for: status) }
                // ~25% de las reseñas llevan foto.
                let image = Int.random(in: 0..<100) < 25 ? Self.demoImages.randomElement() ?? nil : nil
                if image != nil { withPhoto += 1 }
                let comment = FontComment(
                    fontID: fontID,
                    userID: try user.requireID(),
                    body: text,
                    rating: rating,
                    waterStatus: status,
                    image: image
                )
                try await comment.save(on: db)
                // Las recientes tienen al menos cuatro días para que el sync pueda
                // liquidarlas (ventana de 72 h); las antiguas hacen visible el hueco de
                // mantenimiento en la segunda barra de `/zones`.
                if let sql, let commentID = comment.id {
                    let daysAgo = isStale ? Double.random(in: 200...360) : Double.random(in: 4...14)
                    let date = Date().addingTimeInterval(-daysAgo * 24 * 3600)
                    try await sql.raw("UPDATE font_comments SET created_at = \(bind: date) WHERE id = \(bind: commentID)").run()
                }
                reviews += 1
                if isStale { staleReviews += 1 }
            }
        }
        console.info("Insertadas \(reviews) reseñas de ejemplo (\(withPhoto) con foto, \(staleReviews) antiguas) en \(fonts.count) fuentes; \(unreviewed) quedan sin comprobar.")

        // `/zones/ranking` lee exclusivamente el registro materializado y liquidado. El
        // comando de demo lo deja listo en la misma ejecución en vez de obligar a conocer
        // y lanzar después `gamification-sync` a mano. Es el sync normal con la hora real:
        // no adelanta el reloj ni liquida aportaciones que aún estén dentro de las 72 h.
        let sync = try await ContributionLedger.sync(on: db)
        console.info("Gamificación demo sincronizada: \(sync.inserted) aportaciones registradas y \(sync.settled) liquidadas para los rankings.")
    }

    /// Bounding box aproximado de la demarcación del Moianès (para acotar las reseñas demo).
    static let moianesBBox = (minLat: 41.70, maxLat: 41.90, minLong: 1.90, maxLong: 2.25)

    static func isInMoianes(lat: Double, long: Double) -> Bool {
        (moianesBBox.minLat...moianesBBox.maxLat).contains(lat)
            && (moianesBBox.minLong...moianesBBox.maxLong).contains(long)
    }

    static let demoUsers: [(String, String)] = [
        ("xavi123", "Xavi Puig"),
        ("marta_r", "Marta Roca"),
        ("jordi88", "Jordi Serra"),
        ("laia_m", "Laia Martí"),
        ("pau_moia", "Pau Vidal"),
        ("nuria_f", "Núria Ferrer"),
        ("oriol_t", "Oriol Torres"),
        ("cristina", "Cristina Bosch"),
        ("marc_sola", "Marc Solà"),
        ("gemma_r", "Gemma Riera"),
    ]

    /// Estado del agua ponderado: la mayoría rajan, algunas poc/seques.
    static func weightedStatus() -> String {
        switch Int.random(in: 0..<100) {
        case ..<55: return "flowing"
        case ..<75: return "trickle"
        case ..<92: return "dry"
        default: return "unknown"
        }
    }

    /// Texto y valoración coherentes con el estado.
    /// Reseñas de longitud media: el escalón intermedio. Sin ellas la demo solo tenía
    /// frases de una línea y párrafos, y en la portada nunca aparecía la pieza vertical.
    static func mediumReviewText(for status: String) -> String {
        switch status {
        case "flowing":
            return [
                "Raja bé i l'aigua surt fresca. Hi ha ombra al costat per parar una estona.",
                "Sale con buen caudal. El acceso está despejado y hay sitio para dejar el coche.",
            ].randomElement()!
        case "trickle":
            return [
                "Raja poc, però l'aigua és bona i està neta. Cal una mica de paciència.",
                "Poca agua, aunque suficiente para beber. Mejor no contar con ella para llenar.",
            ].randomElement()!
        case "dry":
            return [
                "Seca avui. La pica està plena de fulles i fa dies que no hi baixa aigua.",
                "Sin agua. Merece la pena avisar para que alguien la revise.",
            ].randomElement()!
        default:
            return [
                "Lloc tranquil i ben senyalitzat, amb una taula sota els arbres.",
            ].randomElement()!
        }
    }

    /// Reseñas largas: una de cada cinco, para que la demo ejercite de verdad la
    /// portada de novedades, donde el tamaño de cada pieza depende de cuánto hay que
    /// leer. Con solo frases de una línea no saldría ni una pieza grande y el diseño
    /// parecería otro del que es.
    static func longReviewText(for status: String) -> String {
        switch status {
        case "flowing":
            return [
                "Raja amb força tot i que portem un estiu ben sec. S'hi arriba fàcil des del camí de Sant Pere, uns deu minuts a peu des de l'aparcament. Hi ha una taula de pedra a l'ombra i l'aigua surt molt fresca; la gent del poble hi baixa amb garrafes.",
                "Hemos llenado cuatro cantimploras sin esperar nada. El caño está a buena altura y no salpica. El camino de subida es corto pero con piedra suelta, mejor con calzado de monte. A media mañana da el sol de lleno, así que si podéis, id temprano.",
            ].randomElement()!
        case "trickle":
            return [
                "Baixa un filet prim, prou per beure però no per omplir res de pressa. Sembla que la canonada està mig embussada de fulles; amb una branca s'hi arriba i millora una mica. Fa un any rajava molt més, potser val la pena avisar l'ajuntament.",
                "Sale muy poca agua, tarda un buen rato en llenar una botella de litro. Aun así está limpia y fresca. El entorno se agradece: hay sombra y un banco. Si vais con prisa o con mucha gente, contad con otra fuente de reserva más abajo.",
            ].randomElement()!
        case "dry":
            return [
                "Completament seca, ni una gota. Hi hem passat dues vegades aquest mes i les dues igual. La bassa del costat també està buida i es veu la molsa resseca, o sigui que fa setmanes que no raja. No compteu amb aquesta font per a la ruta.",
                "Seca desde hace semanas. Hemos bajado expresamente y nos hemos quedado sin agua a mitad de ruta, así que aviso: la siguiente potable está a más de una hora andando. Por lo demás el sitio es bonito y hay sombra para descansar un rato.",
            ].randomElement()!
        default:
            return [
                "Un lloc molt agradable per parar a dinar. Hi ha dues taules de fusta sota els roures i una zona plana on els nens poden córrer. L'accés en cotxe és per pista de terra, transitable amb qualsevol vehicle si no ha plogut els dies previs.",
            ].randomElement()!
        }
    }

    static func reviewText(for status: String) -> (String, Int?) {
        switch status {
        case "flowing":
            return ([
                "Raja perfectament, aigua ben fresca 👌",
                "Aigua abundant, ideal per omplir cantimplores",
                "Perfecta, sale con buena presión",
                "Molt bona, un lujo després de la pujada",
            ].randomElement()!, Int.random(in: 4...5))
        case "trickle":
            return ([
                "Raja poc a poc, cal paciència",
                "Un filet d'aigua només",
                "Sale poca, hay que esperar un rato",
            ].randomElement()!, Int.random(in: 2...3))
        case "dry":
            return ([
                "No raja aigua, s'ha assecat",
                "Seca del tot, ni gota",
                "Sin agua ahora mismo, no vale la pena desviarse",
            ].randomElement()!, Int.random(in: 1...2))
        default:
            return ([
                "Bonic indret per fer un descans",
                "Ombra i una taula per dinar al costat",
                "Fàcil d'arribar-hi, ben senyalitzada",
            ].randomElement()!, Int.random(in: 3...5))
        }
    }

    // Fonts reales con nombre de la demarcación del Moianès (OpenStreetMap, natural=spring / amenity=drinking_water).
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
