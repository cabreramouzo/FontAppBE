import Fluent
import Vapor

/// Qué tipo de punto de agua es. La distinción clave para quien camina es el ORIGEN
/// del agua (red municipal vs acuífero) y si el manantial está CAPTADO (con caño):
/// - urbana: caudal garantizado y agua tratada.
/// - natural captada: caudal estacional, potabilidad no garantizada, pero bebible.
/// - manantial sin captar: puede ser un rezume del que ni se llena una botella.
enum WaterSource: String, Codable, Sendable, CaseIterable {
    case tap        // amenity=drinking_water / man_made=water_tap: fuente urbana, de red
    case mountain   // manantial CAPTADO (caño/pila): la "font de muntanya" clásica
    case spring     // natural=spring: manantial sin captar, brota solo
    case well       // man_made=water_well (pozo)
    case fountain   // amenity=fountain (ornamental)
    case other
}

/// Potabilidad. `yes`/`no`/`conditional` son calcadas del tag OSM `drinking_water`
/// (ausente ⇒ desconocido/null); `untreated` es nuestra y NO la escribe el importador.
///
/// `untreated` no es un matiz de `conditional`, es otra cosa: `conditional` es una
/// salvedad sobre CUÁNDO o CÓMO se bebe (hiérvela, solo en temporada) y `untreated`
/// dice de DÓNDE viene el agua — subterránea, sin tratar y sin control sanitario.
/// Una fuente puede ser no tratada y estar declarada potable a la vez.
///
/// Existe porque el hueco que le quedaba a una font de muntanya era `nil`, o sea la
/// AUSENCIA de dato, y lo que su vecino sí puede afirmar es un dato: nadie la trata.
/// Medido antes de añadirla: el 83,7 % de las fuentes de montaña y manantial estaban
/// sin potabilidad, y `conditional` la llevaban 5 de cada 5.100.
enum Drinkable: String, Codable, Sendable, CaseIterable {
    case yes
    case no
    case conditional
    case untreated
}

/// Una fuente de agua ("font" = fuente). Se localiza por latitud/longitud.
final class Font: Model, Content, @unchecked Sendable {
    static let schema = "fonts"

    @ID(key: .id) var id: UUID?
    /// El nombre **propio** de la fuente, o `nil` si no tiene.
    ///
    /// Es opcional a propósito, y esto costó entenderlo. Al importar de OSM, tres de cada
    /// cuatro puntos vienen sin `name`, y durante meses se les puso un relleno en el idioma
    /// del territorio: «Font», «Fuente», «Fontaine», «Vattenpost». Parecía correcto —el dato
    /// en el idioma de donde sale— y confunde **el idioma del territorio con el de quien
    /// lee**, que son cosas distintas: un dato no tiene idioma, una interfaz sí. Resultado
    /// medido: el 47 % del mapa mostraba una palabra que el lector podía no entender, y un
    /// español en Estocolmo veía «Vattenpost» 1.310 veces.
    ///
    /// Ahora «no tiene nombre» es lo que se guarda —que es la verdad— y el rótulo lo compone
    /// quien pinta, con `source` y el idioma del lector. Los topónimos de verdad
    /// («Pilgrimskällan», «Font de la Teula») **no se tocan**: son nombres propios, y
    /// traducirlos impediría preguntar por la fuente o reconocer su cartel.
    @OptionalField(key: "name") var name: String?

    /// Los rellenos que se usaron como nombre antes de que `name` fuera opcional.
    ///
    /// Vive aquí, y no dentro del comando que los limpia, porque hay **dos** sitios que la
    /// necesitan: `clear-placeholder-names` para vaciarlos y `import-geojson` para decidir
    /// si el topónimo del ICGC mejora lo que hay. Ese segundo tenía su propia copia, y ya se
    /// habían separado: la suya llevaba «deu» y le faltaban los rellenos de Francia,
    /// Portugal y los nórdicos.
    static let placeholderNames: Set<String> = [
        "Font", "Manantial",                       // por defecto del importador
        "Fuente", "Fontaine", "Source",            // España, Francia
        "Fonte", "Nascente",                       // Portugal
        "Vattenpost", "Källa",                     // Suecia
        "Vesiposti", "Lähde",                      // Finlandia
    ]
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

    /// Creada sin cobertura y enviada después por la bandeja de salida. Lo afirma el
    /// cliente y no se puede verificar: por eso solo paga insignia, nunca gotas.
    @Field(key: "queued_offline") var queuedOffline: Bool

