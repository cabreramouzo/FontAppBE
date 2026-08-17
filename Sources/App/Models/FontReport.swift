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
    /// Cuándo se dio por resuelta, y quién. Nulo = sigue abierta.
    ///
    /// Resolver en vez de borrar: que la fuente estuvo rota y se arregló es parte de su
    /// historia, y es lo que mira quien duda si acercarse.
    @OptionalField(key: "resolved_at") var resolvedAt: Date?
    @OptionalParent(key: "resolved_by") var resolver: User?

    init() {}

    init(id: UUID? = nil, fontID: UUID, userID: UUID? = nil, message: String) {
        self.id = id
        self.$font.id = fontID
        self.$user.id = userID
        self.message = message
    }
}
