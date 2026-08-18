import Fluent

/// De dónde vino el usuario: el codi del cartell que va escanejar (`?p=castellcir`).
/// Serveix per saber quin cartell funciona, cosa que la geolocalització per IP no pot
/// dir (a pagès resol al poble gran de la demarcación, no al teu).
/// Nullable: qui arriba sense codi —o els usuaris anteriors— no en té.
struct AddSignupSourceToUser: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("users").field("signup_source", .string).update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("users").deleteField("signup_source").update()
    }
}
