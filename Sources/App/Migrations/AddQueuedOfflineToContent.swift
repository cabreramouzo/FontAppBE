import Fluent

/// Marca las fuentes y reseñas que se crearon **sin cobertura**, desde la bandeja de salida.
///
/// El servidor no puede deducirlo por su cuenta y esto es lo que hace falta entender: la
/// bandeja de salida guarda la aportación en el móvil y la reenvía cuando vuelve la red,
/// pero lo que llega entonces es una petición corriente, indistinguible de la de alguien
/// sentado en casa con fibra. La única diferencia la sabe el cliente, y si no la cuenta,
/// se pierde.
///
/// La marca va en la **fila de origen** (la fuente, la reseña) y no en el evento de
/// puntuación, porque `--rescore` borra y reconstruye los eventos: guardada allí,
/// desaparecería en el primer recálculo. Aquí sobrevive.
///
/// Es un dato que el cliente afirma y el servidor no puede verificar. No pasa nada:
/// paga una insignia sin grados, no gotas — mentir aquí da una medalla y ni una gota de
/// ventaja en el ranking. Poner a cambio un multiplicador sería invitar a falsificar la
/// cabecera.
struct AddQueuedOfflineToContent: AsyncMigration {
    func prepare(on database: any Database) async throws {
        for tabla in ["fonts", "font_comments"] {
            try await database.schema(tabla)
                .field("queued_offline", .bool, .required, .sql(.default(false)))
                .update()
        }
    }

    func revert(on database: any Database) async throws {
        for tabla in ["fonts", "font_comments"] {
            try await database.schema(tabla).deleteField("queued_offline").update()
        }
    }
}
