import Fluent
import Foundation
import Vapor

/// Rellena la portada de las fuentes que **ya tienen la foto hecha** dentro de una
/// reseña y la ficha en blanco.
///
/// Uso: `swift run App adopt-cover-photos [--dry-run] [--limit <n>]`
///
/// Por qué existe: hasta ahora la única forma de que una foto llegara a la portada era
/// que alguien pulsara «usar como foto principal», un botón que solo aparece dentro de la
/// tarjeta de la reseña y **después** de publicarla. Prácticamente nadie lo pulsa. Esto es
/// la pasada retroactiva; de aquí en adelante lo hace sola la propia publicación de la
/// reseña (ver `CoverPhoto`).
///
/// **Cuántas eran de verdad: 4**, medido en producción el 19/08/2026 sobre 70.975 fuentes
/// sin portada. La estimación previa —«168 esperando»— salió de una base de desarrollo
/// **sembrada con `seed --demo`**, cuyas fotos son `/demo/*.svg`; descontándolas quedaba
/// una. La moraleja vale para cualquier medición futura de este repo: una base local con
/// datos de ejemplo no dice nada sobre producción, y aquí llegó a invertir la conclusión
/// (de «esto duplica la cobertura de fotos» a «esto arregla cuatro fichas»).
///
/// Se ataja por la reseña con foto **más antigua** de cada fuente: es la que lleva más
/// tiempo siendo lo único que hay, y quien la subió no tuvo nunca la ocasión de
/// ascenderla. Cada ascenso deja su entrada en el historial de ediciones, así que se
/// puede revertir una a una desde el panel.
struct AdoptCoverPhotosCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Flag(name: "dry-run", help: "Solo enseña lo que haría, sin escribir nada")
        var dryRun: Bool
        @Option(name: "limit", help: "Como mucho N fuentes (para probar en producción sin soltarlo todo)")
        var limit: Int?
    }

    var help: String { "Asciende a portada la foto que ya está dentro de una reseña, en las fuentes que no tienen ninguna" }

    func run(using context: CommandContext, signature: Signature) async throws {
        let db = context.application.db
        let storage = context.application.imageStorage
        let out = context.console

        // Fuentes sin portada que tengan alguna reseña con foto. Se piden las fuentes y
        // luego sus reseñas: son cientos, no millones, y así la consulta se lee.
        let candidatas = try await Font.query(on: db)
            .filter(\.$image == nil)
            .all()
        var sinFoto: [UUID: Font] = [:]
        for f in candidatas { if let id = f.id { sinFoto[id] = f } }

        let conFoto = try await FontComment.query(on: db)
            .filter(\.$image != nil)
            .sort(\.$createdAt, .ascending)   // la más antigua de cada fuente gana
            .all()
            // Solo lo que el almacén sabe copiar: `/uploads/<f>` en disco y
            // `<base>/uploads/<f>` en R2. En desarrollo, `seed --demo` mete fotos
            // `/demo/*.svg` que no son ficheros nuestros, y sin esto la pasada de
            // prueba salían 168 avisos de una base que no tiene ni una foto real.
            .filter { $0.image?.contains("/uploads/") == true }

        // Primera reseña con foto de cada fuente candidata, respetando el orden.
        var elegidas: [(Font, FontComment)] = []
        var vistas = Set<UUID>()
        for c in conFoto {
            let fid = c.$font.id
            guard let font = sinFoto[fid], !vistas.contains(fid) else { continue }
            vistas.insert(fid)
            elegidas.append((font, c))
        }
        if let limite = signature.limit { elegidas = Array(elegidas.prefix(limite)) }

        out.print("Fuentes sin portada: \(sinFoto.count)")
        out.print("De ésas, con foto esperando en una reseña: \(elegidas.count)")
        guard !elegidas.isEmpty else { return }

        if signature.dryRun {
            for (font, c) in elegidas.prefix(20) {
                out.print("  · \(font.name ?? "(sin nombre)") ← \(c.image ?? "?")")
            }
            if elegidas.count > 20 { out.print("  … y \(elegidas.count - 20) más") }
            out.print("Nada escrito (--dry-run).")
            return
        }

        var hechas = 0, fallos = 0
        for (font, c) in elegidas {
            do {
                // `editorID` nulo a propósito: no lo decidió nadie, lo decidió esta
                // pasada. El historial lo enseñará sin firmar, igual que las incidencias
                // que se cierran solas.
                if try await CoverPhoto.adopt(font: font, from: c, storage: storage, on: db) {
                    hechas += 1
                }
            } catch {
                fallos += 1
                out.warning("No se pudo con «\(font.name ?? "(sin nombre)")»: \(error)")
            }
        }
        out.print("Portadas puestas: \(hechas)\(fallos > 0 ? " · fallos: \(fallos)" : "")")
    }
}
