import Fluent
import SQLKit

struct CreateApnsDevice: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("apns_devices")
            .id()
            .field("user_id", .uuid, .required, .references("users", "id", onDelete: .cascade))
            .field("token", .string, .required)
            .field("sandbox", .bool, .required)
            .field("created_at", .datetime)
            .field("updated_at", .datetime)
            .unique(on: "token")
            .create()
        // Se consulta siempre «los aparatos de esta persona», una vez por aviso.
        if let sql = database as? any SQLDatabase {
            try await sql.raw("CREATE INDEX IF NOT EXISTS apns_devices_user_idx ON apns_devices (user_id)").run()
        }
    }

    func revert(on database: any Database) async throws {
        try await database.schema("apns_devices").delete()
    }
}
