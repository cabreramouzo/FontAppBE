import Fluent
import Vapor

/// Una actualización de estado / reseña de un usuario sobre una fuente:
/// texto y, opcionalmente, estrellas (1-5), estado del agua y foto.
final class FontComment: Model, Content, @unchecked Sendable {
    static let schema = "font_comments"

    @ID(key: .id) var id: UUID?
    @Parent(key: "font_id") var font: Font
    @OptionalParent(key: "user_id") var user: User?
    @Field(key: "body") var body: String
    @OptionalField(key: "rating") var rating: Int?
    @OptionalField(key: "water_status") var waterStatus: String?
    @OptionalField(key: "image") var image: String?

    /// Creada sin cobertura y enviada después por la bandeja de salida. Lo afirma el
    /// cliente y no se puede verificar: por eso solo paga insignia, nunca gotas.
    @Field(key: "queued_offline") var queuedOffline: Bool

    /// Approximate distance (m) from the reviewer to the fountain when the review was
    /// written, only when clearly more than a kilometre. Client-asserted and for moderators
    /// only: it is NOT in `CommentResponse`. See `AddRemoteDistanceToFontComment`.
    @OptionalField(key: "remote_distance_m") var remoteDistanceM: Int?
    /// When a moderator looked at this remote review and took it out of the lane.
    @OptionalField(key: "remote_checked_at") var remoteCheckedAt: Date?

    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(
        id: UUID? = nil,
        fontID: UUID,
        userID: UUID? = nil,
        body: String,
        rating: Int? = nil,
        waterStatus: String? = nil,
        image: String? = nil,
        queuedOffline: Bool = false
    ) {
        self.id = id
        self.$font.id = fontID
        self.$user.id = userID
        self.body = body
        self.rating = rating
        self.waterStatus = waterStatus
        self.image = image
        self.queuedOffline = queuedOffline
    }
}
