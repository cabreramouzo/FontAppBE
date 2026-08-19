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

    /// Ruta de fuentes cuenta jornadas reales, no el número bruto de reseñas: repetir
    /// diez veces la misma parada no convierte una salida en una ruta.
    func testRouteBadgeNeedsThreeDistinctFountainsOnTheSameUTCDay() throws {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        func at(_ day: Int, _ hour: Int) -> Date {
            cal.date(from: DateComponents(year: 2026, month: 8, day: day, hour: hour))!
        }
        let a = UUID(), b = UUID(), c = UUID(), d = UUID()

        XCTAssertEqual(ContributionScore.routeDays(from: [
            (a, at(10, 8)), (a, at(10, 9)), (b, at(10, 10)),
        ]), 0, "Dos fuentes y una repetición no son una ruta.")
        XCTAssertEqual(ContributionScore.routeDays(from: [
            (a, at(10, 8)), (b, at(10, 10)), (c, at(10, 18)),
            (d, at(11, 9)),
        ]), 1)
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

    func testDemoBadgeViewUnlocksEveryFamilyAtMaximumTier() {
        let (badges, catalogue) = ContributionScore.allBadgesUnlocked()
        XCTAssertEqual(badges.count, ContributionScore.badgeFamilies.count)
        XCTAssertEqual(catalogue.count, ContributionScore.badgeFamilies.count)
        XCTAssertTrue(catalogue.allSatisfy { $0.tier != nil && $0.progress == $0.threshold })
        XCTAssertEqual(badges.first { $0.key == "pioneer" }?.tier, .unique)
        XCTAssertTrue(badges.filter { $0.key != "pioneer" }.allSatisfy { $0.tier == .gold })
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

    /// **Manda la primera reseña**, no la primera foto. Se cambió el 19/08/2026 y este
    /// test cambió con ello: durante meses fijó lo contrario, con el argumento de que la
    /// foto era el hueco más grande (0 de 49 fuentes de la muestra tenían) y que era
    /// irrepetible por fuente. Las dos cosas siguen siendo ciertas y aun así el orden
    /// estaba mal: una foto ilustra la fuente, pero lo que ahorra un desvío de tres
    /// kilómetros es saber si mana **hoy**, y eso solo lo dice una reseña. Se vio al hacer
    /// evidente en la ficha el hueco de la foto — con el baremo antiguo, el atajo estaba
    /// mejor pagado que el trabajo.
    ///
    /// El test se queda porque la trampa sigue viva: es fácil subirle el valor a algo
    /// puntual («esto también es importante») hasta que lo que sostiene la app deja de
    /// encabezar la lista.
    func testFirstReviewIsTheBestPaidContribution() throws {
        for k in ContributionScore.Kind.allCases where k != .firstReview {
            XCTAssertGreaterThan(ContributionScore.Kind.firstReview.base, k.base,
                                 "\(k.rawValue) no puede pagar más que la primera reseña")
        }
        // Y la foto sigue por debajo de crear la fuente, que es lo que se intercambió.
        XCTAssertLessThan(ContributionScore.Kind.firstPhoto.base,
                          ContributionScore.Kind.fontCreated.base)
    }

    /// El pulso reparte a la gente en dos listas, y las dos formas de equivocarse son
    /// silenciosas: alguien que no ha subido anunciado como que sí, o el «a punto»
    /// calculado sobre el umbral absoluto en vez de sobre el tramo.
    func testPulseSplitsPromotionsFromClimbers() throws {
        func fila(_ u: String, _ total: Int, _ antes: Int) -> Pulse.Row {
            Pulse.Row(username: u, total: Int64(total), before: Int64(antes))
        }

        let s = Pulse.classify([
            // Cruzó las 100 gotas esta semana: sube a Deu/Manantial.
            fila("sube", 120, 80),
            // Se mueve, pero dentro del mismo peldaño: ni ascenso ni nada.
            fila("quieto", 90, 40),
            // A 90 de 100: dentro del primer tramo, por encima del 75 %.
            fila("apunto", 90, 90),
        ])

        XCTAssertEqual(s.promotions.map(\.username), ["sube"])
        XCTAssertEqual(s.promotions.first?.level, "spring")

        // «quieto» está al 90 % del tramo y también aspira; los dos, por cercanía.
        XCTAssertEqual(s.climbers.map(\.username), ["apunto", "quieto"])
        XCTAssertEqual(s.climbers.first?.remaining, 10)
        XCTAssertEqual(s.climbers.first?.nextLevel, "spring")

        // Quien acaba de subir NO sale además como aspirante del siguiente: sería la
        // misma persona dos veces en la misma tira.
        XCTAssertFalse(s.climbers.contains { $0.username == "sube" })
    }

    /// El progreso se mide **dentro del tramo**, no sobre el umbral absoluto. Con la
    /// división ingenua (`total / siguiente.from`), cualquiera de la mitad alta de la
    /// escalera aparecería «a punto» para siempre: los tramos de arriba son enormes.
    func testPulseProgressIsRelativeToTheBandNotTheThreshold() throws {
        let niveles = ContributionScore.levels.sorted { $0.from < $1.from }
        // Dos peldaños consecutivos bien separados, tomados de la tabla real.
        guard let alto = niveles.last, niveles.count >= 2 else { return XCTFail("tabla vacía") }
        let previo = niveles[niveles.count - 2]

        // Recién llegado al penúltimo: no está a punto de nada, aunque en términos
        // absolutos ya lleve un buen porcentaje del umbral final.
        let recien = Pulse.classify([Pulse.Row(username: "recien", total: Int64(previo.from), before: Int64(previo.from))])
        XCTAssertTrue(recien.climbers.isEmpty,
                      "Acabar de entrar en un tramo no puede contar como estar a punto de salir de él.")
        XCTAssertGreaterThan(Double(previo.from) / Double(alto.from), 0.25,
                             "Si el penúltimo no fuese una fracción apreciable del último, el test no probaría nada.")

        // Al 80 % del tramo sí sale.
        let casi = previo.from + Int(Double(alto.from - previo.from) * 0.8)
        let s = Pulse.classify([Pulse.Row(username: "casi", total: Int64(casi), before: Int64(casi))])
        XCTAssertEqual(s.climbers.map(\.username), ["casi"])
        XCTAssertEqual(s.climbers.first?.nextLevel, alto.key)
    }

    /// Al final de la escalera no hay siguiente peldaño. Sin esto, `nextLevel` nulo
    /// dejaría a quien está arriba del todo fuera por accidente o, peor, con un tramo
    /// negativo.
    func testPulseIgnoresTheTopOfTheLadder() throws {
        let tope = ContributionScore.levels.map(\.from).max() ?? 0
        let s = Pulse.classify([Pulse.Row(username: "arriba", total: Int64(tope + 5_000), before: Int64(tope + 5_000))])
        XCTAssertTrue(s.climbers.isEmpty)
        XCTAssertTrue(s.promotions.isEmpty)
    }

    /// La pantalla de ayuda enseña el baremo, y lo enseña con lo que devuelve
    /// `/gamification/scale`. Si esa respuesta y el código real se separan, la ayuda
    /// miente **en silencio**: no falla nada, simplemente explica un sistema que ya no es
    /// el que puntúa. Aquí se comprueba que los tramos de frescura que se publican son
    /// exactamente los de la función, corte a corte.
    func testPublishedScaleMatchesTheRealOne() async throws {
        let app = try await Application.make(.testing)
        defer { Task { try? await app.asyncShutdown() } }

        let escala = try await GamificationController().scale(
            req: Request(application: app, method: .GET, url: "/gamification/scale",
                         on: app.eventLoopGroup.next()))

        // Cada tramo publicado dice lo mismo que la función en su primer día…
        for tramo in escala.freshness {
            XCTAssertEqual(tramo.gotes,
                           ContributionScore.freshness(daysSincePrevious: tramo.fromDays),
                           "El tramo desde \(tramo.fromDays.map(String.init) ?? "nunca") no cuadra.")
        }
        // …y no falta ninguno: recorriendo el año día a día, todo valor que devuelve la
        // curva tiene que estar publicado. Sin esto, añadir un escalón nuevo al `switch`
        // dejaría la ayuda con un hueco que nadie notaría.
        let publicados = Set(escala.freshness.map(\.gotes))
        let reales = Set((0...400).map { ContributionScore.freshness(daysSincePrevious: $0) })
            .union([ContributionScore.freshness(daysSincePrevious: nil)])
        XCTAssertEqual(publicados, reales, "Hay tramos de la curva que la ayuda no enseña.")

        // Las bases van todas: una aportación que puntúa y no sale en la ayuda es
        // justamente la que hace pensar que los puntos salen de la nada.
        XCTAssertEqual(escala.kinds.count, ContributionScore.Kind.allCases.count)
        XCTAssertEqual(escala.maxMultiplier, ContributionScore.maxMultiplier)
        XCTAssertEqual(escala.dailyCap, ContributionLedger.dailyCap)
        XCTAssertEqual(escala.settleHours, 72)

        // La escalera y las familias también se publican: son lo que enseña la página
        // pública `/gamification`, que es la única explicación que puede leer alguien
        // que todavía no se ha registrado.
        XCTAssertEqual(escala.levels.map(\.key),
                       ContributionScore.levels.reversed().map(\.key),
                       "La escalera tiene que ir de abajo arriba, como se lee.")
        XCTAssertEqual(escala.levels.first?.from, 0, "El primer peldaño empieza en cero.")
        XCTAssertEqual(escala.families.count, ContributionScore.badgeFamilies.count,
                       "Una familia que existe y no se publica es una insignia que nadie sabe que puede conseguir.")
        for f in escala.families {
            let real = ContributionScore.badgeFamilies.first { $0.key == f.key }
            XCTAssertEqual(f.thresholds, real?.thresholds, "Umbrales de \(f.key) fuera de sitio.")
            XCTAssertEqual(f.unique, real?.unique)
            XCTAssertFalse(f.thresholds.isEmpty, "\(f.key) sin umbrales: la página divide por el primero.")
        }
    }

    /// El tramo «nunca reseñada» viaja con `fromDays: null` y **no sin la clave**.
    ///
    /// Mismo fallo que ya tuvimos con `tier`: el codificador sintetizado omite los
    /// opcionales nulos, en el cliente llega `undefined`, y como aquí el nulo distingue
    /// el tramo mejor pagado de la curva, la comprobación `=== null` fallaba y se caía la
    /// pantalla de ayuda entera. Dos veces el mismo error merecen dos tests.
    func testFreshnessStepSerialisesNullDaysExplicitly() throws {
        let paso = GamificationController.Scale.FreshnessStep(fromDays: nil, gotes: 70)
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(paso)) as? [String: Any]
        XCTAssertTrue(json?.keys.contains("fromDays") ?? false, "La clave `fromDays` no puede omitirse.")
        XCTAssertTrue(json?["fromDays"] is NSNull)
    }

    func testHaversineKnownDistance() throws {
        // Madrid (Puerta del Sol) -> Barcelona (Pl. Catalunya) ≈ 505 km.
        let d = haversineKm(40.4168, -3.7038, 41.3874, 2.1686)
        XCTAssertEqual(d, 505, accuracy: 15)
    }

    /// Una dirección de correo **no** es una mención.
    ///
    /// Es el caso que hay que clavar: sin la comprobación de lo que va antes de la `@`,
    /// escribir «escriu a hola@fontapp.net» manda un correo a un usuario «fontapp», y con
    /// mala suerte a una persona real cuyo nombre coincida con un dominio.
    func testMentionsIgnoreEmailAddresses() throws {
        XCTAssertEqual(Mentions.names(in: "avisa @macma i @nuria_f"), ["macma", "nuria_f"])
        XCTAssertEqual(Mentions.names(in: "escriu a hola@fontapp.net si cal"), [])
        XCTAssertEqual(Mentions.names(in: "correu: admin@nuria.cat"), [])
        // Sin repetir aunque se nombre dos veces y con distinta caja: un solo correo.
        XCTAssertEqual(Mentions.names(in: "@Macma ei @macma"), ["Macma"])
        // Y con tope, para que un mensaje no sea un envío masivo.
        let muchos = (1...10).map { "@usuari\($0)" }.joined(separator: " ")
        XCTAssertEqual(Mentions.names(in: muchos).count, Mentions.maxPerMessage)
    }
}
