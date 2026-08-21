import Fluent

/// División administrativa superior en código ISO 3166-2. Es aditiva y nullable para
/// que el backend anterior y el nuevo puedan convivir durante un despliegue.
struct AddAdmin1ToFont: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("fonts")
            .field("admin1", .string)
            .update()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("fonts")
            .deleteField("admin1")
            .update()
    }
}
