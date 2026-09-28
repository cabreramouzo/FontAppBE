import Fluent

struct AddPricePointToAppInterest: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("app_interests")
            .field("price_point", .string) // '1' | '2' | '5' | '10' | '1_month' | '2_month' | '5_month' | '10_month' | null
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("app_interests")
            .deleteField("price_point")
            .update()
    }
}
