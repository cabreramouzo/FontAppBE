import Fluent
import SQLKit

struct CreatePlace: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("places")
            .id()
            .field("slug", .string, .required)
            .field("name", .string, .required)
            .field("kind", .string, .required)
            .field("latitude", .double, .required)
            .field("longitude", .double, .required)
            .field("country", .string)
            .field("region", .string)
            .field("font_count", .int, .required, .sql(.default(0)))
            .unique(on: "slug")
            .create()
        if let sql = database as? any SQLDatabase {
            // El listado y el sitemap piden siempre «los que tienen fuentes», ordenados.
            try await sql.raw("CREATE INDEX IF NOT EXISTS places_font_count_idx ON places (font_count DESC) WHERE font_count > 0").run()
        }
    }

    func revert(on database: any Database) async throws {
        try await database.schema("places").delete()
    }
}
