import Fluent

/// La caja de la ficha pasa a ser de **comentarios**, y una incidencia es un comentario
/// marcado como tal.
///
/// El motivo es de uso real: era la única caja de la ficha que no pedía nada más —ni
/// estado del agua, ni valoración, ni foto—, así que se llevaba todo lo que alguien
/// quería decir. Entraban cosas como «¿podrías añadir una foto @usuario?», que no es una
/// avería y nunca la va a «resolver» nadie, y se quedaban abiertas para siempre inflando
/// el recuento de incidencias abiertas — el mismo que enseña la página de un municipio.
///
/// `is_incident` nace **a true** para que lo ya escrito conserve su significado: todo lo
/// que hay hoy en esta tabla se escribió cuando la caja se llamaba «incidencia». Lo que
/// no lo sea se desmarca a mano desde `/admin/reports`.
struct AddIncidentFlagToFontReport: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema(FontReport.schema)
            .field("is_incident", .bool, .required, .sql(.default(true)))
            // Tipo de incidencia. Opcional a propósito: lo escrito antes de esto no lo
            // lleva, y un comentario que no es incidencia no tiene tipo que declarar.
            .field("incident_kind", .string)
            .update()
    }

    func revert(on database: any Database) async throws {
        try await database.schema(FontReport.schema)
            .deleteField("is_incident")
            .deleteField("incident_kind")
            .update()
    }
}
