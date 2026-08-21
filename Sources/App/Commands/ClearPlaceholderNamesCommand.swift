import Fluent
import SQLKit
import Vapor

/// Vacía los nombres que en realidad eran un relleno («Font», «Vattenpost», «Fontaine»…).
///
/// ## Por qué existe
///
/// Al importar de OSM, tres de cada cuatro puntos vienen sin `name`, y durante meses se
/// les puso una palabra genérica **en el idioma del territorio**. El razonamiento parecía
/// bueno —el dato en el idioma de donde sale— y confunde el idioma del territorio con el
/// de quien lee: un dato no tiene idioma, una interfaz sí. Medido en producción, el 47 %
/// del mapa mostraba una palabra que el lector podía no entender.
///
/// Ahora `Font.name` admite nulos y el rótulo lo compone quien pinta, con `source` y su
/// idioma. Esto limpia lo que ya está escrito.
///
/// ## Por qué un comando y no una migración
///
/// Igual que `adopt-cover-photos`: una migración se ejecuta sola al desplegar y no se
/// puede ensayar. Esto reescribe decenas de miles de filas de producción, y con
/// `--dry-run` se mira antes de lanzarlo.
///
/// ## Lo que NO toca
///
/// Solo vacía **coincidencias exactas** de `Font.placeholderNames` y solo en fuentes
/// **sin creador**. Las dos condiciones importan:
///
/// - Sin creador ⇒ importada. Una fuente que puso una persona y llamó «Font» la llamó
///   así queriendo, y eso es un topónimo aunque coincida con la lista.
/// - Coincidencia exacta ⇒ «Font de la Teula» o «Källa vid vägen» no se tocan. Son
///   nombres propios y traducirlos impediría preguntar por la fuente o reconocer su
///   cartel.
struct ClearPlaceholderNamesCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Flag(name: "dry-run", help: "Cuenta lo que haría y no escribe nada")
        var dryRun: Bool
        init() {}
    }

    var help: String { "Vacía los nombres genéricos que se pusieron a los puntos sin nombre de OSM" }

    func run(using context: CommandContext, signature: Signature) async throws {
        let db = context.application.db
        guard let sql = db as? SQLDatabase else {
            context.console.error("Hace falta una base de datos SQL.")
            return
        }

        let nombres = Font.placeholderNames.sorted()

        struct Fila: Decodable { let name: String; let n: Int }
        let previo = try await sql.raw("""
            SELECT name, count(*)::int AS n FROM fonts
            WHERE created_by IS NULL AND name = ANY(\(bind: nombres))
            GROUP BY name ORDER BY n DESC
            """).all(decoding: Fila.self)

        let total = previo.reduce(0) { $0 + $1.n }
        guard total > 0 else {
            context.console.info("No queda ningún nombre de relleno.")
            return
        }

        for f in previo {
            context.console.info("  \(f.name): \(f.n)")
        }

        if signature.dryRun {
            context.console.warning("Ensayo en seco: se vaciarían \(total) nombres. No se ha escrito nada.")
            return
        }

        try await sql.raw("""
            UPDATE fonts SET name = NULL
            WHERE created_by IS NULL AND name = ANY(\(bind: nombres))
            """).run()
        context.console.info("Vaciados \(total) nombres de relleno.")
    }
}
