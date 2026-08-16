import XCTVapor
@testable import App

final class AppTests: XCTestCase {
    // Smoke test sin base de datos: sólo registra rutas y comprueba /health.
    func testHealth() async throws {
        let app = try await Application.make(.testing)
        do {
            try routes(app)
            try app.test(.GET, "health") { res in
                XCTAssertEqual(res.status, .ok)
            }
        } catch {
            try await app.asyncShutdown()
            throw error
        }
        try await app.asyncShutdown()
    }

    /// De qué cabecera sale la IP del cliente al meter Cloudflare delante de Fly.
    ///
    /// Los tres casos son el contrato entero: sin secreto no cambia nada (se puede
    /// desplegar antes de tocar el DNS), con el secreto correcto manda Cloudflare, y
    /// **una `CF-Connecting-IP` sin el secreto se ignora** — que es justo lo que
    /// intentaría quien fuese directo a fly.dev para saltarse el rate-limit rotando IPs
    /// inventadas.
    func testClientIPOnlyTrustsCloudflareWithTheSharedSecret() async throws {
        let app = try await Application.make(.testing)
        defer { unsetenv("EDGE_SECRET") }

        func peticion() -> Request {
            var headers = HTTPHeaders()
            headers.add(name: "Fly-Client-IP", value: "203.0.113.7")
            headers.add(name: "CF-Connecting-IP", value: "198.51.100.9")
            headers.add(name: "X-Edge-Secret", value: "el-secreto-bueno")
            return Request(application: app, method: .GET, url: "/x", headers: headers,
                           on: app.eventLoopGroup.next())
        }

        unsetenv("EDGE_SECRET")
        XCTAssertEqual(ClientIP.of(peticion()), "203.0.113.7", "sin EDGE_SECRET manda Fly")

        setenv("EDGE_SECRET", "el-secreto-bueno", 1)
        XCTAssertEqual(ClientIP.of(peticion()), "198.51.100.9", "con el secreto manda Cloudflare")

        setenv("EDGE_SECRET", "otro-secreto", 1)
        XCTAssertEqual(ClientIP.of(peticion()), "203.0.113.7", "secreto que no cuadra: se ignora Cloudflare")

        try await app.asyncShutdown()
    }

    /// La curva de frescura es el núcleo del baremo: lo que vale volver a una fuente
    /// crece con el tiempo que hacía que nadie pasaba, y es plana en los extremos.
    func testFreshnessCurveRewardsForgottenFountains() throws {
        // Nunca reseñada vale lo máximo: es la que menos sabemos.
        XCTAssertEqual(ContributionScore.freshness(daysSincePrevious: nil), 70)
        // Monótona creciente, sin saltos hacia atrás.
        let dias = [0, 3, 7, 8, 20, 30, 31, 60, 90, 91, 150, 180, 181, 300, 365, 366, 2000]
        let valores = dias.map { ContributionScore.freshness(daysSincePrevious: $0) }
        XCTAssertEqual(valores, valores.sorted(), "la curva no puede bajar al aumentar los días")
        // Plana en los extremos: el pisoteo de la misma semana casi no paga…
        XCTAssertEqual(ContributionScore.freshness(daysSincePrevious: 0),
                       ContributionScore.freshness(daysSincePrevious: 7))
        // …y a partir del año da igual que haga trece meses o cuarenta.
        XCTAssertEqual(ContributionScore.freshness(daysSincePrevious: 366),
                       ContributionScore.freshness(daysSincePrevious: 2000))
        // Y la diferencia entre extremos es grande de verdad, o no cambia conductas.
        XCTAssertGreaterThan(ContributionScore.freshness(daysSincePrevious: 400),
                             ContributionScore.freshness(daysSincePrevious: 1) * 10)
    }

