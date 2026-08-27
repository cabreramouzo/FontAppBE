import Fluent
import SQLKit

/// Qué avisos del sistema quiere recibir cada persona.
///
/// ## Por qué tres y no uno por evento
///
/// Un interruptor por cada cosa que puede pasar sería una pantalla de nueve casillas que
/// nadie lee y que hay que mantener cada vez que se añade un aviso. Se agrupan por **lo
/// que significan para quien los recibe**, que es como se decide de verdad:
///
///  · **Fuentes que sigues**: se seca, alguien avisa de una incidencia, desaparece del
///    mapa. Son hechos del mundo.
///  · **Menciones**: alguien te está hablando a ti.
///  · **Administración**: «estoy on fire». Solo lo reciben administradores y por eso el
///    interruptor solo se pinta para ellos.
///
/// ## Y nacen encendidos
///
/// Misma razón que `mention_emails`: un aviso que hay que activar antes no lo activa
/// nadie. El permiso del navegador ya es una puerta explícita —hay que concederlo desde un
/// gesto—, así que quien llega hasta aquí ya ha dicho que sí una vez. Esto es para afinar,
/// no para pedir permiso otra vez.
///
/// **Lo que NO pasa por aquí:** que se te haya ampliado el cupo. Es la respuesta a algo que
/// pediste tú explícitamente, y silenciar la contestación a tu propia solicitud no es una
/// preferencia razonable — es perder el hilo de una conversación que empezaste.
struct AddPushPrefsToUser: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("users")
            .field("push_font_updates", .bool, .required, .sql(.default(true)))
            .field("push_mentions", .bool, .required, .sql(.default(true)))
            .field("push_admin", .bool, .required, .sql(.default(true)))
            .update()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("users")
            .deleteField("push_font_updates")
            .deleteField("push_mentions")
            .deleteField("push_admin")
            .update()
    }
}
