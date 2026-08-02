import Fluent

/// Ubicación aproximada del registro (país/región/ciudad por geo-IP), para
/// estadística. Aditiva: se añade después de que producción ya tenga usuarios,
/// por eso NO se toca `CreateUser`.
struct AddSignupLocationToUser: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("users")
            .field("signup_country", .string)
            .field("signup_region", .string)
            .field("signup_city", .string)
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("users")
            .deleteField("signup_country")
            .deleteField("signup_region")
            .deleteField("signup_city")
            .update()
    }
}
