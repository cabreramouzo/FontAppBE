import Fluent
import Vapor

/// Un problema reportado sobre una fuente concreta, por un usuario.
final class FontReport: Model, Content, @unchecked Sendable {
    static let schema = "font_reports"

    @ID(key: .id) var id: UUID?
    @Parent(key: "font_id") var font: Font
    @OptionalParent(key: "user_id") var user: User?
    @Field(key: "message") var message: String
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, fontID: UUID, userID: UUID? = nil, message: String) {
        self.id = id
        self.$font.id = fontID
        self.$user.id = userID
        self.message = message
    }
}
