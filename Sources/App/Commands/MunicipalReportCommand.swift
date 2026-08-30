import Fluent
import Foundation
import SQLKit
import Vapor

/// El inventario de fuentes de un municipio, listo para enseñárselo a su ayuntamiento.
///
///     swift run App municipal-report 08127 [--out carpeta]
///     swift run App municipal-report Moià
///
/// Escribe tres ficheros —`<ine>-informe.json`, `<ine>-fuentes.csv` y
/// `<ine>-fuentes.geojson`— e imprime el resumen por pantalla.
///
/// ## Por qué esto es lo primero y no un panel
///
/// Es el paso 2 de la escalera de validación de `docs/monetizacion.md`: **enseñar un
/// informe hecho con sus propios datos** antes de construir producto. Cuesta un comando y
/// no exige cuentas, permisos ni multi-tenancy, y sirve para lo único que importa ahora,
/// que es conseguir una reunión. Ver `docs/ayuntamientos.md`.
///
/// ## Lo que NO promete
///
/// El estado del agua está casi vacío en toda la base (medido en producción el
/// 30/08/2026: 122 reseñas y 145 fotos), así que el informe **dice en voz alta cuántas
/// están sin comprobar** en vez de enseñar un cuadro de mandos vacío y dejar que parezca
/// un fallo. Esa carencia es la mitad de la conversación de venta: el inventario lo
/// tenemos, el estado hay que salir a buscarlo.
///
/// Y no certifica potabilidad: `drinkable` es lo que **declara** el origen del dato o
/// quien editó la ficha, y el informe lo llama así.
struct MunicipalReportCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Argument(name: "municipio", help: "Código INE (5 dígitos) o nombre del municipio")
        var municipio: String
        @Option(name: "out", help: "Carpeta donde escribir los ficheros (por defecto, la actual)")
        var out: String?
        @Flag(name: "dry-run", help: "Solo imprime el resumen; no escribe ficheros")
        var dryRun: Bool
    }

    var help: String { "Informe e inventario de las fuentes de un municipio" }

    /// Sin comprobar desde hace más de esto, en días. Es el corte de «Centinela» y el de
    /// la curva del baremo: tres cortes distintos para la misma idea serían tres
    /// explicaciones distintas de por qué algo sale en rojo.
    static let olvidadaDias = 365

    private struct Fila: Decodable {
        let id: UUID
        let name: String?
        let latitude: Double
        let longitude: Double
        let source: String?
        let drinkable: String?
        let image: String?
        let created_by: UUID?
        let created_at: Date?
        let municipality: String?
        let municipality_ine: String?
        /// Última reseña con estado, si alguien ha pasado alguna vez.
        let last_status: String?
        let last_at: Date?
        let reviews: Int
        /// Incidencias abiertas ahora mismo.
        let open_reports: Int
    }

    func run(using context: CommandContext, signature: Signature) async throws {
        guard let sql = context.application.db as? any SQLDatabase else {
            context.console.error("Hace falta PostgreSQL.")
            return
        }
        guard let ine = try await resuelve(signature.municipio, on: sql, console: context.console) else { return }

        // Una sola consulta con todo lo que cuelga de cada fuente. Los `LEFT JOIN LATERAL`
        // evitan traerse el historial entero de reseñas: de cada fuente solo interesa la
        // última con estado y dos recuentos.
        let filas = try await sql.raw("""
            SELECT f.id, f.name, f.latitude, f.longitude, f.source, f.drinkable, f.image,
                   f.created_by, f.created_at, f.municipality, f.municipality_ine,
                   ultima.water_status AS last_status, ultima.created_at AS last_at,
                   COALESCE(r.n, 0) AS reviews,
                   COALESCE(inc.n, 0) AS open_reports
            FROM fonts f
            LEFT JOIN LATERAL (
              SELECT c.water_status, c.created_at FROM font_comments c
              WHERE c.font_id = f.id AND c.water_status IS NOT NULL
              ORDER BY c.created_at DESC LIMIT 1
            ) ultima ON true
            LEFT JOIN LATERAL (
              SELECT count(*) AS n FROM font_comments c WHERE c.font_id = f.id
            ) r ON true
            LEFT JOIN LATERAL (
              SELECT count(*) AS n FROM font_reports fr
              WHERE fr.font_id = f.id AND fr.resolved_at IS NULL
            ) inc ON true
            WHERE f.municipality_ine = \(bind: ine)
              -- Solo las que están en pie. Las duplicadas y las retiradas se cuentan
              -- aparte: no son inventario, pero callarlas del todo haría que las cifras
              -- no cuadraran con lo que se ve en el mapa.
              AND \(unsafeRaw: Font.visibleSQL)
            ORDER BY f.name NULLS LAST, f.id
            """).all(decoding: Fila.self)

        guard !filas.isEmpty else {
            context.console.warning("El municipio \(ine) no tiene ninguna fuente visible.")
            return
        }
        let nombre = filas.first?.municipality ?? ine

        let escondidas = try await sql.raw("""
            SELECT count(*) FILTER (WHERE duplicate_of IS NOT NULL) AS duplicadas,
                   count(*) FILTER (WHERE retired_at IS NOT NULL) AS retiradas
            FROM fonts WHERE municipality_ine = \(bind: ine)
            """).first(decoding: Escondidas.self) ?? Escondidas(duplicadas: 0, retiradas: 0)

        let ahora = Date()
        let dias: (Date?) -> Int? = { f in f.map { Int(ahora.timeIntervalSince($0) / 86_400) } }

        let comprobadas = filas.filter { $0.reviews > 0 }
        let olvidadas = filas.filter { f in
            guard let d = dias(f.last_at) else { return false }
            return d >= Self.olvidadaDias
        }
        let sinComprobar = filas.filter { $0.last_at == nil }
        let incidencias = filas.filter { $0.open_reports > 0 }

        func reparto(_ clave: (Fila) -> String?) -> [String: Int] {
            var r: [String: Int] = [:]
            for f in filas { r[clave(f) ?? "(sin declarar)", default: 0] += 1 }
            return r
        }

        // ## El resumen por pantalla
        let c = context.console
        c.info("")
        c.info("Fuentes de \(nombre) (INE \(ine))")
        c.info(String(repeating: "─", count: 40))
        c.info("Inventario:            \(filas.count) fuentes en el mapa")
        if escondidas.duplicadas + escondidas.retiradas > 0 {
            c.info("  (fuera del recuento: \(escondidas.duplicadas) duplicadas, \(escondidas.retiradas) retiradas)")
        }
        c.info("Por tipo:              \(describe(reparto { $0.source }))")
        c.info("Potabilidad declarada: \(describe(reparto { $0.drinkable }))")
        c.info("Con foto:              \(filas.filter { $0.image != nil }.count)")
        c.info("Puestas por una persona: \(filas.filter { $0.created_by != nil }.count) (el resto vienen de mapas abiertos)")
        c.info("")
        c.info("Estado del agua:")
        c.info("  Comprobadas alguna vez:  \(comprobadas.count) de \(filas.count) (\(pct(comprobadas.count, filas.count)))")
        c.info("  Sin comprobar nunca:     \(sinComprobar.count)")
        c.info("  Más de \(Self.olvidadaDias) días sin nadie: \(olvidadas.count)")
        if !comprobadas.isEmpty {
            c.info("  Último parte:            \(describe(repartoDe(comprobadas.map { $0.last_status })))")
        }
        c.info("  Incidencias abiertas:    \(incidencias.count)")
        c.info("")

        guard !signature.dryRun else { return }

        let carpeta = signature.out ?? FileManager.default.currentDirectoryPath
        let base = URL(fileURLWithPath: carpeta).appendingPathComponent(ine)
        try escribe(csv(filas, dias: dias), a: base.appendingPathExtension("fuentes.csv"))
        try escribe(geojson(filas, nombre: nombre, ine: ine), a: base.appendingPathExtension("fuentes.geojson"))
        try escribe(json(filas, nombre: nombre, ine: ine, escondidas: escondidas,
                         comprobadas: comprobadas.count, olvidadas: olvidadas.count,
                         incidencias: incidencias.count, ahora: ahora),
                    a: base.appendingPathExtension("informe.json"))
        c.info("Escritos \(ine).fuentes.csv, \(ine).fuentes.geojson y \(ine).informe.json en \(carpeta)")
    }

    // MARK: - Resolver el municipio

    /// Acepta el código INE o el nombre. Con el nombre puede haber empate —hay municipios
    /// que se llaman igual en provincias distintas—, y entonces **no elige**: lista los
    /// códigos y para. Elegir uno por su cuenta significaría entregarle a un ayuntamiento
    /// el inventario de otro.
    private func resuelve(_ entrada: String, on sql: any SQLDatabase, console: any Console) async throws -> String? {
        let limpio = entrada.trimmingCharacters(in: .whitespaces)
        if limpio.count == 5, limpio.allSatisfy(\.isNumber) { return limpio }

        struct Candidato: Decodable { let municipality: String; let municipality_ine: String; let n: Int }
        let candidatos = try await sql.raw("""
            SELECT municipality, municipality_ine, count(*)::int AS n FROM fonts
            WHERE lower(municipality) = lower(\(bind: limpio))
            GROUP BY 1, 2 ORDER BY 3 DESC
            """).all(decoding: Candidato.self)

        switch candidatos.count {
        case 0:
            console.error("No hay ningún municipio llamado «\(limpio)» con fuentes.")
            return nil
        case 1:
            return candidatos[0].municipality_ine
        default:
            console.warning("«\(limpio)» es ambiguo. Repite con el código INE:")
            for c in candidatos { console.info("  \(c.municipality_ine)  \(c.municipality)  (\(c.n) fuentes)") }
            return nil
        }
    }

    // MARK: - Ficheros

    private func csv(_ filas: [Fila], dias: (Date?) -> Int?) -> String {
        var out = "id,nombre,latitud,longitud,tipo,potabilidad_declarada,tiene_foto,resenas,ultimo_estado,dias_desde_la_ultima,incidencias_abiertas\n"
        for f in filas {
            let campos: [String] = [
                f.id.uuidString,
                f.name ?? "",
                String(format: "%.6f", f.latitude),
                String(format: "%.6f", f.longitude),
                f.source ?? "",
                f.drinkable ?? "",
                f.image != nil ? "sí" : "no",
                String(f.reviews),
                f.last_status ?? "",
                dias(f.last_at).map(String.init) ?? "",
                String(f.open_reports),
            ]
            out += campos.map(escapaCSV).joined(separator: ",") + "\n"
        }
        return out
    }

    /// Comillas dobles alrededor y dobladas dentro. Un topónimo con una coma —«Font de la
    /// Roca, la vella»— parte la fila en dos columnas y el fichero entero se lee corrido,
    /// que es el mismo tipo de fallo silencioso que el `&` sin escapar en el GPX.
    private func escapaCSV(_ s: String) -> String {
        guard s.contains(where: { $0 == "," || $0 == "\"" || $0 == "\n" }) else { return s }
        return "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }

    private func geojson(_ filas: [Fila], nombre: String, ine: String) -> String {
        let features: [[String: Any]] = filas.map { f in
            [
                "type": "Feature",
                "geometry": ["type": "Point", "coordinates": [f.longitude, f.latitude]],
                "properties": [
                    "id": f.id.uuidString,
                    "nombre": f.name as Any? ?? NSNull(),
                    "tipo": f.source as Any? ?? NSNull(),
                    "potabilidad_declarada": f.drinkable as Any? ?? NSNull(),
                    "tiene_foto": f.image != nil,
                    "resenas": f.reviews,
                    "ultimo_estado": f.last_status as Any? ?? NSNull(),
                    "incidencias_abiertas": f.open_reports,
                ],
            ]
        }
        let root: [String: Any] = [
            "type": "FeatureCollection",
            "name": "Fuentes de \(nombre) (INE \(ine))",
            // La atribución viaja **dentro** del fichero: los datos son de OpenStreetMap
            // (ODbL) y del ICGC/ACA (CC BY 4.0), y un GeoJSON se reenvía suelto por correo
            // sin la página que lo explicaba.
            "attribution": "FontApp y sus colaboradores · OpenStreetMap (ODbL) · ICGC/ACA (CC BY 4.0)",
            "features": features,
        ]
        let datos = (try? JSONSerialization.data(withJSONObject: root, options: [.prettyPrinted, .sortedKeys])) ?? Data()
        return String(data: datos, encoding: .utf8) ?? "{}"
    }

    private func json(_ filas: [Fila], nombre: String, ine: String, escondidas: Escondidas,
                      comprobadas: Int, olvidadas: Int, incidencias: Int, ahora: Date) -> String {
        let iso = ISO8601DateFormatter()
        let root: [String: Any] = [
            "municipio": nombre,
            "ine": ine,
            "generado": iso.string(from: ahora),
            "inventario": [
                "fuentes": filas.count,
                "con_foto": filas.filter { $0.image != nil }.count,
                "puestas_por_personas": filas.filter { $0.created_by != nil }.count,
                "duplicadas_ocultas": escondidas.duplicadas,
                "retiradas": escondidas.retiradas,
                "por_tipo": Dictionary(grouping: filas, by: { $0.source ?? "sin declarar" }).mapValues(\.count),
                "por_potabilidad_declarada": Dictionary(grouping: filas, by: { $0.drinkable ?? "sin declarar" }).mapValues(\.count),
            ],
            "estado": [
                "comprobadas_alguna_vez": comprobadas,
                "sin_comprobar_nunca": filas.filter { $0.last_at == nil }.count,
                "olvidadas_mas_de_un_ano": olvidadas,
                "incidencias_abiertas": incidencias,
                "por_ultimo_parte": Dictionary(grouping: filas.compactMap(\.last_status), by: { $0 }).mapValues(\.count),
            ],
            "licencia": "Datos bajo ODbL; fotos bajo CC BY-SA 4.0. Atribución: FontApp y sus colaboradores.",
        ]
        let datos = (try? JSONSerialization.data(withJSONObject: root, options: [.prettyPrinted, .sortedKeys])) ?? Data()
        return String(data: datos, encoding: .utf8) ?? "{}"
    }

    private struct Escondidas: Decodable { let duplicadas: Int; let retiradas: Int }

    private func escribe(_ texto: String, a url: URL) throws {
        try texto.write(to: url, atomically: true, encoding: .utf8)
    }

    // MARK: - Presentación

    private func repartoDe(_ valores: [String?]) -> [String: Int] {
        var r: [String: Int] = [:]
        for v in valores.compactMap({ $0 }) { r[v, default: 0] += 1 }
        return r
    }

    private func describe(_ r: [String: Int]) -> String {
        r.sorted { ($0.value, $1.key) > ($1.value, $0.key) }
            .map { "\($0.key) \($0.value)" }
            .joined(separator: " · ")
    }

    private func pct(_ n: Int, _ total: Int) -> String {
        total == 0 ? "0 %" : String(format: "%.1f %%", 100.0 * Double(n) / Double(total))
    }
}
