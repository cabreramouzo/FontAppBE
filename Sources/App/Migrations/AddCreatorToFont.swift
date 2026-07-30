import Fluent

/// Añade el creador (`created_by`) a las fuentes. Nullable: las importadas de OSM
/// no tienen dueño. Al borrar el usuario, sus fuentes quedan huérfanas (setNull), no se borran.
struct AddCreatorToFont: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("fonts")
            .field("created_by", .uuid, .references("users", "id", onDelete: .setNull))
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("fonts")
            .deleteField("created_by")
            .update()
    }
}
