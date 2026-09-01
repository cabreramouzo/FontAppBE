import Fluent

/// «Me gusta» en los comentarios de una fuente. Ver `ReportLike`.
struct CreateReportLike: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema(ReportLike.schema)
            .id()
            .field("report_id", .uuid, .required, .references(FontReport.schema, "id", onDelete: .cascade))
            .field("user_id", .uuid, .required, .references("users", "id", onDelete: .cascade))
            .field("created_at", .datetime)
            // Una persona, un me gusta por comentario.
            .unique(on: "report_id", "user_id")
            .create()
    }

    func revert(on database: any Database) async throws {
        try await database.schema(ReportLike.schema).delete()
    }
}
