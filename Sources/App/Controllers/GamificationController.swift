import Fluent
import Vapor

/// Fase 3: enseñar la gamificación en el perfil, y nada más. Sin rankings todavía —
/// primero conviene ver si la gente entiende el marcador sin que nadie se lo explique.
///
/// Solo hay lectura de lo propio. No existe endpoint para ver los puntos de otra persona:
/// mientras no haya rankings no hace falta, y no publicar lo que no hace falta evita tener
/// que decidir hoy cuánto de esto es público (que es una de las decisiones pendientes).
struct GamificationController: RouteCollection {
    func boot(routes: any RoutesBuilder) throws {
        let g = routes.grouped("gamification").grouped(UserToken.authenticator(), User.guardMiddleware())
        g.get("me", use: me)
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