    /// Es la misma agua que otra ficha. Apunta a la buena; ésta se esconde del mapa.
    @OptionalParent(key: "duplicate_of") var duplicateOf: Font?
    /// Retirada porque ya no existe sobre el terreno. Nulo = sigue en pie.
    @OptionalField(key: "retired_at") var retiredAt: Date?
    @OptionalParent(key: "retired_by") var retiredBy: User?

    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    /// ¿Sale en el mapa? Falso si es duplicada de otra o si se ha retirado.
    var isVisible: Bool { $duplicateOf.id == nil && retiredAt == nil }

    /// Consulta de fuentes **que salen al público**: sin duplicadas ni retiradas.
    ///
    /// Existe para que el filtro esté escrito una vez y no seis. Toda lectura pública que
    /// devuelva varias fuentes tiene que partir de aquí — mapa, listado, cercanía, rutas.
    /// La ficha individual (`show`) es la excepción a propósito: se llega por un enlace
    /// viejo y hay que poder ver **por qué** ya no está, no un 404.
    static func visible(on db: any Database) -> QueryBuilder<Font> {
        Font.query(on: db).filter(\.$duplicateOf.$id == nil).filter(\.$retiredAt == nil)
    }

    /// La misma condición en SQL crudo, para las consultas que no pasan por Fluent.
    static let visibleSQL = "duplicate_of IS NULL AND retired_at IS NULL"

    init() {}

    init(
        id: UUID? = nil,
        name: String?,
        latitude: Double,
        longitude: Double,
        image: String? = nil,
        description: String? = nil,
        source: WaterSource? = nil,
        drinkable: Drinkable? = nil,
        country: String? = nil,
        region: String? = nil,
        creatorID: UUID? = nil,
        queuedOffline: Bool = false
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
        self.queuedOffline = queuedOffline
    }

    // MARK: - Salida

    /// Qué sale por la API. Fluent serializa **todas** las columnas del modelo, así que
    /// `queued_offline` —un dato interno de gamificación— se estaba colando en cada
    /// `GET /fonts`. Aquí se escribe la lista a mano: lo que no esté nombrado no sale.
    ///
    /// Es un codificador y no un DTO aparte porque el modelo ya se devuelve tal cual
    /// desde media docena de sitios y la forma del JSON **no cambia** — ni un campo, ni
    /// un nombre, ni un `null`. Los opcionales van con `encode` y no `encodeIfPresent`
    /// justamente por eso: omitirlos los convertiría en `undefined` en el cliente, que es
    /// el fallo que ya nos costó dos pantallas en blanco (`tier`, `fromDays`).
    ///
    /// No se llama `CodingKeys` a posta: con ese nombre el compilador puede intentar
    /// sintetizar también el `init(from:)`, y quien sabe decodificar un modelo de Fluent
    /// con sus envoltorios de propiedad es Fluent, no la síntesis.
    ///
    /// Al añadir una columna nueva hay que decidir aquí si es pública. Ese es el punto.
    private enum PublicKey: String, CodingKey {
        case id, name, latitude, longitude, image, description
        case source, drinkable, country, region, creator, createdAt
        // Por qué esta ficha ya no sale en el mapa. Salen **siempre**, con `null` cuando
        // está en pie: la ficha se llega a ver por un enlace viejo y tiene que poder
        // explicar por qué el punto no aparece, en vez de dar un 404 o, peor, parecer
        // normal. Explícitos, como todo opcional de esta API.
        case duplicateOf, retiredAt
    }

    /// El padre opcional sale como `{"id": …}`, igual que lo serializaba Fluent.
    ///
    /// Con el codificador sintetizado salía `{}` cuando no hay creador: los opcionales
    /// se escriben con `encodeIfPresent` y `nil` desaparece. Es el mismo tropiezo de
    /// `tier` y `fromDays`, y aquí habría roto las ~6.700 fuentes importadas —
    /// justamente las que no tienen creador. De ahí el `encode` explícito.
    private struct CreatorRef: Encodable {
        let id: UUID?
        func encode(to encoder: any Encoder) throws {
            var c = encoder.container(keyedBy: Key.self)
            try c.encode(id, forKey: .id)
        }
        private enum Key: String, CodingKey { case id }
    }

    func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: PublicKey.self)
        try c.encode(id, forKey: .id)
        try c.encode(name, forKey: .name)
        try c.encode(latitude, forKey: .latitude)
        try c.encode(longitude, forKey: .longitude)
        try c.encode(image, forKey: .image)
        try c.encode(description, forKey: .description)
        try c.encode(source, forKey: .source)
        try c.encode(drinkable, forKey: .drinkable)
        try c.encode(country, forKey: .country)
        try c.encode(region, forKey: .region)
        try c.encode(CreatorRef(id: $creator.id), forKey: .creator)
        try c.encode(createdAt, forKey: .createdAt)
        try c.encode($duplicateOf.id, forKey: .duplicateOf)
        try c.encode(retiredAt, forKey: .retiredAt)
    }
}
