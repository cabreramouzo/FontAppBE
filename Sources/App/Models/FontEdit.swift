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

    init(_ font: Font) {
        self.name = font.name
        self.description = font.description
        self.source = font.source
        self.drinkable = font.drinkable
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
