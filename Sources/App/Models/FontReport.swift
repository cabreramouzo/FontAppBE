import Fluent
import Vapor

/// Un comentario sobre una fuente, que puede estar marcado como **incidencia**.
///
/// La tabla se sigue llamando `font_reports` y el modelo `FontReport`: renombrar en trece
/// ficheros y una migración de datos no arregla nada que no arregle esta bandera, y el
/// nombre viejo no engaña a nadie que lea el `isIncident` que tiene al lado. Misma regla
/// que con `guard.showAll` o `FontFavorite`.
final class FontReport: Model, Content, @unchecked Sendable {
    static let schema = "font_reports"

    @ID(key: .id) var id: UUID?
    @Parent(key: "font_id") var font: Font
    @OptionalParent(key: "user_id") var user: User?
    @Field(key: "message") var message: String
    /// Si esto es una avería que alguien tiene que arreglar, o solo un comentario.
    ///
    /// **Es lo que da sentido al resto**: solo lo marcado entra en la cola, cuenta como
    /// «incidencia abierta», sale en novedades, paga gotas de incidencia, avisa con
    /// urgencia y se puede dar por resuelta. Sin marcar es un comentario y no toca ningún
    /// contador — que es justo lo que hacía falta para que el número que se le enseña a
    /// un ayuntamiento signifique algo.
    /// De qué comentario cuelga, si es una respuesta. Ver `AddParentToFontReport`: un solo
    /// nivel, y al borrar el padre la respuesta se queda suelta en vez de desaparecer.
    @OptionalParent(key: "parent_id") var parent: FontReport?
    @Field(key: "is_incident") var isIncident: Bool
    /// Qué clase de avería, si lo es. Ver `IncidentKind`.
    @OptionalField(key: "incident_kind") var incidentKind: IncidentKind?
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?
    /// Cuándo se corrigió el texto, si se corrigió. Ver `AddEditedAtToFontReport`: es una
    /// columna propia y no un `updated_at`, para que signifique **solo** eso.
    @OptionalField(key: "edited_at") var editedAt: Date?
    /// Cuándo se dio por resuelta, y quién. Nulo = sigue abierta.
    ///
    /// Resolver en vez de borrar: que la fuente estuvo rota y se arregló es parte de su
    /// historia, y es lo que mira quien duda si acercarse.
    @OptionalField(key: "resolved_at") var resolvedAt: Date?
    @OptionalParent(key: "resolved_by") var resolver: User?

    init() {}

    init(id: UUID? = nil, fontID: UUID, userID: UUID? = nil, message: String,
         isIncident: Bool = true, incidentKind: IncidentKind? = nil, parentID: UUID? = nil) {
        self.id = id
        self.$font.id = fontID
        self.$user.id = userID
        self.message = message
        self.isIncident = isIncident
        self.incidentKind = incidentKind
        self.$parent.id = parentID
    }
}


/// De qué clase es una avería.
///
/// La lista es corta a propósito: es para que una brigada pueda ordenar el trabajo, no
/// para clasificar el mundo. `other` existe porque sin él la gente mete cualquier cosa en
/// la categoría que más se le parezca y la clasificación deja de valer para nada — que es
/// exactamente el problema que esta bandera viene a arreglar, repetido un nivel más
/// abajo.
enum IncidentKind: String, Codable, CaseIterable, Sendable {
    case broken   // no sale agua, el caño está roto, el pulsador no va
    case dry      // seca desde hace tiempo, sin avería visible
    case dirty    // el agua o el entorno están sucios
    case access   // no se puede llegar: vallada, obras, cerrada
    case other
}
