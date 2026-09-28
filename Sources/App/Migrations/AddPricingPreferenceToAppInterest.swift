import Fluent

struct AddPricingPreferenceToAppInterest: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("app_interests")
            .field("pricing_preference", .string) // 'one_time' | 'subscription' | null
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("app_interests")
            .deleteField("pricing_preference")
            .update()
    }
}