    /// Una descripción que solo repite la atribución del dataset no es contenido humano:
    /// el 33 % de "fuentes con descripción" de producción son exactamente eso, así que si
    /// contara, la insignia de completar fichas se regalaría sola.
    func testAttributionTextDoesNotCountAsDescription() throws {
        XCTAssertTrue(ContributionScore.esVacia(nil))
        XCTAssertTrue(ContributionScore.esVacia("   "))
        XCTAssertTrue(ContributionScore.esVacia("© ICGC/ACA"))
        XCTAssertTrue(ContributionScore.esVacia("© OpenStreetMap contributors"))
        XCTAssertTrue(ContributionScore.esVacia("Manantial (OpenStreetMap)"))
        XCTAssertFalse(ContributionScore.esVacia("Font de tres brocs sota un roure, raja tot l'any."))
    }

    func testLevelThresholds() throws {
        XCTAssertEqual(ContributionScore.level(for: 0).key, "drop")
        XCTAssertEqual(ContributionScore.level(for: 99).key, "drop")
        XCTAssertEqual(ContributionScore.level(for: 100).key, "spring")
        XCTAssertEqual(ContributionScore.level(for: 349).key, "spring")
        XCTAssertEqual(ContributionScore.level(for: 3_500).key, "river")
        XCTAssertEqual(ContributionScore.level(for: 60_000).key, "aquifer")
        XCTAssertEqual(ContributionScore.level(for: 9_999_999).key, "aquifer")

        XCTAssertEqual(ContributionScore.nextLevel(after: 0)?.key, "spring")
        XCTAssertEqual(ContributionScore.nextLevel(after: 99)?.key, "spring")
        XCTAssertEqual(ContributionScore.nextLevel(after: 100)?.key, "brook")
        // Arriba del todo no hay siguiente: la interfaz esconde la barra de progreso.
        XCTAssertNil(ContributionScore.nextLevel(after: 60_000))
    }

    /// Las cuatro estaciones es la única insignia que no se puede acelerar: hacen falta
    /// doce meses reales. Lo que se comprueba aquí es que no se cuele por acumulación —
    /// veinte visitas del mismo mes a la misma fuente no son cuatro estaciones.
    func testFourSeasonsNeedsFourDifferentSeasonsOnTheSameFountain() throws {
        let cal = Calendar(identifier: .gregorian)
        func día(_ mes: Int, _ día: Int = 15) -> Date {
            cal.date(from: DateComponents(timeZone: TimeZone(identifier: "UTC"), year: 2025, month: mes, day: día))!
        }
        let fuenteA = UUID(), fuenteB = UUID()

        // Enero, abril, julio y octubre: una de cada.
        XCTAssertEqual(ContributionScore.fourSeasonFonts(from: [1, 4, 7, 10].map { (fuenteA, día($0)) }), 1)

        // Veinte visitas, todas del mismo verano: no cuenta ninguna.
        XCTAssertEqual(ContributionScore.fourSeasonFonts(
            from: (1...20).map { (fuenteA, día(7, $0)) }), 0)

        // Cuatro estaciones repartidas entre DOS fuentes tampoco valen: la insignia es
        // por fuente, o volver una vez a cuatro sitios distintos la conseguiría.
        XCTAssertEqual(ContributionScore.fourSeasonFonts(
            from: [(fuenteA, día(1)), (fuenteA, día(4)), (fuenteB, día(7)), (fuenteB, día(10))]), 0)

        // Diciembre y enero son la misma estación (invierno), no dos.
        XCTAssertEqual(ContributionScore.season(día(12)), ContributionScore.season(día(1)))
        XCTAssertEqual(Set([1, 4, 7, 10].map { ContributionScore.season(día($0)) }).count, 4)
    }

