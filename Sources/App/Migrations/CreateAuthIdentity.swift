import Fluent

struct CreateAuthIdentity: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema(AuthIdentity.schema)
            .id()
            .field("provider", .string, .required)
            .field("subject", .string, .required)
            .field("user_id", .uuid, .required, .references("users", "id", onDelete: .cascade))
            .field("created_at", .datetime)
            .unique(on: "provider", "subject")
            .unique(on: "provider", "user_id")
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema(AuthIdentity.schema).delete()
    }
}
