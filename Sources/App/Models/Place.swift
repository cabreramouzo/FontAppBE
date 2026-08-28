import Fluent
import Vapor

/// Un núcleo de población: un pueblo, una villa o una ciudad.
///
/// ## Para qué existe
///
/// Para tener una **página por pueblo** («Fonts a Moià») que Google pueda indexar. Es el
/// único canal que sigue trayendo gente cuando dejas de empujar: hoy el sitemap ofrece 553
/// fuentes —las que ha tocado una persona— y nadie busca por el nombre de una fuente
/// suelta; se busca por el del pueblo.
///
/// ## Por qué NO es una columna en `fonts`
///
/// Lo natural sería `fonts.municipality`, y sale mucho más caro: hace falta un fichero de
/// **límites municipales**, una migración, y reprocesar 160.738 puntos cada vez que se
/// importa un país. Y una fuente en medio del monte no está «en» ningún municipio de forma
/// que le importe a nadie.
///
/// La página pregunta al revés —**qué fuentes hay cerca de este pueblo**— que es además la
/// pregunta que trae quien busca. Que una fuente entre dos pueblos salga en las dos
/// páginas no es un error: es cierto en las dos.
///
/// ## De dónde salen
///
/// De OpenStreetMap (ODbL), la misma fuente que la mayoría de las fuentes: los nodos
/// `place=city|town|village`. Para España son **8.790**, contra 8.131 municipios — hay
/// núcleos de más, y para esto es mejor: son más nombres por los que alguien busca.
final class Place: Model, @unchecked Sendable {
    static let schema = "places"

    @ID(key: .id) var id: UUID?
    /// Lo que va en la URL. Único: es la identidad de la página.
    @Field(key: "slug") var slug: String
    @Field(key: "name") var name: String
    /// `city`, `town` o `village`. Ordena las páginas y decide el radio.
    @Field(key: "kind") var kind: String
    @Field(key: "latitude") var latitude: Double
    @Field(key: "longitude") var longitude: Double
    /// País y demarcación, heredados de la fuente clasificada más cercana. Sirven para el
    /// título («Fonts a Moià, Barcelona») y para agrupar. Pueden faltar.
    @OptionalField(key: "country") var country: String?
    @OptionalField(key: "region") var region: String?
    /// Cuántas fuentes hay en su radio, calculado al importar. Es lo que decide **si la
    /// página existe**: un pueblo sin ninguna fuente no tiene nada que enseñar, y una
    /// página vacía indexada hace daño en vez de bien.
    @Field(key: "font_count") var fontCount: Int

    init() {}

    init(slug: String, name: String, kind: String, latitude: Double, longitude: Double) {
        self.slug = slug
        self.name = name
        self.kind = kind
        self.latitude = latitude
        self.longitude = longitude
        self.fontCount = 0
    }

    /// Cuántos kilómetros alrededor se consideran «de este pueblo».
    ///
    /// Más en una ciudad que en una aldea, porque el punto de OSM es el centro y una ciudad
    /// se extiende kilómetros. No es una frontera: es el radio de «cerca de».
    var radioKm: Double {
        switch kind {
        case "city": return 6
        case "town": return 4
        default: return 3
        }
    }
}
