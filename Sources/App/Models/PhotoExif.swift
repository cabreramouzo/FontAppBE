import Fluent
import Vapor

/// Lo que el móvil dejó escrito dentro de una foto: cuándo se hizo y dónde.
///
/// ## Por qué existe una tabla y no unas columnas
///
/// Porque hay cuatro sitios de los que puede colgar una foto —la portada de una fuente,
/// una reseña, la galería y los documentos— y todos pasan por el **mismo** `POST /images`.
/// Guardarlo aquí es una migración en vez de cuatro, funciona para el sitio que se añada
/// mañana sin tocar nada, y deja los datos personales **en un solo lugar** por si algún
/// día hay que purgarlos.
///
/// ## Qué vale este dato y qué no
///
/// Lo afirma el cliente y **no se puede verificar**: cualquier editor reescribe el EXIF en
/// diez segundos. Es la misma categoría que `fonts.queued_offline`, y por tanto la misma
/// regla — sirve para que un moderador mire, **nunca para anular puntos por sí solo**.
/// Ningún automatismo debe leer esta tabla.
///
/// Y va a faltar más veces de las que va a estar: lo que pasa por WhatsApp, Telegram o
/// Instagram llega sin EXIF, las capturas no tienen y iOS lo quita al compartir según los
/// ajustes. Por eso la fila **se guarda siempre**, aunque venga toda vacía: así «no hay
/// fila» significa «se subió antes de que existiera esto» y no se confunde con «esta foto
/// no traía nada», que es lo normal y no es sospechoso de nada.
///
/// La comparación que de verdad interesa no necesita ni EXIF completo: `created_at` es
/// cuándo se subió y `taken_at` cuándo se hizo. La distancia entre las dos es el dato.
final class PhotoExif: Model, @unchecked Sendable {
    static let schema = "photo_exif"

    @ID(key: .id) var id: UUID?

    /// El UUID del nombre del fichero, que es la única parte estable de la dirección: el
    /// prefijo cambia entre el disco local (`/uploads/…`) y R2 (`https://pub-….r2.dev/…`),
    /// y ya hemos cambiado de almacenamiento una vez.
    @Field(key: "photo_id") var photoID: UUID

    /// `DateTimeOriginal` del EXIF: cuándo dice la cámara que se hizo la foto.
    @OptionalField(key: "taken_at") var takenAt: Date?
    @OptionalField(key: "latitude") var latitude: Double?
    @OptionalField(key: "longitude") var longitude: Double?

    /// Quién la subió. `setNull` al borrar la cuenta, como el resto.
    @OptionalParent(key: "uploaded_by") var uploader: User?

    /// Cuándo se subió. Es la mitad de la comparación, no un dato de auditoría.
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(photoID: UUID, takenAt: Date?, latitude: Double?, longitude: Double?, uploaderID: UUID?) {
        self.photoID = photoID
        self.takenAt = takenAt
        self.latitude = latitude
        self.longitude = longitude
        self.$uploader.id = uploaderID
    }

    /// Saca el identificador de una dirección de imagen, venga de donde venga.
    static func photoID(fromURL url: String) -> UUID? {
        guard let ultimo = url.split(separator: "/").last else { return nil }
        let sinExtension = ultimo.split(separator: ".").first.map(String.init) ?? String(ultimo)
        return UUID(uuidString: sinExtension)
    }
}
