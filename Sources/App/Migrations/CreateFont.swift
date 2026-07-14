import Fluent
import SQLKit

struct CreateFont: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("fonts")
            .id()
            .field("name", .string, .required)
            .field("latitude", .double, .required)
            .field("longitude", .double, .required)
            .field("image", .string)
            .field("description", .string)
            .field("created_at", .datetime)
            .create()

        // Índice compuesto para el prefiltro por bounding box de /fonts/near.
        if let sql = database as? SQLDatabase {
            try await sql.raw("CREATE INDEX IF NOT EXISTS idx_fonts_lat_long ON fonts (latitude, longitude)").run()
        }
    }

    func revert(on database: Database) async throws {
        try await database.schema("fonts").delete()
    }
}
