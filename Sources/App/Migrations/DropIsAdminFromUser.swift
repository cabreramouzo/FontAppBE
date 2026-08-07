import Fluent

/// Elimina la columna legacy `is_admin`, ya sustituida por `role` (ver `AddRoleToUser`).
/// Debe ir DESPUÉS de `AddRoleToUser`, que hace el backfill leyendo `is_admin`.
/// El `revert` la recrea (con su default) para no romper una posible reversión.
struct DropIsAdminFromUser: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("users")
            .deleteField("is_admin")
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("users")
            .field("is_admin", .bool, .required, .sql(.default(false)))
            .update()
    }
}
