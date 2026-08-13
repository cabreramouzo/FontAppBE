import Fluent
import Vapor

/// Instantánea de los campos de información editables de una fuente (los que
/// cualquier usuario puede corregir estilo wiki). Se guarda antes y después de
/// cada edición para poder mostrar el cambio y revertirlo.
struct FontInfoSnapshot: Codable, Sendable, Equatable {
    var name: String
    var description: String?
    var source: WaterSource?
    var drinkable: Drinkable?
    // La ubicación solo la puede tocar el creador o un admin, pero también queda
    // registrada: mover un pin 200 m es un cambio tan reversible como renombrarlo.
    // Opcionales porque las ediciones guardadas ANTES de esto no las tienen (el
    // snapshot es JSON en la BD: añadir campos opcionales no rompe lo ya escrito).
    var latitude: Double?
    var longitude: Double?

    init(_ font: Font) {
        self.name = font.name
        self.description = font.description
        self.source = font.source
        self.drinkable = font.drinkable
        self.latitude = font.latitude
        self.longitude = font.longitude
    }
}

/// Registro de una edición de la información de una fuente (historial estilo
/// "changeset" de OSM). Los cambios se aplican al instante; esto deja rastro de
/// quién cambió qué y permite al admin revertir.
final class FontEdit: Model, @unchecked Sendable {
    static let schema = "font_edits"

    @ID(key: .id) var id: UUID?
    @Parent(key: "font_id") var font: Font
    // Quién editó (null si se borra la cuenta). setNull al borrar el usuario.
    @OptionalParent(key: "editor_id") var editor: User?
    @Field(key: "before") var before: FontInfoSnapshot
    @Field(key: "after") var after: FontInfoSnapshot
    // Cuándo un admin marcó esta edición como "revisada" (✓). null = pendiente en el
    // panel. Es solo triaje: no cambia la fuente (los cambios ya están aplicados).
    @OptionalField(key: "reviewed_at") var reviewedAt: Date?
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, fontID: UUID, editorID: UUID?, before: FontInfoSnapshot, after: FontInfoSnapshot) {
        self.id = id
        self.$font.id = fontID
        self.$editor.id = editorID
        self.before = before
        self.after = after
    }
}
