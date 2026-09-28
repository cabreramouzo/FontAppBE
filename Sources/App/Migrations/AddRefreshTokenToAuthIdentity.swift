import Fluent

/// Apple exige revocar el acceso al borrar la cuenta, y eso pide su refresh token.
struct AddRefreshTokenToAuthIdentity: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema(AuthIdentity.schema).field("refresh_token", .string).update()
    }

    func revert(on database: Database) async throws {
        try await database.schema(AuthIdentity.schema).deleteField("refresh_token").update()
    }
}
