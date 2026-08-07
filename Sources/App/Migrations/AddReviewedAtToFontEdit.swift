import Fluent

/// Marca de "revisada" (✓) de una edición de fuente, para el triaje del panel:
/// las no revisadas forman la cola; las revisadas quedan en el historial completo.
/// Aditiva y nullable (todas las existentes quedan como pendientes).
struct AddReviewedAtToFontEdit: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("font_edits")
            .field("reviewed_at", .datetime)
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("font_edits")
            .deleteField("reviewed_at")
            .update()
    }
}
