import Fluent
import SQLKit

/// Privacidad: si el usuario muestra su email en el perfil público. Aditiva
/// (producción ya tiene usuarios), por defecto `false`.
struct AddEmailPublicToUser: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("users")
            .field("email_public", .bool, .required, .sql(.default(false)))
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("users").deleteField("email_public").update()
    }
}
