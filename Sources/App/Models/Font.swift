import Fluent
import Vapor

/// Una fuente de agua ("font" = fuente). Se localiza por latitud/longitud.
final class Font: Model, Content, @unchecked Sendable {
    static let schema = "fonts"

    @ID(key: .id) var id: UUID?
    @Field(key: "name") var name: String
    @Field(key: "latitude") var latitude: Double
    @Field(key: "longitude") var longitude: Double
    @OptionalField(key: "image") var image: String?
    @OptionalField(key: "description") var description: String?
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, name: String, latitude: Double, longitude: Double, image: String? = nil, description: String? = nil) {
        self.id = id
        self.name = name
        self.latitude = latitude
        self.longitude = longitude
        self.image = image
        self.description = description
    }
}
