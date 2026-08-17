import Fluent
import SQLKit

/// Preferencia: avisar por correo cuando alguien te menciona.
///
/// Nace encendida y eso es una decisión, no una comodidad. Una mención suele ser alguien
/// hablándote **de algo tuyo** —«borro esta fuente duplicada, las gotas se irán»— y un
/// aviso que llega solo si lo activaste antes no llega nunca. A cambio hay que poder
/// apagarlo sin pelear: hay interruptor en el perfil y enlace de baja en el propio
/// correo, firmado, para quien no tenga la sesión abierta.
struct AddMentionEmailsToUser: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("users")
            .field("mention_emails", .bool, .required, .sql(.default(true)))
            .update()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("users").deleteField("mention_emails").update()
    }
}
