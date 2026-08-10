import Fluent
import SQLKit

/// Preferencia de correo: si el usuario quiere el resumen semanal de actividad.
/// Aditiva (producción ya tiene usuarios) y por defecto `true`: es la razón de ser
/// del resumen (que la gente vuelva), y siempre se puede desactivar desde el perfil
/// o desde el enlace de baja del propio correo.
struct AddWeeklyDigestToUser: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("users")
            .field("weekly_digest", .bool, .required, .sql(.default(true)))
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("users").deleteField("weekly_digest").update()
    }
}
