import Fluent
import SQLKit

/// El municipio de cada fuente, exacto.
///
/// ## Por qué una columna y no «el pueblo más cercano»
///
/// Porque no son lo mismo, y está medido: sobre 2.000 fuentes catalanas, la distancia al
/// núcleo de población más próximo tiene **mediana de 1,64 km, p90 de 4,55 y máximo de
/// 16,9**, y **una de cada cuatro está a más de 3 km**. Escribir «Moià» para una fuente
/// que está a nueve kilómetros sería inventarse un dato — y una vez en una columna, ese
/// dato inventado se propaga al buscador, a `/zones` y al ranking.
///
/// Con los límites municipales del IGN no se adivina nada: o el punto cae dentro del
/// polígono o no cae.
///
/// ## Qué guarda
///
/// El nombre oficial (`NAMEUNIT`) y el código INE de cinco dígitos, que es lo único
/// estable: hay 19 nombres de municipio repetidos en España, y el día que haya que cruzar
/// esto con cualquier otra fuente de datos el nombre no sirve.
///
/// Nulo significa **«no lo sabemos»**, no «ninguno»: fuera de España no hay fronteras
/// cargadas, y ahí se queda vacío en vez de inventar.
struct AddMunicipalityToFont: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("fonts")
            .field("municipality", .string)
            .field("municipality_ine", .string)
            .update()
        if let sql = database as? any SQLDatabase {
            // Para «las fuentes de este municipio», que es lo que pedirá la página.
            try await sql.raw("CREATE INDEX IF NOT EXISTS fonts_municipality_ine_idx ON fonts (municipality_ine) WHERE municipality_ine IS NOT NULL").run()
        }
    }

    func revert(on database: any Database) async throws {
        try await database.schema("fonts")
            .deleteField("municipality")
            .deleteField("municipality_ine")
            .update()
    }
}
