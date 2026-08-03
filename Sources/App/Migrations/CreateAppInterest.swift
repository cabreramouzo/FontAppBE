import Fluent

struct CreateAppInterest: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("app_interests")
            .id()
            // Autor opcional; setNull si se borra el usuario.
            .field("user_id", .uuid, .references("users", "id", onDelete: .setNull))
            .field("wants", .bool, .required)
            .field("platform", .string)
            .field("created_at", .datetime)
            .field("updated_at", .datetime)
            // Un voto por usuario autenticado. Los votos anónimos tienen user_id
            // NULL, y Postgres considera cada NULL distinto → no colisionan.
            .unique(on: "user_id")
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("app_interests").delete()
    }
}
