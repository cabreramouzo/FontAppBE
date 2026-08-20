import Fluent
import Vapor

/// Guardar / dejar de guardar una fuente como favorita, y consultar su estado.
/// Rutas bajo `/fonts/:fontID/favorite`. La lista de favoritos del usuario vive
/// en `/auth/me/favorites` (ver AuthController).
struct FontFavoriteController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let favorite = routes.grouped("fonts", ":fontID", "favorite")
        // Estado con auth OPCIONAL: público devuelve el recuento; con token añade
        // si el usuario ya la tiene guardada (favoritedByMe).
        favorite.grouped(UserToken.authenticator()).get(use: status)
        let auth = favorite.grouped(UserToken.authenticator(), User.guardMiddleware())
        auth.post(use: add)
        auth.delete(use: remove)
    }

    /// GET /fonts/:fontID/favorite — recuento y (si hay token) si el usuario la guardó.
    @Sendable func status(req: Request) async throws -> FavoriteStatus {
        let fontID = try await requireFontID(req)
        return try await Self.build(fontID: fontID, viewer: req.auth.get(User.self)?.id, on: req.db)
    }

    /// POST /fonts/:fontID/favorite — la guarda. Idempotente (constraint único).
    @Sendable func add(req: Request) async throws -> FavoriteStatus {
        let user = try req.auth.require(User.self)
        let fontID = try await requireFontID(req)
        let userID = try user.requireID()
        let already = try await FontFavorite.query(on: req.db)
            .filter(\.$font.$id == fontID)
            .filter(\.$user.$id == userID)
            .first()
        if already == nil {
            try await FontFavorite(fontID: fontID, userID: userID).save(on: req.db)
        }
        return try await Self.build(fontID: fontID, viewer: userID, on: req.db)
    }

    /// DELETE /fonts/:fontID/favorite — deja de guardarla.
    @Sendable func remove(req: Request) async throws -> FavoriteStatus {
        let user = try req.auth.require(User.self)
        let fontID = try await requireFontID(req)
        let userID = try user.requireID()
        try await FontFavorite.query(on: req.db)
            .filter(\.$font.$id == fontID)
            .filter(\.$user.$id == userID)
            .delete()
        return try await Self.build(fontID: fontID, viewer: userID, on: req.db)
    }

    /// Verifica que la fuente existe (404 si no) y devuelve su id.
    private func requireFontID(_ req: Request) async throws -> UUID {
        guard let font = try await Font.find(req.parameters.get("fontID"), on: req.db) else {
            throw AppError(.notFound, "font.notFound", "No existe la fuente indicada")
        }
        return try font.requireID()
    }

    /// Construye el estado de favoritos de una fuente (recuento + si el que mira la guardó).
    static func build(fontID: UUID, viewer: UUID?, on db: Database) async throws -> FavoriteStatus {
        let count = try await FontFavorite.query(on: db).filter(\.$font.$id == fontID).count()
        var mine = false
        if let viewer {
            mine = try await FontFavorite.query(on: db)
                .filter(\.$font.$id == fontID)
                .filter(\.$user.$id == viewer)
                .first() != nil
        }
        return FavoriteStatus(favorited: mine, count: count)
    }
}

/// Estado de favoritos de una fuente para el cliente.
struct FavoriteStatus: Content {
    /// Si el usuario autenticado la tiene guardada (para el toggle del botón).
    let favorited: Bool
    /// Cuántos usuarios la han guardado.
    let count: Int
}
