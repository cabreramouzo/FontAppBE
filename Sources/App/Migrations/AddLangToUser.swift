import Fluent

/// Idioma de la interfaz cuando el usuario se registró (`ca`/`es`/`gl`/`eu`/`en`).
/// Hace falta para los correos que NO nacen de una petición suya (el resumen semanal
/// lo dispara un cron, ahí no hay navegador al que preguntarle el idioma).
/// Nullable: los usuarios anteriores no lo tienen y caen al idioma por defecto (ca).
struct AddLangToUser: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("users").field("lang", .string).update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("users").deleteField("lang").update()
    }
}
