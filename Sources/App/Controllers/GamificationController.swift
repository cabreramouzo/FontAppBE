import Fluent
import Vapor

/// Fase 3: enseñar la gamificación en el perfil, y nada más. Sin rankings todavía —
/// primero conviene ver si la gente entiende el marcador sin que nadie se lo explique.
///
/// El marcador completo —gotas, pendientes, desglose por tipo, impacto— sigue siendo
/// **solo de quien lo mira**. Lo único público son las **insignias conseguidas** de otra
/// persona (`/users/:id/badges`), y a propósito solo eso: qué has ganado, no cuánto llevas
/// ni cómo lo repartes. Una medalla es un hecho sobre lo que ya se ve en el mapa; el
/// marcador es un perfil de actividad, y no son lo mismo.
struct GamificationController: RouteCollection {
    /// Las insignias de una persona cambian con las horas, no con los segundos, y la
    /// misma ficha se abre muchas veces. Mismo TTL que zonas y pulso.
    static let badgeCache = ZoneCache()

    /// Cuentas de demostración que ven todas las insignias en oro. Es una lista de
    /// usernames separada por comas y no cambia sus aportaciones ni sus gotas.
    static func unlockAllBadges(for user: User) -> Bool {
        let names = Environment.get("BADGES_UNLOCK_ALL_USERS")?
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() } ?? []
        return names.contains(user.username.lowercased())
    }

    func boot(routes: any RoutesBuilder) throws {
        let g = routes.grouped("gamification").grouped(UserToken.authenticator(), User.guardMiddleware())
        g.get("me", use: me)
        g.get("guarded", use: guarded)

        // Solo para la felicitación. Va aparte de `me` porque cuenta lo pendiente y `me`
        // no debe: el marcador, la vitrina y todo lo demás siguen con las 72 h.
        g.grouped(RateLimitMiddleware(scope: "badge-preview", max: 240, window: 60 * 60))
            .get("badges", "preview", use: badgesPreview)

        // El baremo es público y no depende de quién pregunte: sin autenticar, para que
        // la pantalla de ayuda la pueda leer también quien todavía no tiene cuenta —
        // que es justo a quien hay que convencer de que el sistema es entendible.
        routes.grouped("gamification").get("scale", use: scale)

        // Cuelga de `users` porque es un dato **de la persona**, no del sistema de puntos:
        // así vive al lado de `/users/:id/fonts` y `/users/:id/comments`, que es donde se
        // va a buscar. Pública y con el mismo límite que el resto de rutas públicas caras.
        routes.grouped("users")
            .grouped(RateLimitMiddleware(scope: "badges", max: 120, window: 60 * 60))
            .get(":userID", "badges", use: badges)
    }

    /// El baremo, tal cual está en el código.
    ///
    /// Existe para que la pantalla de ayuda **no tenga que repetir los números**. Copiados
    /// al cliente, el día que se recalibre una base o un multiplicador la ayuda seguiría
    /// enseñando los viejos, y una explicación que no cuadra con lo que ves en tu marcador
    /// es peor que no dar ninguna: enseña que el sistema no se entiende.
    ///
    /// Los rótulos NO viajan aquí: van por clave y los traduce el navegador, igual que los
    /// niveles y las insignias. Lo que viaja son las cifras.
    struct Scale: Content, Sendable {
        struct KindValue: Content, Sendable {
            let kind: String
            let base: Int
        }
        struct Multiplier: Content, Sendable {
            /// `desert` · `dry` · `doubt` · `crowded`, para que el cliente ponga el texto.
            let key: String
            let factor: Double
        }
        let kinds: [KindValue]
        let multipliers: [Multiplier]
        let maxMultiplier: Double
        /// Kilómetros sin ninguna fuente reseñada cerca para que cuente como desierto.
        let desertKm: Double
        /// Meses de estiaje, 1–12.
        let dryMonths: [Int]
        /// Reseñas frescas a partir de las cuales una más apenas suma.
        let crowdedFrom: Int
        /// Tope de gotas por día.
        let dailyCap: Int
        /// Horas hasta que una aportación se cobra.
        let settleHours: Int
        /// La curva de frescura, como pares (días desde la última reseña, gotas).
        /// El primer tramo empieza en 0; `nil` en `days` = nunca reseñada.
        struct FreshnessStep: Content, Sendable {
            let fromDays: Int?
            let gotes: Int

            /// `fromDays` se escribe **explícitamente como `null`**, igual que `tier` en
            /// `BadgeSlot` y por el mismo motivo: el codificador sintetizado usa
            /// `encodeIfPresent` y omite la clave, así que en el cliente llega `undefined`
            /// en vez de `null`. Aquí el nulo **significa algo** —«nunca reseñada», el
            /// tramo mejor pagado de la curva—, y sin la clave la comparación `=== null`
            /// falla y se cae la pantalla entera. Ya pasó una vez con las insignias.
            func encode(to encoder: any Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(fromDays, forKey: .fromDays)
                try c.encode(gotes, forKey: .gotes)
            }
        }
        let freshness: [FreshnessStep]

        /// La escalera, de abajo arriba. Sin nombres: la clave la traduce el navegador.
        ///
        /// Va aquí y no solo en `/gamification/me` porque la página pública tiene que
        /// poder enseñarla **sin sesión**, y quien más necesita ver a dónde lleva esto es
        /// justamente quien todavía no ha aportado nada.
        struct LevelStep: Content, Sendable {
            let key: String
            let from: Int
        }
        let levels: [LevelStep]

        /// Las familias de insignias con sus tres umbrales (uno si es de grado único).
        struct Family: Content, Sendable {
            let key: String
            let thresholds: [Int]
            let unique: Bool
        }
        let families: [Family]

        /// Las especiales: las que son un hecho y no un contador.
        ///
        /// Solo la clave y el cupo. **Las plazas libres no van aquí**: esta ruta es
        /// pública y no toca la base de datos a propósito, y un «quedan 38» exigiría un
        /// `COUNT` por visita a la página. Quien tiene sesión ve las plazas restantes en
        /// `/gamification/me`, que ya consulta.
        struct SpecialInfo: Content, Sendable {
            let key: String
            /// Plazas totales, o `null` si no tiene cupo. Explícito, como siempre aquí.
            let limit: Int?

            func encode(to encoder: any Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(key, forKey: .key)
                try c.encode(limit, forKey: .limit)
            }
        }
        let specials: [SpecialInfo]

        /// Qué abre cada nivel, más allá de lo que puede hacer cualquiera.
        ///
        /// Se publica aunque el sistema esté apagado —lo está por defecto— porque el
        /// problema que resuelve es el contrario: la escalera parecía no llevar a ninguna
        /// parte. `enabled` dice si ya concede algo, y la interfaz lo advierte en vez de
        /// prometer un permiso que hoy no existe.
        struct CapabilityInfo: Content, Sendable {
            let key: String
            /// Clave del nivel a partir del cual se abre.
            let level: String
            let gotes: Int
            /// Si **esta** capacidad se concede ya. Va por capacidad y no global porque
            /// desde que unas exigen puntos definitivos y otras no, un único «activo» o
            /// «inactivo» mentía en la mitad de los casos.
            let enabled: Bool
        }
        let capabilities: [CapabilityInfo]
        /// `false` mientras falte `GAMIFICATION_CAPABILITIES` o la época no haya pasado.
        let capabilitiesEnabled: Bool
        /// Días distintos con aportación que hacen falta además de las gotas.
        let capabilityActiveDays: Int
    }

    /// GET /gamification/scale — el baremo. Pública y sin base de datos.
    @Sendable func scale(req: Request) async throws -> Scale {
        let definitivos = ContributionLedger.epoch.map { Date() >= $0 } ?? false
        return Scale(
            kinds: ContributionScore.Kind.allCases.map {
                .init(kind: $0.rawValue, base: $0.base)
            },
            multipliers: [
                .init(key: "desert", factor: ContributionScore.desertFactor),
                .init(key: "dry", factor: ContributionScore.dryFactor),
                .init(key: "doubt", factor: ContributionScore.doubtFactor),
                .init(key: "crowded", factor: 0.2),
            ],
            maxMultiplier: ContributionScore.maxMultiplier,
            desertKm: ContributionScore.desertKm,
            dryMonths: Array(ContributionScore.dryMonths),
            crowdedFrom: 3,
            dailyCap: ContributionLedger.dailyCap,
            settleHours: Int(ContributionLedger.settlementWindow / 3_600),
            // Los cortes son los mismos de `ContributionScore.freshness`. Se escriben
            // aquí porque la función es un `switch` y no una tabla recorrible; si algún
            // día se separan, el test `testFreshnessCurveRewardsForgottenFountains`
            // seguiría pasando y la ayuda mentiría en silencio — por eso hay un test
            // propio que compara esta lista contra la función.
            freshness: [
                .init(fromDays: 0, gotes: ContributionScore.freshness(daysSincePrevious: 0)),
                .init(fromDays: 8, gotes: ContributionScore.freshness(daysSincePrevious: 8)),
                .init(fromDays: 31, gotes: ContributionScore.freshness(daysSincePrevious: 31)),
                .init(fromDays: 91, gotes: ContributionScore.freshness(daysSincePrevious: 91)),
                .init(fromDays: 181, gotes: ContributionScore.freshness(daysSincePrevious: 181)),
                .init(fromDays: 366, gotes: ContributionScore.freshness(daysSincePrevious: 366)),
                .init(fromDays: nil, gotes: ContributionScore.freshness(daysSincePrevious: nil)),
            ],
            // De abajo arriba: `ContributionScore.levels` está al revés porque `level(for:)`
            // busca el primero que se alcanza, y una escalera se lee subiendo.
            levels: ContributionScore.levels.reversed().map { .init(key: $0.key, from: $0.from) },
            families: ContributionScore.badgeFamilies.map {
                .init(key: $0.key, thresholds: $0.thresholds, unique: $0.unique)
            },
            specials: SpecialBadges.catalogue.map { .init(key: $0.key, limit: $0.limit) },
            capabilities: Capabilities.Capability.allCases.map {
                .init(key: $0.rawValue, level: $0.level, gotes: $0.gotes,
                      enabled: Capabilities.enabled && (definitivos || !$0.requiresDefinitivePoints))
            },
            // El global se queda como «¿hay algo concedible?», para el aviso de la página.
            capabilitiesEnabled: Capabilities.enabled
                && Capabilities.Capability.allCases.contains { definitivos || !$0.requiresDefinitivePoints },
            capabilityActiveDays: Capabilities.requiredActiveDays)
    }

    /// Lo que se publica de otra persona: la familia y el grado, nada más.
    ///
    /// Sin `progress` ni `threshold`, que sí lleva la vitrina propia. «Tiene el oro de
    /// Descubridor» dice que ha puesto más de 200 fuentes en el mapa, y esas fuentes ya
    /// se ven una a una en `/users/:id/fonts`. «Lleva 237» es un número sobre la persona
    /// que no aporta nada a quien está mirando una fuente.
    struct PublicBadge: Content, Sendable {
        let family: String
        /// `bronze` · `silver` · `gold` · `unique`, y `special` para las de
        /// `SpecialBadges`. Viajan en la misma lista a propósito: el perfil público las
        /// pinta juntas y la celebración compara esta lista contra la que vio la última
        /// vez, así que una especial nueva se celebra sola sin tocar nada del cliente.
        let tier: String
    }

    /// Las especiales de alguien, con la forma de las demás para poder mezclarlas.
    static func specials(for userID: UUID, on db: any Database) async throws -> [PublicBadge] {
        try await BadgeAward.query(on: db).filter(\.$user.$id == userID)
            .sort(\.$earnedAt).all()
            .map { PublicBadge(family: $0.key, tier: "special") }
    }

    struct PublicBadges: Content, Sendable {
        let badges: [PublicBadge]
        /// Clave del nivel (`river`), o `null` si no hay nada que enseñar.
        ///
        /// Solo el nivel que tiene, **no la escalera ni las gotas**: «Río» dice cuánto ha
        /// aportado alguien sin convertir su perfil en un contador. Las gotas exactas
        /// siguen siendo suyas y solo suyas.
        ///
        /// Se escribe explícitamente como `null` — es un opcional, y el codificador
        /// sintetizado omitiría la clave y en el cliente llegaría `undefined`. Tercera vez
        /// que lo escribimos a mano en este fichero, y por algo será.
        let level: String?

        func encode(to encoder: any Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(badges, forKey: .badges)
            try c.encode(level, forKey: .level)
        }
    }

    /// GET /gamification/badges/preview — lo que **ya** te has ganado, sin esperar.
    ///
    /// Cuenta las aportaciones pendientes además de las liquidadas, y existe para una sola
    /// cosa: poder decir «acabas de ganar Pionero» en el momento de ganarla. Una
    /// felicitación que llega tres días después, cuando ya no te acuerdas de qué hiciste,
    /// no anima a nadie a seguir.
    ///
    /// **No cambia nada más.** El marcador, la vitrina, el ranking y lo que ven los demás
    /// siguen contando solo lo liquidado: las 72 h existen para poder anular una
    /// aportación, y eso no se toca. Lo único que se adelanta es el aviso.
    ///
    /// Sin caché, a diferencia de la ruta pública: se pide justo después de aportar y una
    /// respuesta de hace cinco minutos no tendría dentro lo que se acaba de hacer.
    @Sendable func badgesPreview(req: Request) async throws -> PublicBadges {
        let user = try req.auth.require(User.self)
        guard !user.gamificationOptOut else { return PublicBadges(badges: [], level: nil) }
        let perfil = try await ContributionLedger.profile(
            for: try user.requireID(), on: req.db,
            unlockAllBadges: Self.unlockAllBadges(for: user),
            provisionalBadges: true)
        // El nivel también con lo pendiente: si no, subir de peldaño se celebraría tres
        // días después de haberlo hecho. Igual que las insignias, solo aquí — el marcador
        // y todo lo demás siguen enseñando el nivel de lo liquidado.
        let nivel = ContributionScore.level(for: perfil.gotes + perfil.pending)
        let userID = try user.requireID()
        // Las especiales **no** se adelantan como las demás: son concesiones guardadas, y
        // si ya está en la tabla es que se ganó de verdad. No hay nada que anticipar.
        let todas = perfil.badges.map { PublicBadge(family: $0.family, tier: $0.tier) }
            + (try await Self.specials(for: userID, on: req.db))
        return PublicBadges(badges: todas, level: nivel.key)
    }

    /// GET /users/:id/badges — insignias conseguidas por alguien. Pública.
    ///
    /// Quien ha apagado la gamificación devuelve la lista **vacía**, no un 404: la persona
    /// existe y su perfil se sigue viendo, lo que no hay son medallas que enseñar. Y vacía
    /// en vez de 204 porque quien llama siempre quiere pintar lo mismo —nada— y así no
    /// tiene que distinguir dos formas de decirlo.
    /// Resuelve `:userID` **por UUID o por username**, igual que el resto de `/users/:id`.
    ///
    /// Sin esto la ruta solo aceptaba el UUID y devolvía 400 con un nombre: la ficha de la
    /// fuente funcionaba (allí se tiene el UUID del creador) y el perfil público no, porque
    /// su URL es `/users/oriol_t`. Dos rutas hermanas resolviendo el parámetro de forma
    /// distinta es una trampa; se resuelve igual que `UserController.find`.
    @Sendable func badges(req: Request) async throws -> PublicBadges {
        guard let param = req.parameters.get("userID") else {
            throw Abort(.badRequest, reason: "Identificador de usuario no válido")
        }
        let user: User?
        if let id = UUID(uuidString: param) {
            user = try await User.find(id, on: req.db)
        } else {
            user = try await User.query(on: req.db).filter(\.$username == param).first()
        }
        guard let user else { throw AppError(.notFound, "user.notFound", "Usuario no encontrado") }
        // La clave lleva el UUID resuelto y no el parámetro: si no, el mismo perfil
        // ocuparía dos entradas y una podría quedarse vieja respecto de la otra.
        let userID = try user.requireID()
        let clave = "badges:\(userID)"
        if let cacheada = await Self.badgeCache.get(clave, as: PublicBadges.self) { return cacheada }

        // Mismas dos exclusiones que el ranking mensual y el pulso: el interruptor del
        // perfil tiene que valer en todos los sitios donde saldría el nombre, o no dice
        // la verdad. Una cuenta anonimizada tampoco luce medallas.
        var out = PublicBadges(badges: [], level: nil)
        if !user.gamificationOptOut && user.anonymizedAt == nil {
            let perfil = try await ContributionLedger.profile(
                for: userID, on: req.db, unlockAllBadges: Self.unlockAllBadges(for: user))
            // El nivel sale **siempre**, aunque sean cero gotas: la escalera empieza en
            // «Gota» y ahí está todo el mundo desde que se registra.
            //
            // Antes se callaba hasta tener la primera gota liquidada, y eso hacía daño
            // justo donde no tocaba: quien acaba de reseñar tiene sus gotas **pendientes**
            // durante 72 h, así que entraba en su perfil recién estrenado y no encontraba
            // nada. Un perfil en blanco no distingue «no ha hecho nada» de «lo hizo
            // anteayer y aún se está contando», y esas dos cosas no merecen la misma
            // pantalla. Con «Gota» al menos hay una escalera en la que ya estás.
            let todas = perfil.badges.map { PublicBadge(family: $0.family, tier: $0.tier) }
                + (try await Self.specials(for: userID, on: req.db))
            out = PublicBadges(badges: todas, level: perfil.level)
        }
        await Self.badgeCache.set(clave, out)
        return out
    }

    /// GET /gamification/guarded — las fuentes cuya última reseña es tuya.
    ///
    /// Va por libre y no dentro de `/gamification/me` a propósito: es una consulta con su
    /// propio coste y solo la pide quien abre esa pantalla, mientras que `/me` lo pide
    /// cualquiera que entre en su perfil. Y **no depende de la gamificación**: quien la
    /// apagó sigue cuidando fuentes, solo que sin puntos. Cuidar no es puntuar.
    @Sendable func guarded(req: Request) async throws -> [Guardianship.Guarded] {
        let user = try req.auth.require(User.self)
        return try await Guardianship.of(try user.requireID(), on: req.db)
    }

    /// GET /gamification/me — marcador, nivel, insignias e impacto del usuario autenticado.
    ///
    /// Devuelve 204 si el usuario ha apagado la gamificación. No es un error: es que no
    /// hay nada que enseñarle. Se corta aquí y no en el cliente para que apagarla también
    /// deje de gastar consultas.
    @Sendable func me(req: Request) async throws -> Response {
        let user = try req.auth.require(User.self)
        guard !user.gamificationOptOut else { return Response(status: .noContent) }
        let userID = try user.requireID()
        let desbloqueadas = Self.unlockAllBadges(for: user)
        var perfil = try await ContributionLedger.profile(
            for: userID, on: req.db, unlockAllBadges: desbloqueadas)

        // Lo que está **en camino**: el mismo cálculo que usa la felicitación, que sí
        // cuenta lo pendiente. Sin esto, durante las 72 h de la liquidación se veía el
        // confeti por una insignia y luego esa misma insignia en gris y con candado en la
        // vitrina; las dos pantallas tenían razón por separado y juntas parecían rotas.
        //
        // Son dos pasadas del perfil en vez de una. Se acepta: es una ruta autenticada,
        // por persona y sobre sus propios eventos, no una pública y cara. Fusionarlas
        // obligaría a partir en dos el cálculo del recuento dentro de `profile`, que es la
        // función más delicada de todo esto, para ahorrar una consulta que nadie nota.
        if !desbloqueadas {
            let conPendiente = try await ContributionLedger.profile(
                for: userID, on: req.db, provisionalBadges: true)
            let porFamilia = Dictionary(
                conPendiente.collection.map { ($0.family, $0.tier) }, uniquingKeysWith: { a, _ in a })
            perfil.collection = perfil.collection.map { casilla in
                var c = casilla
                // Solo si de verdad mejora lo que ya tiene: si coincide, no hay nada que
                // anunciar y un «en camino» redundante confunde más que ayuda.
                if let enCamino = porFamilia[casilla.family] ?? nil, enCamino != casilla.tier {
                    c.pendingTier = enCamino
                }
                return c
            }
        }

        // Fase 6: qué abre el nivel, y si no abre nada, por qué. Un botón desactivado sin
        // explicación se lee como una avería.
        perfil.grant = try await Capabilities.of(user, on: req.db)
        return try await perfil.encodeResponse(for: req)
    }
}
