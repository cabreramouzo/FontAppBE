import Fluent

// Asocia cada reporte al usuario que lo crea. Columna opcional (reportes previos
// o de usuarios borrados quedan sin autor) con ON DELETE SET NULL.
struct AddUserToFontReport: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("font_reports")
            .field("user_id", .uuid, .references("users", "id", onDelete: .setNull))
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("font_reports")
            .deleteField("user_id")
            .update()
    }
}
