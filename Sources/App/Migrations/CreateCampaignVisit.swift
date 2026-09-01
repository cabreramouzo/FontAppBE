import Fluent
import SQLKit

/// Visitas anónimas que llegaron con un código de campaña (`fontapp.net/?p=linkedin`).
///
/// Tabla aparte y no un evento más de `interaction_analytics` porque aquel es una **lista
/// cerrada** de eventos y los códigos no lo son: cada cartel nuevo inventa el suyo, así
/// que meterlos ahí obligaría a ampliar la lista en cada pueblo o a abrir la puerta a
/// nombres de evento arbitrarios, que es justo lo que esa lista existe para impedir.
///
/// Guarda lo mismo que la otra —código, día, UUID de pestaña y recuento— y **nada más**:
/// ni usuario, ni IP, ni URL, ni dispositivo. El código ya viaja hoy en la URL y ya se
/// guarda en `users.signup_source` al registrarse; lo único nuevo es contar también a
/// quien **no** llega a registrarse, que es precisamente el agujero: de un post con
/// 12.000 impresiones solo se veían las 10 altas, no los clics.
struct CreateCampaignVisit: AsyncMigration {
    func prepare(on db: Database) async throws {
        try await db.schema("campaign_visits").id()
            .field("source", .string, .required)
            .field("day", .date, .required)
            .field("session_id", .uuid, .required)
            .field("hits", .int, .required)
            .unique(on: "source", "day", "session_id")
            .create()
        if let sql = db as? SQLDatabase {
            try await sql.raw("CREATE INDEX campaign_visits_day_idx ON campaign_visits (day)").run()
        }
    }
    func revert(on db: Database) async throws {
        try await db.schema("campaign_visits").delete()
    }
}
