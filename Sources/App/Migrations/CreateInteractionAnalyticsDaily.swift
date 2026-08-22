import Fluent

/// Conserva tendencias históricas sin conservar identificadores de sesión antiguos.
struct CreateInteractionAnalyticsDaily: AsyncMigration {
    func prepare(on db: Database) async throws {
        try await db.schema("interaction_analytics_daily").id()
            .field("event", .string, .required)
            .field("day", .date, .required)
            .field("clicks", .int, .required)
            .field("sessions", .int, .required)
            .unique(on: "event", "day")
            .create()
    }

    func revert(on db: Database) async throws {
        try await db.schema("interaction_analytics_daily").delete()
    }
}
