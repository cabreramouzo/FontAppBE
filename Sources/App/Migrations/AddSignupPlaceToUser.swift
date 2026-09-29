import Fluent

/// Where a new account was when it first shared its position, **as a municipality only**.
/// Temporary and statistical: it exists to tell which posters work in which towns while
/// the IP geolocation of the signup keeps resolving to VPN exits. See `SignupPlace`.
struct AddSignupPlaceToUser: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema(User.schema)
            .field("signup_municipality", .string)
            .field("signup_ine", .string)
            .field("signup_place_region", .string)
            .field("signup_place_country", .string)
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema(User.schema)
            .deleteField("signup_municipality")
            .deleteField("signup_ine")
            .deleteField("signup_place_region")
            .deleteField("signup_place_country")
            .update()
    }
}
