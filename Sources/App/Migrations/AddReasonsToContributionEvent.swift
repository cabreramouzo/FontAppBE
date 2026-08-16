import Fluent

/// Guarda **por qué** una aportación valió lo que valió.
///
/// El cálculo ya sabía las razones (`desierto`, `estiaje`, `dudosa`, `saturada`) y las
/// tiraba: al registro solo llegaba el multiplicador ya multiplicado. Eso bastaba para
/// puntuar, pero no para dos cosas que ahora hacen falta:
///
/// 1. **La insignia de zonas remotas.** «Cuántas aportaciones tuyas fueron en desierto»
///    no se puede sacar del multiplicador: 1,25 · 1,15 y 1,4375 son el mismo número una
///    vez multiplicados, y descomponer un producto en factores adivinando cuál se aplicó
///    es exactamente el tipo de heurística que falla en silencio.
/// 2. **Calibrar.** Con qué frecuencia salta cada multiplicador es el dato que decidió
///    bajar el estiaje a dos meses y subir el desierto a 20 km. Hasta ahora había que
///    recalcular el histórico entero para saberlo.
///
/// Texto separado por comas y no una tabla aparte: son cuatro etiquetas cortas, se leen
/// siempre junto a su fila y nunca se consultan por sí solas.
///
/// Las filas ya existentes quedan con la cadena vacía, que significa «no se sabe» y no
/// «ninguna razón». `gamification-sync --rescore` las rellena reconstruyendo el histórico.
struct AddReasonsToContributionEvent: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("contribution_events")
            .field("reasons", .string, .required, .sql(.default("")))
            .update()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("contribution_events").deleteField("reasons").update()
    }
}
