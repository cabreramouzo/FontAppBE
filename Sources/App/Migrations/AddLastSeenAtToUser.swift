import Fluent

/// Última vez que se vio a alguien por la app.
///
/// Existe solo para decidir si un aviso necesita además un correo. No es analítica ni se
/// enseña en ninguna parte: saber que alguien pasó por aquí hace diez minutos es lo único
/// que hace falta para no mandarle un correo contándole algo que ya tiene en la campana.
///
/// Se actualiza desde `GET /notifications`, que es la petición que hace la app al cargar,
/// y **solo si el valor guardado es viejo** (`User.seenThrottle`): así es como mucho una
/// escritura por hora y persona activa, no una por petición.
struct AddLastSeenAtToUser: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("users").field("last_seen_at", .datetime).update()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("users").deleteField("last_seen_at").update()
    }
}
