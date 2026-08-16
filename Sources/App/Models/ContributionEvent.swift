import Fluent
import Vapor

/// Una aportación puntuada, con su estado. Fase 2 de la gamificación.
///
/// Es la **fuente única de verdad** de los puntos: la puntuación deja de recalcularse a
/// cada consulta y pasa a ser la suma de las filas liquidadas. Eso importa por dos razones
/// que no se ven hasta que es tarde:
///
/// 1. **Las gotas quedan congeladas.** `gotes` se guarda con el valor que tenía el baremo
///    el día que se registró. Si mañana se decide que una primera foto vale 150, quien la
///    puso ayer no ve cambiar su marcador de golpe — que es exactamente lo que erosiona la
///    confianza en un sistema de puntos.
/// 2. **Nada se cobra al instante.** Una aportación nace `pending` y solo pasa a `settled`
///    cuando han transcurrido 72 horas sin que la reviertan, la denuncien o la borren. Es
///    la pieza antifraude central: evita el grueso del problema sin tener que detectar
///    nada.
///
/// El diseño completo está en `docs/gamificacion.md`.
final class ContributionEvent: Model, @unchecked Sendable {
    static let schema = "contribution_events"

    enum Status: String, Codable, Sendable {
        case pending    // dentro de la ventana de 72 h
        case settled    // liquidada; cuenta para el marcador
        case void       // anulada: revertida, denunciada o desaparecida
    }

    @ID(key: .id) var id: UUID?
    @Parent(key: "user_id") var user: User
    @OptionalParent(key: "font_id") var font: Font?

    /// Identidad estable de la aportación: de qué tabla sale (`source`), qué fila
    /// (`subject_id`) y, cuando una misma fila genera varias, cuál (`detail`). Las tres
    /// juntas llevan un índice único, y por eso la sincronización se puede repetir tantas
    /// veces como haga falta sin duplicar nada.
    @Field(key: "source") var source: String
    @Field(key: "subject_id") var subjectID: UUID
    @Field(key: "detail") var detail: String
    @Field(key: "kind") var kind: String

    @Field(key: "base") var base: Int
    @Field(key: "multiplier") var multiplier: Double
    @Field(key: "gotes") var gotes: Int

    /// Qué multiplicadores saltaron, separados por comas (`desierto,estiaje`). Vacío =
    /// ninguno, o una fila anterior a que esto se guardara (ver la migración).
    @Field(key: "reasons") var reasons: String

    @Field(key: "status") var status: Status
    /// Cuándo ocurrió la aportación (no cuándo se registró: el histórico se importa a
    /// posteriori y las fechas tienen que ser las de verdad).
    @Field(key: "occurred_at") var occurredAt: Date
    @Field(key: "settles_at") var settlesAt: Date
    @OptionalField(key: "settled_at") var settledAt: Date?
    @OptionalField(key: "void_reason") var voidReason: String?

    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(userID: UUID, fontID: UUID?, source: String, subjectID: UUID, detail: String,
         kind: String, base: Int, multiplier: Double, gotes: Int,
         occurredAt: Date, settlesAt: Date, status: Status, reasons: String = "") {
        self.$user.id = userID
        self.$font.id = fontID
        self.source = source
        self.subjectID = subjectID
        self.detail = detail
        self.kind = kind
        self.base = base
        self.multiplier = multiplier
        self.gotes = gotes
        self.occurredAt = occurredAt
        self.settlesAt = settlesAt
        self.status = status
        self.reasons = reasons
    }
}
