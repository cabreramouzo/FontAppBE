import Fluent
import Vapor

/// Un «me gusta» en un comentario de una fuente.
///
/// Es **social y no evidencial**, y esa es la diferencia con `FontConfirmation`: aquella
/// dice «sigue igual», cambia la confianza de la fuente y paga gotas; ésta solo dice que
/// alguien agradece lo que escribiste. Por eso no avisa, no puntúa y no entra en ningún
/// cálculo — si lo hiciera, sería gratis de farmear entre dos cuentas.
///
/// Una persona da un me gusta una sola vez al mismo comentario: lo garantiza el índice
/// único `(report_id, user_id)` y no una comprobación en Swift, porque dos peticiones
/// simultáneas pueden pasar la comprobación a la vez.
final class ReportLike: Model, @unchecked Sendable {
    static let schema = "report_likes"

    @ID(key: .id) var id: UUID?
    @Parent(key: "report_id") var report: FontReport
    @Parent(key: "user_id") var user: User
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, reportID: UUID, userID: UUID) {
        self.id = id
        self.$report.id = reportID
        self.$user.id = userID
    }
}
