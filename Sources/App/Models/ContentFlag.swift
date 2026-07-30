import Fluent
import Vapor

/// Denuncia de contenido inapropiado (una reseña o una fuente) hecha por un usuario.
/// La revisan los admins. `targetType` distingue a qué apunta `targetID`.
final class ContentFlag: Model, @unchecked Sendable {
    static let schema = "content_flags"

    @ID(key: .id) var id: UUID?
    @OptionalParent(key: "flagger_id") var flagger: User?
    @Field(key: "target_type") var targetType: String // "comment" | "font"
    @Field(key: "target_id") var targetID: UUID
    @OptionalField(key: "reason") var reason: String?
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, flaggerID: UUID?, targetType: String, targetID: UUID, reason: String? = nil) {
        self.id = id
        self.$flagger.id = flaggerID
        self.targetType = targetType
        self.targetID = targetID
        self.reason = reason
    }
}
