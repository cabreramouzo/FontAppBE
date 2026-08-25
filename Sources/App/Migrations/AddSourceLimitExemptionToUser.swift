import Fluent

/// Excepción temporal al cupo antiabuso de cuentas nuevas. Nullable por defecto:
/// desplegarla no cambia el comportamiento de ninguna cuenta existente.
struct AddSourceLimitExemptionToUser: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("users")
            .field("source_limit_exempt_until", .datetime)
            .update()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("users")
            .deleteField("source_limit_exempt_until")
            .update()
    }
}
