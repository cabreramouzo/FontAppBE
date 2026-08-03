import Fluent
import SQLKit

/// Privacidad: si el nombre real se muestra en el perfil público. Aditiva
/// (producción ya tiene usuarios), por defecto `true` para conservar el
/// comportamiento previo (el nombre siempre era visible).
struct AddNamePublicToUser: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("users")
            .field("name_public", .bool, .required, .sql(.default(true)))
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("users").deleteField("name_public").update()
    }
}
