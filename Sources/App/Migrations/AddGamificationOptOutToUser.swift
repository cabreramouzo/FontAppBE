import Fluent
import SQLKit

/// Interruptor para no ver la gamificación. Aditiva y por defecto `false` —es decir,
/// visible— porque una función que nadie descubre no sirve de nada.
///
/// Apagarla **no deja de contar** las aportaciones: solo esconde el marcador, el nivel y
/// (cuando existan) las tablas. Quien la apaga sigue sumando a las barras colectivas por
/// demarcación, que son del territorio y no de nadie. A mucha gente los rankings le dan reparo,
/// y en una app de colaboración ciudadana espantarlos sale carísimo.
struct AddGamificationOptOutToUser: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("users")
            .field("gamification_opt_out", .bool, .required, .sql(.default(false)))
            .update()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("users").deleteField("gamification_opt_out").update()
    }
}
