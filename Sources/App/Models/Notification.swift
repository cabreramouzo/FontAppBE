import Fluent
import Vapor

/// Un aviso para alguien: la campana de la app.
///
/// ## Por qué existe teniendo ya el correo
///
/// Porque el correo cuesta dinero por envío y esto no cuesta nada, y porque la mayoría de
/// los avisos los va a leer alguien que **ya está dentro de la app**. Mandarle un correo
/// a quien está mirando la pantalla es pagar por molestar.
///
/// El correo no desaparece: se queda para quien no anda por aquí, que es donde sí hace
/// falta. La regla la decide `MentionNotifier` con `users.last_seen_at`.
///
/// ## Qué guarda y qué no
///
/// Guarda **el texto ya resuelto** —un extracto del mensaje— y no una referencia a la
/// reseña que lo originó. Es duplicar datos a propósito: un aviso es una foto de lo que
/// pasó, y si la reseña se edita o se borra, el aviso tiene que seguir diciendo lo que
/// decía cuando te llegó. Con una referencia, media bandeja se quedaría en blanco al
/// primer borrado, y peor: cambiaría por detrás.
final class Notification: Model, @unchecked Sendable {
    static let schema = "notifications"

    enum Kind: String, Codable, Sendable {
        /// Alguien te ha nombrado con `@tunombre`.
        case mention
    }

    @ID(key: .id) var id: UUID?
    /// A quién va dirigido.
    @Parent(key: "user_id") var user: User
    @Field(key: "kind") var kind: Kind
    /// Quién lo provocó. Opcional: si esa cuenta se anonimiza, el aviso sobrevive.
    @OptionalParent(key: "actor_id") var actor: User?
    /// Nombre de quien lo provocó, congelado. Ver la nota de arriba sobre duplicar.
    @Field(key: "actor_name") var actorName: String
    /// A dónde lleva el aviso.
    @OptionalParent(key: "font_id") var font: Font?
    @Field(key: "font_name") var fontName: String
    /// Extracto del mensaje.
    @Field(key: "excerpt") var excerpt: String
    /// Cuándo se leyó. Nulo = sin leer, que es lo que cuenta la campana.
    @OptionalField(key: "read_at") var readAt: Date?

    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(userID: UUID, kind: Kind, actorID: UUID?, actorName: String,
         fontID: UUID?, fontName: String, excerpt: String) {
        self.$user.id = userID
        self.kind = kind
        self.$actor.id = actorID
        self.actorName = actorName
        self.$font.id = fontID
        self.fontName = fontName
        self.excerpt = excerpt
    }
}
