import Fluent

struct CreateContentFlag: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("content_flags")
            .id()
            .field("flagger_id", .uuid, .references("users", "id", onDelete: .setNull))
            .field("target_type", .string, .required)
            .field("target_id", .uuid, .required)
            .field("reason", .string)
            .field("created_at", .datetime)
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("content_flags").delete()
    }
}
