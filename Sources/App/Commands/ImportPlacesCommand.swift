import Fluent
import Foundation
import SQLKit
import Vapor

/// Carga los núcleos de población y cuenta cuántas fuentes tiene cada uno cerca.
///
///     swift run App import-places nuclis-es.json [--dry-run]
///
/// El fichero lo produce `scripts/nuclis-osm.py` a partir de un volcado de Overpass. Es
/// idempotente: vuelve a pasar por encima de lo que ya está, así que se puede relanzar
/// cuando se importe un país nuevo.
///
/// ## El recuento es la mitad del trabajo
///
/// `font_count` decide **si la página existe**. Un pueblo sin fuentes cerca no tiene nada
/// que enseñar, y publicar páginas vacías en el sitemap no es neutro: le dice a Google que
/// el sitio está lleno de relleno. Se cuenta aquí y no al servir la página porque son
/// 8.790 consultas y esto se ejecuta una vez.
struct ImportPlacesCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Argument(name: "fichero", help: "JSON compacto de núcleos (ver scripts/nuclis-osm.py)")
        var fichero: String
        @Flag(name: "dry-run", help: "No escribe: solo dice qué haría")
        var dryRun: Bool
    }

    var help: String { "Importa núcleos de población para las páginas por pueblo" }

    private struct Nucleo: Decodable {
        let n: String
        let la: Double
        let lo: Double
        let t: String
    }

    func run(using context: CommandContext, signature: Signature) async throws {
        let datos = try Data(contentsOf: URL(fileURLWithPath: signature.fichero))
        let nucleos = try JSONDecoder().decode([Nucleo].self, from: datos)
        context.console.info("\(nucleos.count) núcleos en el fichero.")

        let db = context.application.db
        guard let sql = db as? any SQLDatabase else {
            context.console.error("Hace falta PostgreSQL.")
            return
        }

        // Los slugs asignados EN ESTA PASADA, para desempatar nombres repetidos.
        //
        // **No se siembra con los que ya hay en la base**, que es lo que hacía y rompía la
        // idempotencia que este comando promete: en la segunda pasada todos los slugs
        // estaban «ocupados», así que cada núcleo recibía sufijo en vez de actualizar el
        // suyo y la tabla se duplicaba —16.904 filas para un fichero de 8.790, con `moia`
        // y `moia-cf7c` apuntando al mismo pueblo—. Y no falla nada: el comando termina
        // diciendo «8.700 nuevos», que suena a que ha ido bien.
        //
        // Vacío es lo correcto porque el fichero viene ordenado y el desempate sale de las
        // coordenadas: dos pasadas sobre el mismo fichero asignan exactamente los mismos
        // slugs, y cada uno encuentra su fila y la actualiza.
        var usados = Set<String>()
        var nuevos = 0, actualizados = 0, conFuentes = 0

        var fallos = 0
        for n in nucleos {
            do {
            let slug = Self.slug(n.n, lat: n.la, long: n.lo, usados: &usados)
            let lugar = try await Place.query(on: db).filter(\.$slug == slug).first()
                ?? Place(slug: slug, name: n.n, kind: n.t, latitude: n.la, longitude: n.lo)
            let esNuevo = lugar.id == nil
            lugar.name = n.n
            lugar.kind = n.t
            lugar.latitude = n.la
            lugar.longitude = n.lo

            // Caja + haversine, como el resto de la app. La caja la resuelve el índice y
            // el haversine afina; a estas latitudes la diferencia importa.
            let (cuantas, pais, region) = try await Self.alrededor(
                lat: n.la, long: n.lo, km: lugar.radioKm, on: sql)
            lugar.fontCount = cuantas
            lugar.country = pais
            lugar.region = region
            if cuantas > 0 { conFuentes += 1 }

            if !signature.dryRun { try await lugar.save(on: db) }
            if esNuevo { nuevos += 1 } else { actualizados += 1 }
            } catch {
                // Un núcleo que falla no puede tirar la pasada entera.
                //
                // Contra una base remota esto tarda tres cuartos de hora, y Neon cierra la
                // conexión antes de acabar: la primera ejecución murió en el 93 % con un
                // «Operation timed out» y perdió los 587 que faltaban. El pool reconecta
                // solo en el siguiente intento, así que seguir adelante convierte una
                // ejecución perdida en unos pocos huecos — y como esto es idempotente,
                // relanzarlo los rellena.
                fallos += 1
                if fallos <= 5 { context.console.warning("Fallo en \(n.n): \(error)") }
            }
        }

        context.console.info("Nuevos: \(nuevos) · actualizados: \(actualizados)")
        if fallos > 0 {
            context.console.warning("Fallaron \(fallos). Relanza el comando: es idempotente y solo rellenará los huecos.")
        }
        context.console.info("Con fuentes cerca (los únicos con página): \(conFuentes)")
        if signature.dryRun { context.console.warning("--dry-run: no se ha escrito nada.") }
    }

    /// Cuántas fuentes visibles hay en el radio, y de qué país y demarcación son.
    ///
    /// El país y la demarcación se heredan de **la fuente más repetida** del entorno y no
    /// de un fichero de fronteras: es el mismo criterio que `inheritZone` y que el rescate
    /// de la insignia de Catalunya, donde está medido que el vecino clasificado acierta
    /// más que el borde de Natural Earth.
    private static func alrededor(lat: Double, long: Double, km: Double,
                                  on sql: any SQLDatabase) async throws -> (Int, String?, String?) {
        let dLat = km / 111.0
        let dLong = km / (111.0 * max(0.1, cos(lat * .pi / 180)))
        struct Fila: Decodable { let total: Int; let country: String?; let region: String? }
        let fila = try await sql.raw("""
            SELECT count(*)::int AS total,
                   mode() WITHIN GROUP (ORDER BY country) AS country,
                   mode() WITHIN GROUP (ORDER BY region) AS region
            FROM fonts
            WHERE latitude BETWEEN \(bind: lat - dLat) AND \(bind: lat + dLat)
              AND longitude BETWEEN \(bind: long - dLong) AND \(bind: long + dLong)
              AND \(unsafeRaw: Font.visibleSQL)
            """).first(decoding: Fila.self)
        return (fila?.total ?? 0, fila?.country, fila?.region)
    }

    /// Slug estable a partir del nombre.
    ///
    /// 86 de los 8.790 nombres se repiten («El Campillo» hay tres). Se desempata con
    /// cuatro caracteres derivados de **las coordenadas** y no con un contador: un contador
    /// depende del orden del fichero, así que la próxima importación podría intercambiar
    /// dos pueblos y dejar dos URLs publicadas apuntando al sitio equivocado.
    static func slug(_ nombre: String, lat: Double, long: Double, usados: inout Set<String>) -> String {
        let base = baseSlug(nombre)
        if !usados.contains(base) {
            usados.insert(base)
            return base
        }
        let sufijo = String(format: "%04x", abs(Int(lat * 1000) &* 31 &+ Int(long * 1000)) % 65536)
        let conSufijo = "\(base)-\(sufijo)"
        usados.insert(conSufijo)
        return conSufijo
    }

    static func baseSlug(_ nombre: String) -> String {
        let sinAcentos = nombre.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
        var salida = ""
        var guionPendiente = false
        for c in sinAcentos.unicodeScalars {
            if CharacterSet.alphanumerics.contains(c), c.isASCII {
                if guionPendiente, !salida.isEmpty { salida.append("-") }
                guionPendiente = false
                salida.unicodeScalars.append(c)
            } else {
                guionPendiente = true
            }
        }
        return salida
    }
}
