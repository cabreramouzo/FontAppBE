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

    func run(using context: CommandContext, signature: Signature) async throws {
        let db = context.application.db
        guard let ine = try await resuelve(signature.municipio, on: db, console: context.console) else { return }
        guard let r = try await MunicipalReport.of(ine: ine, on: db) else {
            context.console.warning("El municipio \(ine) no tiene ninguna fuente visible.")
            return
        }
        let filas = r.items
        let nombre = r.municipality

        let ahora = Date()

        // ## El resumen por pantalla
        let c = context.console
        c.info("")
        c.info("Fuentes de \(nombre) (INE \(ine))")
        c.info(String(repeating: "─", count: 40))
        c.info("Inventario:            \(r.fonts) fuentes en el mapa")
        if r.hiddenDuplicates + r.retired > 0 {
            c.info("  (fuera del recuento: \(r.hiddenDuplicates) duplicadas, \(r.retired) retiradas)")
        }
        c.info("Por tipo:              \(describe(r.bySource))")
        c.info("Potabilidad declarada: \(describe(r.byDrinkable))")
        c.info("Con foto:              \(r.withPhoto)")
        c.info("Puestas por una persona: \(r.byPeople) (el resto vienen de mapas abiertos)")
        c.info("")
        c.info("Estado del agua:")
        c.info("  Comprobadas alguna vez:  \(r.checkedEver) de \(r.fonts) (\(pct(r.checkedEver, r.fonts)))")
        c.info("  Sin comprobar nunca:     \(r.neverChecked)")
        c.info("  Más de \(MunicipalReport.olvidadaDias) días sin nadie: \(r.staleOverYear)")
        if !r.byLastStatus.isEmpty {
            c.info("  Último parte:            \(describe(r.byLastStatus))")
        }
        c.info("  Incidencias abiertas:    \(r.openReports)")
        c.info("")

        guard !signature.dryRun else { return }

        let carpeta = signature.out ?? FileManager.default.currentDirectoryPath
        let base = URL(fileURLWithPath: carpeta).appendingPathComponent(ine)
        try escribe(csv(filas), a: base.appendingPathExtension("fuentes.csv"))
        try escribe(geojson(filas, nombre: nombre, ine: ine), a: base.appendingPathExtension("fuentes.geojson"))
        try escribe(json(r, ahora: ahora), a: base.appendingPathExtension("informe.json"))
        c.info("Escritos \(ine).fuentes.csv, \(ine).fuentes.geojson y \(ine).informe.json en \(carpeta)")
    }

    // MARK: - Resolver el municipio

    /// Acepta el código INE o el nombre. Con el nombre puede haber empate —hay municipios
    /// que se llaman igual en provincias distintas—, y entonces **no elige**: lista los
    /// códigos y para. Elegir uno por su cuenta significaría entregarle a un ayuntamiento
    /// el inventario de otro.
    private func resuelve(_ entrada: String, on db: any Database, console: any Console) async throws -> String? {
        let limpio = entrada.trimmingCharacters(in: .whitespaces)
        if limpio.count == 5, limpio.allSatisfy(\.isNumber) { return limpio }

        let candidatos = try await MunicipalReport.candidates(name: limpio, on: db)
        switch candidatos.count {
        case 0:
            console.error("No hay ningún municipio llamado «\(limpio)» con fuentes.")
            return nil
        case 1:
            return candidatos[0].ine
        default:
            console.warning("«\(limpio)» es ambiguo. Repite con el código INE:")
            for c in candidatos { console.info("  \(c.ine)  \(c.municipality)  (\(c.fonts) fuentes)") }
            return nil
        }
    }

    // MARK: - Ficheros

    private func csv(_ filas: [MunicipalReport.Item]) -> String {
        var out = "id,nombre,latitud,longitud,tipo,potabilidad_declarada,tiene_foto,resenas,ultimo_estado,dias_desde_la_ultima,incidencias_abiertas\n"
        for f in filas {
            let campos: [String] = [
                f.id.uuidString,
                f.name ?? "",
                String(format: "%.6f", f.latitude),
                String(format: "%.6f", f.longitude),
                f.source ?? "",
                f.drinkable ?? "",
                f.hasPhoto ? "sí" : "no",
                String(f.reviews),
                f.lastStatus ?? "",
                f.days.map(String.init) ?? "",
                String(f.openReports),
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

    private func geojson(_ filas: [MunicipalReport.Item], nombre: String, ine: String) -> String {
        let features: [[String: Any]] = filas.map { f in
            [
                "type": "Feature",
                "geometry": ["type": "Point", "coordinates": [f.longitude, f.latitude]],
                "properties": [
                    "id": f.id.uuidString,
                    "nombre": f.name as Any? ?? NSNull(),
                    "tipo": f.source as Any? ?? NSNull(),
                    "potabilidad_declarada": f.drinkable as Any? ?? NSNull(),
                    "tiene_foto": f.hasPhoto,
                    "resenas": f.reviews,
                    "ultimo_estado": f.lastStatus as Any? ?? NSNull(),
                    "incidencias_abiertas": f.openReports,
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

    private func json(_ r: MunicipalReport, ahora: Date) -> String {
        let iso = ISO8601DateFormatter()
        let root: [String: Any] = [
            "municipio": r.municipality,
            "ine": r.ine,
            "generado": iso.string(from: ahora),
            "inventario": [
                "fuentes": r.fonts,
                "con_foto": r.withPhoto,
                "puestas_por_personas": r.byPeople,
                "duplicadas_ocultas": r.hiddenDuplicates,
                "retiradas": r.retired,
                "por_tipo": r.bySource,
                "por_potabilidad_declarada": r.byDrinkable,
            ],
            "estado": [
                "comprobadas_alguna_vez": r.checkedEver,
                "sin_comprobar_nunca": r.neverChecked,
                "olvidadas_mas_de_un_ano": r.staleOverYear,
                "incidencias_abiertas": r.openReports,
                "por_ultimo_parte": r.byLastStatus,
            ],
            "licencia": "Datos bajo ODbL; fotos bajo CC BY-SA 4.0. Atribución: FontApp y sus colaboradores.",
        ]
        let datos = (try? JSONSerialization.data(withJSONObject: root, options: [.prettyPrinted, .sortedKeys])) ?? Data()
        return String(data: datos, encoding: .utf8) ?? "{}"
    }

    private func escribe(_ texto: String, a url: URL) throws {
        try texto.write(to: url, atomically: true, encoding: .utf8)
    }

    // MARK: - Presentación

    private func describe(_ r: [String: Int]) -> String {
        r.sorted { ($0.value, $1.key) > ($1.value, $0.key) }
            .map { "\($0.key) \($0.value)" }
            .joined(separator: " · ")
    }

    private func pct(_ n: Int, _ total: Int) -> String {
        total == 0 ? "0 %" : String(format: "%.1f %%", 100.0 * Double(n) / Double(total))
    }
}
