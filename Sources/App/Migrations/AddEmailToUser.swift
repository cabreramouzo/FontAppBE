import Fluent

/// Añade el email al usuario. Nullable (los usuarios previos no tienen) y único
/// mediante índice: Postgres permite múltiples NULL bajo un índice único.
struct AddEmailToUser: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("users")
            .field("email", .string)
            .unique(on: "email")
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("users")
            .deleteField("email")
            .update()
    }
}
