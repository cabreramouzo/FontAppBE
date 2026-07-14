import Fluent
import Vapor

/// Un comentario de un usuario sobre una fuente.
final class FontComment: Model, Content, @unchecked Sendable {
    static let schema = "font_comments"

    @ID(key: .id) var id: UUID?
    @Parent(key: "font_id") var font: Font
    @OptionalParent(key: "user_id") var user: User?
    @Field(key: "body") var body: String
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, fontID: UUID, userID: UUID? = nil, body: String) {
        self.id = id
        self.$font.id = fontID
        self.$user.id = userID
        self.body = body
    }
}
