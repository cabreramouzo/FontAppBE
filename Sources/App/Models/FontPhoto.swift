import Fluent
import Vapor

/// Qué es esta imagen. **No todas las fotos de una fuente son fotos de la fuente.**
///
/// La distinción nace de un caso real: un geólogo aportó la foto de un informe de
/// salubridad del agua. Guardado como «segunda foto» acabaría compitiendo por la portada
/// con el primer plano del caño, que es lo que de verdad sirve para reconocer la fuente
/// al llegar. Son cosas distintas y se etiquetan distinto.
enum PhotoKind: String, Codable, Sendable, CaseIterable {
    /// Otro ángulo de la fuente. Es la única que puede ser portada.
    case fountain
    /// Informe, cartel, aviso del ayuntamiento. **Nunca** es portada.
    case document
    /// El acceso, el camino, dónde aparcar.
    case context
}

/// Una imagen secundaria de una fuente.
///
/// `fonts.image` **se queda como está**: sigue siendo la portada y sigue siendo una
/// columna, no un join. Es una desnormalización a propósito — `GET /fonts` y el mapa
/// devuelven miles de fuentes y no pueden pagar una consulta por la galería de cada una.
/// Las secundarias se piden aparte y solo cuando alguien abre «otras fotos».
final class FontPhoto: Model, Content, @unchecked Sendable {
    static let schema = "font_photos"

    @ID(key: .id) var id: UUID?
    @Parent(key: "font_id") var font: Font
    @Field(key: "url") var url: String
    @Field(key: "kind") var kind: PhotoKind
    /// Quién la subió. Opcional y `setNull`: borrar la cuenta no borra la aportación.
    @OptionalParent(key: "uploaded_by") var uploader: User?
    /// Una línea de contexto. En un documento es donde va «Análisis ACA, marzo 2026».
    @OptionalField(key: "caption") var caption: String?
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, fontID: UUID, url: String, kind: PhotoKind,
         uploaderID: UUID? = nil, caption: String? = nil) {
        self.id = id
        self.$font.id = fontID
        self.url = url
        self.kind = kind
        self.$uploader.id = uploaderID
        self.caption = caption
    }
}
