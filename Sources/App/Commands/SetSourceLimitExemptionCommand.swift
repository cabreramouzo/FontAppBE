import Fluent
import SQLKit
import Vapor

/// Concede o revoca una excepción TEMPORAL al cupo de cinco fuentes de una cuenta nueva.
/// No cambia el rol ni el rate limit general de 30 altas por hora.
///
/// Uso:
///   `swift run App set-source-limit-exemption font199 --days 7`
///   `swift run App set-source-limit-exemption font199 --days 0` (revocar)
struct SetSourceLimitExemptionCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Argument(name: "username", help: "Nombre de usuario")
        var username: String
        @Option(name: "days", short: "d", help: "Días de excepción; 0 la revoca")
        var days: Int?
    }

    var help: String { "Concede temporalmente una excepción al cupo de fuentes de cuentas nuevas" }

    func run(using context: CommandContext, signature: Signature) async throws {
        let days = signature.days ?? 7
        guard (0...30).contains(days) else {
            context.console.error("Los días deben estar entre 0 y 30.")
            return
        }
        let db = context.application.db
        guard let user = try await User.query(on: db).filter(\.$username == signature.username).first(),
              let userID = user.id else {
            context.console.error("No existe el usuario '\(signature.username)'.")
            return
        }
        user.sourceLimitExemptUntil = days == 0 ? nil : Date().addingTimeInterval(Double(days) * 86_400)
        try await user.save(on: db)

        // Deja rastro aunque se haya ejecutado desde CLI y no exista un actor autenticado.
        if let sql = db as? SQLDatabase {
            let action = days == 0 ? "source_limit_exemption_revoked" : "source_limit_exemption_granted"
            let reason = days == 0 ? "CLI" : "CLI: \(days) days"
            try await sql.raw("""
                INSERT INTO moderation_actions (id, subject_user_id, actor_id, action, reason, created_at)
                VALUES (\(bind: UUID()), \(bind: userID), NULL, \(bind: action), \(bind: reason), \(bind: Date()))
                """).run()
        }
        // Se avisa por la campana, igual que desde el panel: da igual por dónde se
        // conceda, quien lo pidió tiene que enterarse de que ya puede seguir.
        if let until = user.sourceLimitExemptUntil {
            await SourceLimitNotifier.granted(userID: userID, until: until, on: db,
                                              push: PushEnvio(context.application))
            context.console.info("Excepción para '\(signature.username)' activa hasta \(until).")
        } else {
            context.console.info("Excepción para '\(signature.username)' revocada.")
        }
    }
}
