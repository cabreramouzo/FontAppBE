import Fluent
import Vapor

/// Una fuente guardada ("favorita") por un usuario, para tenerla a mano en su perfil.
/// Un usuario guarda una misma fuente una sola vez (constraint único font_id + user_id).
final class FontFavorite: Model, @unchecked Sendable {
    static let schema = "font_favorites"

    @ID(key: .id) var id: UUID?
    @Parent(key: "font_id") var font: Font
    @Parent(key: "user_id") var user: User
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, fontID: UUID, userID: UUID) {
        self.id = id
        self.$font.id = fontID
        self.$user.id = userID
    }
}

extension FontFavorite {
    /// Marca la fuente como favorita si no lo estaba ya.
    ///
    /// Idempotente: lo llaman el botón de la ficha y también el alta de una incidencia
    /// (ver `FontReportController.create`), y una segunda incidencia sobre la misma
    /// fuente no debe crear una fila repetida.
    ///
    /// Ojo con lo que **no** hace: no recuerda que alguien la quitara a mano, así que
    /// reportar otra cosa en esa fuente la vuelve a marcar. Es aceptable —quien vuelve a
    /// avisar quiere que le respondan— pero para que dejara de serlo haría falta guardar
    /// el «no la quiero», que hoy no existe.
    static func follow(fontID: UUID, userID: UUID, on db: any Database) async throws {
        let yaEsta = try await FontFavorite.query(on: db)
            .filter(\.$font.$id == fontID)
            .filter(\.$user.$id == userID)
            .first() != nil
        guard !yaEsta else { return }
        try await FontFavorite(fontID: fontID, userID: userID).save(on: db)
    }
}
