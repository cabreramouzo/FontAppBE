import Fluent
import SQLKit

struct CreatePushSubscription: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("push_subscriptions")
            .id()
            .field("user_id", .uuid, .required, .references("users", "id", onDelete: .cascade))
            .field("endpoint", .string, .required)
            .field("p256dh", .string, .required)
            .field("auth", .string, .required)
            .field("created_at", .datetime)
            // El endpoint es la identidad del aparato: dos filas para el mismo destino
            // significan avisos duplicados y, si el navegador rotó sus claves, una de las
            // dos ya no descifra.
            .unique(on: "endpoint")
            .create()
        // Se consulta siempre «las suscripciones de esta persona», una vez por aviso.
        if let sql = database as? any SQLDatabase {
            try await sql.raw("CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id)").run()
        }
    }

    func revert(on database: any Database) async throws {
        try await database.schema("push_subscriptions").delete()
    }
}
