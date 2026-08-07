import Fluent
import SQLKit

/// Rol jerárquico del usuario (`user`/`moderator`/`admin`/`owner`). Sustituye al
/// booleano `is_admin` como fuente de verdad de permisos. Aditiva y con default
/// `user`; los usuarios que ya eran `is_admin=true` se migran a rol `admin`.
/// La columna `is_admin` se conserva (su default cubre inserciones), pero ya no se usa.
struct AddRoleToUser: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("users")
            .field("role", .string, .required, .sql(.default("user")))
            .update()
        // Backfill: quien era admin conserva permisos de admin con el nuevo modelo.
        if let sql = database as? SQLDatabase {
            try await sql.raw("UPDATE users SET role = 'admin' WHERE is_admin = true").run()
        }
    }

    func revert(on database: Database) async throws {
        try await database.schema("users").deleteField("role").update()
    }
}
