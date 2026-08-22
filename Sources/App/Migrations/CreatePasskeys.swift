import Fluent

struct CreatePasskeys: AsyncMigration {
    func prepare(on db: Database) async throws {
        try await db.schema(PasskeyCredential.schema).id()
            .field("credential_id", .string, .required).unique(on: "credential_id")
            .field("public_key", .data, .required).field("sign_count", .int64, .required)
            .field("label", .string, .required)
            .field("user_id", .uuid, .required, .references("users", "id", onDelete: .cascade))
            .field("created_at", .datetime).field("last_used_at", .datetime).create()
        try await db.schema(PasskeyChallenge.schema).id()
            .field("challenge", .data, .required).field("purpose", .string, .required)
            .field("user_id", .uuid, .references("users", "id", onDelete: .cascade))
            .field("expires_at", .datetime, .required).create()
    }
    func revert(on db: Database) async throws {
        try await db.schema(PasskeyChallenge.schema).delete()
        try await db.schema(PasskeyCredential.schema).delete()
    }
}
