import Fluent

/// Añade el tipo de punto (`source`) y la potabilidad (`drinkable`) a las fuentes.
/// Columnas nullable: las fuentes ya existentes quedan como "desconocido" hasta re-importar.
struct AddWaterTypeToFont: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("fonts")
            .field("source", .string)
            .field("drinkable", .string)
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("fonts")
            .deleteField("source")
            .deleteField("drinkable")
            .update()
    }
}
