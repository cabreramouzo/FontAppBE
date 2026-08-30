import Fluent

struct CreateMunicipalBoundary: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema(MunicipalBoundary.schema)
            .field("ine", .string, .identifier(auto: false))
            .field("name", .string, .required)
            .field("rings", .json, .required)
            .field("min_lat", .double, .required)
            .field("max_lat", .double, .required)
            .field("min_long", .double, .required)
            .field("max_long", .double, .required)
            .create()
    }

    func revert(on database: any Database) async throws {
        try await database.schema(MunicipalBoundary.schema).delete()
    }
}
