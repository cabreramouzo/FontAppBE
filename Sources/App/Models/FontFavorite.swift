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
