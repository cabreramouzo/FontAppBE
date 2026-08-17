import Fluent
import SQLKit

/// Insignias especiales concedidas. Ver `BadgeAward` para por qué éstas se guardan y las
/// otras veintiuna no.
struct CreateBadgeAward: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("badge_awards")
            .id()
            .field("user_id", .uuid, .required, .references("users", "id", onDelete: .cascade))
            .field("key", .string, .required)
            .field("earned_at", .datetime, .required)
            .field("created_at", .datetime)
            // Conceder es idempotente gracias a esto, y no por una comprobación previa en
            // Swift: dos instancias pueden estar barriendo a la vez y entre el SELECT y el
            // INSERT cabe la otra. Aquí lo impide la base de datos, que es donde se puede.
            .unique(on: "user_id", "key")
            .create()

        // El cupo se cuenta por clave («¿quedan plazas de betatester?») en cada barrido.
        guard let sql = database as? SQLDatabase else { return }
        try await sql.raw(
            "CREATE INDEX IF NOT EXISTS badge_awards_key_earned_idx ON badge_awards (key, earned_at)"
        ).run()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("badge_awards").delete()
    }
}
