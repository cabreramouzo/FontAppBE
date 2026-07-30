import Fluent
import Vapor

/// Confirmación ligera de que el estado reportado en un comentario "sigue igual".
/// No es un comentario: solo cuenta (👍) y refresca la frescura. Un usuario confirma
/// un mismo comentario una sola vez (constraint único comment_id + user_id).
final class FontConfirmation: Model, @unchecked Sendable {
    static let schema = "font_confirmations"

    @ID(key: .id) var id: UUID?
    @Parent(key: "comment_id") var comment: FontComment
    @Parent(key: "user_id") var user: User
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, commentID: UUID, userID: UUID) {
        self.id = id
        self.$comment.id = commentID
        self.$user.id = userID
    }
}
