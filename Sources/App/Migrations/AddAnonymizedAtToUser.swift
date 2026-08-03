import Fluent

/// Al "borrar" la cuenta anonimizamos en vez de eliminar la fila (para conservar
/// las aportaciones —fuentes, reseñas— desligadas de la identidad). Este campo
/// marca cuándo se anonimizó. Aditiva y nullable.
struct AddAnonymizedAtToUser: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("users")
            .field("anonymized_at", .datetime)
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("users").deleteField("anonymized_at").update()
    }
}
