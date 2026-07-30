import Fluent
import SQLKit

struct CreateUser: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("users")
            .id()
            .field("name", .string, .required)
            .field("username", .string, .required)
            .unique(on: "username")
            // email: opcional y único (Postgres permite múltiples NULL bajo índice único).
            .field("email", .string)
            .unique(on: "email")
            .field("password_hash", .string, .required)
            .field("is_admin", .bool, .required, .sql(.default(false)))
            .field("created_at", .datetime)
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("users").delete()
    }
}