    /// La vitrina enseña **todas** las familias, tenga o no la insignia, y el marcador
    /// solo las conseguidas. Las dos salen de la misma tabla: si se separaran, una
    /// casilla gris podría pedir un umbral que luego no es el que se cobra.
    func testCatalogueShowsEveryFamilyAndBadgesOnlyTheEarnedOnes() throws {
        var t = ContributionScore.BadgeTally()
        t.fontsCreated = 12       // Descubridor: bronce (10), siguiente 50
        t.firstPhotos = 0         // Primera luz: nada, primer umbral 5

        let vitrina = ContributionScore.catalogue(for: t)
        XCTAssertEqual(vitrina.count, ContributionScore.badgeFamilies.count)

        let descubridora = vitrina.first { $0.family == "discoverer" }
        XCTAssertEqual(descubridora?.tier, "bronze")
        XCTAssertEqual(descubridora?.progress, 12)
        XCTAssertEqual(descubridora?.threshold, 50, "El umbral que se persigue es el siguiente, no el ya pasado.")

        let luz = vitrina.first { $0.family == "firstLight" }
        XCTAssertNil(luz?.tier, "Sin conseguir, `tier` tiene que ser nulo: es lo que la pinta gris.")
        XCTAssertEqual(luz?.threshold, 5)

        // El marcador solo lleva la que se tiene.
        let logradas = ContributionScore.badges(for: t)
        XCTAssertEqual(logradas.map(\.key), ["discoverer"])
    }

    /// `tier` nulo tiene que viajar como `null` y no desaparecer del JSON: en el cliente
    /// una clave ausente llega como `undefined`, y dar por conseguida una insignia
    /// bloqueada es exactamente el fallo contrario al que se quiere evitar.
    func testLockedBadgeSerialisesTierAsExplicitNull() throws {
        let slot = ContributionScore.BadgeSlot(family: "sentinel", tier: nil, progress: 0,
                                               threshold: 15, thresholds: [15, 60, 250])
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(slot)) as? [String: Any]
        XCTAssertTrue(json?.keys.contains("tier") ?? false, "La clave `tier` no puede omitirse.")
        XCTAssertTrue(json?["tier"] is NSNull)
    }

    /// La tabla se escribe a mano y un corte fuera de orden rompe `level(for:)` en
    /// silencio: devolvería un peldaño que no toca sin fallar por ningún lado.
    func testLevelTableIsWellFormed() throws {
        let levels = ContributionScore.levels
        XCTAssertEqual(levels.count, 10)
        XCTAssertEqual(levels.last?.from, 0, "Hace falta un nivel de partida en 0 o quien no ha aportado nada no tiene nivel.")
        XCTAssertEqual(Set(levels.map(\.key)).count, levels.count, "Claves de nivel repetidas.")
        for (mayor, menor) in zip(levels, levels.dropFirst()) {
            XCTAssertGreaterThan(mayor.from, menor.from, "«\(mayor.name)» debe ir por encima de «\(menor.name)».")
        }
    }

    /// Un multiplicador que se aplica a la mayoría de aportaciones es el baremo base
    /// disfrazado. Estos dos saltaban al 46 % y al 79 % con los valores anteriores.
    func testCircumstanceMultipliersStayModest() throws {
        XCTAssertEqual(ContributionScore.dryMonths.count, 2, "El estiaje tiene que ser la excepción del calendario, no un tercio del año.")
        XCTAssertLessThanOrEqual(ContributionScore.desertFactor, 1.3)
        XCTAssertLessThanOrEqual(ContributionScore.dryFactor, 1.2)
        XCTAssertLessThanOrEqual(ContributionScore.maxMultiplier, 2.2,
                                 "El techo combinado no puede acercarse a duplicar el baremo.")
    }

    /// La primera foto tiene que pagar más que cualquier otra cosa: es el hueco medido
    /// (0 de 49 fuentes de la muestra de producción) y es irrepetible por fuente.
    func testFirstPhotoIsTheBestPaidContribution() throws {
        let otras = ContributionScore.Kind.allCases.filter { $0 != .firstPhoto }
        for k in otras {
            XCTAssertGreaterThan(ContributionScore.Kind.firstPhoto.base, k.base,
                                 "\(k.rawValue) no puede pagar más que la primera foto")
        }
    }

    func testHaversineKnownDistance() throws {
        // Madrid (Puerta del Sol) -> Barcelona (Pl. Catalunya) ≈ 505 km.
        let d = haversineKm(40.4168, -3.7038, 41.3874, 2.1686)
        XCTAssertEqual(d, 505, accuracy: 15)
    }
}
