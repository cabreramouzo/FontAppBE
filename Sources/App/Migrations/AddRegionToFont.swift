import Fluent

/// País y región (admin-1) de una fuente, para futuras funciones por zona
/// (p. ej. administradores por región, filtros por comunidad/distrito).
/// Aditiva y nullable: producción ya tiene fuentes, por eso NO se toca `CreateFont`.
/// De momento solo se añaden las columnas; el poblado se hará más adelante
/// (derivado de las coordenadas). Ver `docs/api.md` y CLAUDE.md.
struct AddRegionToFont: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("fonts")
            .field("country", .string)
            .field("region", .string)
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("fonts")
            .deleteField("country")
            .deleteField("region")
            .update()
    }
}
