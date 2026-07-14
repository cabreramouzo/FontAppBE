import Fluent

struct CreateFont: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("fonts")
            .id()
            .field("name", .string, .required)
            .field("latitude", .double, .required)
            .field("longitude", .double, .required)
            .field("image", .string)
            .field("description", .string)
            .field("created_at", .datetime)
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("fonts").delete()
    }
}
