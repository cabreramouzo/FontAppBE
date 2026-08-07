import Fluent
import Vapor

/// Qué tipo de punto de agua es (calcado de los tags de OpenStreetMap).
enum WaterSource: String, Codable, Sendable, CaseIterable {
    case tap        // amenity=drinking_water / man_made=water_tap (grifo/fuente pública)
    case spring     // natural=spring (manantial)
    case well       // man_made=water_well (pozo)
    case fountain   // amenity=fountain (ornamental)
    case other
}

/// Potabilidad, calcada del tag OSM `drinking_water` (ausente ⇒ desconocido/null).
enum Drinkable: String, Codable, Sendable, CaseIterable {
    case yes
    case no
    case conditional
}

/// Una fuente de agua ("font" = fuente). Se localiza por latitud/longitud.
final class Font: Model, Content, @unchecked Sendable {
    static let schema = "fonts"

    @ID(key: .id) var id: UUID?
    @Field(key: "name") var name: String
    @Field(key: "latitude") var latitude: Double
    @Field(key: "longitude") var longitude: Double
    @OptionalField(key: "image") var image: String?
    @OptionalField(key: "description") var description: String?
    @OptionalField(key: "source") var source: WaterSource?
    @OptionalField(key: "drinkable") var drinkable: Drinkable?
    // País y región (admin-1), para futuras funciones por zona (admins por región,
    // filtros). Nullable: aún sin poblar; se derivará de lat/lon más adelante.
    @OptionalField(key: "country") var country: String?
    @OptionalField(key: "region") var region: String?
    // Quién la creó (null para las importadas de OSM). setNull al borrar el usuario.
    @OptionalParent(key: "created_by") var creator: User?
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(
        id: UUID? = nil,
        name: String,
        latitude: Double,
        longitude: Double,
        image: String? = nil,
        description: String? = nil,
        source: WaterSource? = nil,
        drinkable: Drinkable? = nil,
        country: String? = nil,
        region: String? = nil,
        creatorID: UUID? = nil
    ) {
        self.id = id
        self.name = name
        self.latitude = latitude
        self.longitude = longitude
        self.image = image
        self.description = description
        self.source = source
        self.drinkable = drinkable
        self.country = country
        self.region = region
        self.$creator.id = creatorID
    }
}
