import Fluent
import SQLKit

struct CreateContributionEvent: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("contribution_events")
            .id()
            .field("user_id", .uuid, .required, .references("users", "id", onDelete: .cascade))
            // La fuente puede desaparecer sin que la aportación deje de haber existido:
            // se pone a NULL en vez de borrar la fila, o el histórico se vaciaría solo.
            .field("font_id", .uuid, .references("fonts", "id", onDelete: .setNull))
            .field("source", .string, .required)
            .field("subject_id", .uuid, .required)
            .field("detail", .string, .required, .sql(.default("")))
            .field("kind", .string, .required)
            .field("base", .int, .required)
            .field("multiplier", .double, .required)
            .field("gotes", .int, .required)
            .field("status", .string, .required)
            .field("occurred_at", .datetime, .required)
            .field("settles_at", .datetime, .required)
            .field("settled_at", .datetime)
            .field("void_reason", .string)
            .field("created_at", .datetime)
            // La identidad de una aportación. Con esto la sincronización es idempotente:
            // se puede volver a pasar el cálculo sobre todo el historial cuantas veces
            // haga falta y no duplica ni una fila.
            // `detail` va NOT NULL con defecto "" a propósito: en Postgres dos NULL se
            // consideran distintos, así que con una columna nullable el índice único no
            // habría impedido nada.
            .unique(on: "source", "subject_id", "kind", "detail")
            .create()

        // El barrido de liquidación busca justo por aquí.
        try await (database as? SQLDatabase)?.raw(
            "CREATE INDEX IF NOT EXISTS idx_contrib_pending ON contribution_events (status, settles_at)"
        ).run()
        try await (database as? SQLDatabase)?.raw(
            "CREATE INDEX IF NOT EXISTS idx_contrib_user_status ON contribution_events (user_id, status)"
        ).run()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("contribution_events").delete()
    }
}
