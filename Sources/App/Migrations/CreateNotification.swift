import Fluent
import SQLKit

/// La campana. Ver `Notification` para por qué guarda el texto y no una referencia.
struct CreateNotification: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("notifications")
            .id()
            .field("user_id", .uuid, .required, .references("users", "id", onDelete: .cascade))
            .field("kind", .string, .required)
            // `setNull` y no `cascade`: que quien te mencionó borre su cuenta no puede
            // hacer desaparecer un aviso que ya leíste (o peor, que aún no).
            .field("actor_id", .uuid, .references("users", "id", onDelete: .setNull))
            .field("actor_name", .string, .required)
            .field("font_id", .uuid, .references("fonts", "id", onDelete: .setNull))
            .field("font_name", .string, .required)
            .field("excerpt", .string, .required)
            .field("read_at", .datetime)
            .field("created_at", .datetime)
            .create()

        guard let sql = database as? SQLDatabase else { return }
        // La consulta caliente es «los míos, los últimos primero», y se hace en cada
        // carga de la app. Sin índice es un recorrido de la tabla entera por visita.
        try await sql.raw(
            "CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at DESC)"
        ).run()
        // Y el contador de la campana solo mira las no leídas: parcial, porque las leídas
        // son la inmensa mayoría y no hace falta indexarlas.
        try await sql.raw(
            "CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL"
        ).run()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("notifications").delete()
    }
}
