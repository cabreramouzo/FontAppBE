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

    func boot(routes: any RoutesBuilder) throws {
        let g = routes.grouped("gamification").grouped(UserToken.authenticator(), User.guardMiddleware())
        g.get("me", use: me)

        // Cuelga de `users` porque es un dato **de la persona**, no del sistema de puntos:
        // así vive al lado de `/users/:id/fonts` y `/users/:id/comments`, que es donde se
        // va a buscar. Pública y con el mismo límite que el resto de rutas públicas caras.
        routes.grouped("users")
            .grouped(RateLimitMiddleware(scope: "badges", max: 120, window: 60 * 60))
            .get(":userID", "badges", use: badges)
    }

    /// Lo que se publica de otra persona: la familia y el grado, nada más.
    ///
    /// Sin `progress` ni `threshold`, que sí lleva la vitrina propia. «Tiene el oro de
    /// Descubridor» dice que ha puesto más de 200 fuentes en el mapa, y esas fuentes ya
    /// se ven una a una en `/users/:id/fonts`. «Lleva 237» es un número sobre la persona
    /// que no aporta nada a quien está mirando una fuente.
    struct PublicBadge: Content, Sendable {
        let family: String
        let tier: String
    }

    struct PublicBadges: Content, Sendable {
        let badges: [PublicBadge]
    }

    /// GET /users/:id/badges — insignias conseguidas por alguien. Pública.
    ///
    /// Quien ha apagado la gamificación devuelve la lista **vacía**, no un 404: la persona
    /// existe y su perfil se sigue viendo, lo que no hay son medallas que enseñar. Y vacía
    /// en vez de 204 porque quien llama siempre quiere pintar lo mismo —nada— y así no
    /// tiene que distinguir dos formas de decirlo.
    @Sendable func badges(req: Request) async throws -> PublicBadges {
        guard let userID = req.parameters.get("userID", as: UUID.self) else {
            throw Abort(.badRequest, reason: "Identificador de usuario no válido")
        }
        let clave = "badges:\(userID)"
        if let cacheada = await Self.badgeCache.get(clave, as: PublicBadges.self) { return cacheada }

        guard let user = try await User.find(userID, on: req.db) else {
            throw Abort(.notFound, reason: "Usuario no encontrado")
        }
        // Mismas dos exclusiones que el ranking mensual y el pulso: el interruptor del
        // perfil tiene que valer en todos los sitios donde saldría el nombre, o no dice
        // la verdad. Una cuenta anonimizada tampoco luce medallas.
        var out = PublicBadges(badges: [])
        if !user.gamificationOptOut && user.anonymizedAt == nil {
            let perfil = try await ContributionLedger.profile(for: userID, on: req.db)
            out = PublicBadges(badges: perfil.badges.map { PublicBadge(family: $0.family, tier: $0.tier) })
        }
        await Self.badgeCache.set(clave, out)
        return out
    }

    /// GET /gamification/me — marcador, nivel, insignias e impacto del usuario autenticado.
    ///
    /// Devuelve 204 si el usuario ha apagado la gamificación. No es un error: es que no
    /// hay nada que enseñarle. Se corta aquí y no en el cliente para que apagarla también
    /// deje de gastar consultas.
    @Sendable func me(req: Request) async throws -> Response {
        let user = try req.auth.require(User.self)
        guard !user.gamificationOptOut else { return Response(status: .noContent) }
        var perfil = try await ContributionLedger.profile(for: try user.requireID(), on: req.db)
        // Fase 6: qué abre el nivel, y si no abre nada, por qué. Un botón desactivado sin
        // explicación se lee como una avería.
        perfil.grant = try await Capabilities.of(user, on: req.db)
        return try await perfil.encodeResponse(for: req)
    }
}
