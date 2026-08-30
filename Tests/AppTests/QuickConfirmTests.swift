import Fluent
import XCTVapor
@testable import App

/// El contrato del que depende que el globo del mapa confirme en vez de repetir.
///
/// Los tres chips del globo solo sabían crear reseñas, así que tocar «sale agua» sobre una
/// fuente que ya lo decía desde hacía una hora publicaba un parte repetido en lugar de
/// respaldar el que había. Para decidirlo, el cliente necesita del resumen del mapa dos
/// datos que antes no salían: **qué parte es el último** y **de cuándo es ese parte**.
///
/// Los dos son contrato de cable: si dejan de salir, el globo no se rompe —vuelve a crear
/// reseñas— y **nadie se entera**. Por eso hay test.
final class QuickConfirmTests: XCTestCase {
    private func withApp(_ test: (Application) async throws -> Void) async throws {
        setenv("DATABASE_NAME", "fontapp_test", 1)
        let app = try await Application.make(.testing)
        do {
            try await configure(app)
            try? await app.autoRevert()
            try await app.autoMigrate()
            try await test(app)
            try await app.autoRevert()
        } catch {
            try? await app.autoRevert()
            try await app.asyncShutdown()
            throw error
        }
        try await app.asyncShutdown()
    }

    private func usuario(_ app: Application, _ nombre: String) async throws -> User {
        let n = Int.random(in: 1...999_999)
        let u = User(name: nombre, username: "\(nombre)\(n)", email: "\(nombre)\(n)@x.test",
                     passwordHash: try Bcrypt.hash("password123"))
        try await u.save(on: app.db)
        return u
    }

    /// El último parte sale identificado y con su propia fecha, por las dos puertas.
    ///
    /// `summaries(forIDs:)` es la de producción (SQL agregado en PostgreSQL) y
    /// `summaries(for:)` con modelos es el respaldo sin SQL crudo. Se comprueban las dos
    /// porque la consulta cruda y el camino de Fluent se han separado antes: fue así como
    /// `/fonts/near` empezó a devolver las fuentes en orden arbitrario.
    func testElUltimoParteSaleIdentificadoYConSuFecha() async throws {
        try await withApp { app in
            let u = try await usuario(app, "vecina")
            let f = Font(name: "Font del Roure", latitude: 41.75, longitude: 2.16)
            try await f.save(on: app.db)
            let vieja = FontComment(fontID: try f.requireID(), userID: try u.requireID(),
                                    body: "", rating: nil, waterStatus: "trickle", image: nil)
            try await vieja.save(on: app.db)
            vieja.createdAt = Date().addingTimeInterval(-40 * 86_400)
            try await vieja.save(on: app.db)

            let ultima = FontComment(fontID: try f.requireID(), userID: try u.requireID(),
                                     body: "", rating: nil, waterStatus: "flowing", image: nil)
            try await ultima.save(on: app.db)

            for resumen in [try await Font.summaries(forIDs: [f.requireID()], on: app.db),
                            try await Font.summaries(for: [f], on: app.db)] {
                let s = try XCTUnwrap(resumen.first)
                XCTAssertEqual(s.lastWaterStatus, "flowing")
                XCTAssertEqual(s.lastCommentID, ultima.id, "tiene que ser el ÚLTIMO parte, no el primero")
                let fecha = try XCTUnwrap(s.lastReportAt)
                XCTAssertLessThan(abs(fecha.timeIntervalSince(try XCTUnwrap(ultima.createdAt))), 1)
            }
        }
    }

    /// **La razón de que `lastReportAt` exista** y no se reutilice `lastUpdate`.
    ///
    /// `lastUpdate` es la fecha más fresca entre el parte y sus confirmaciones, así que una
    /// confirmación de hoy la trae a hoy. Pero la curva de frescura del baremo mide desde la
    /// **reseña** anterior (`freshness(daysSincePrevious:)` solo mira fechas de reseña), y
    /// de esa curva depende el corte de 7 días del globo. Si el cliente decidiera con
    /// `lastUpdate`, una fuente reseñada hace cuarenta días y confirmada hoy parecería
    /// fresca y cambiaríamos por una confirmación de 10 gotas una reseña que paga 35.
    func testConfirmarMueveLaActualizacionPeroNoLaFechaDelParte() async throws {
        try await withApp { app in
            let autora = try await usuario(app, "autora")
            let otra = try await usuario(app, "otra")
            let f = Font(name: "Font de la Riera", latitude: 41.75, longitude: 2.16)
            try await f.save(on: app.db)
            let c = FontComment(fontID: try f.requireID(), userID: try autora.requireID(),
                                body: "", rating: nil, waterStatus: "flowing", image: nil)
            try await c.save(on: app.db)
            let hace40 = Date().addingTimeInterval(-40 * 86_400)
            c.createdAt = hace40
            try await c.save(on: app.db)

            try await FontConfirmation(commentID: try c.requireID(), userID: try otra.requireID())
                .save(on: app.db)

            let resumen = try await Font.summaries(forIDs: [f.requireID()], on: app.db)
            let s = try XCTUnwrap(resumen.first)
            let parte = try XCTUnwrap(s.lastReportAt)
            let actualizacion = try XCTUnwrap(s.lastUpdate)
            XCTAssertLessThan(abs(parte.timeIntervalSince(hace40)), 2,
                              "la fecha del parte no la mueve una confirmación")
            XCTAssertGreaterThan(actualizacion.timeIntervalSince(parte), 30 * 86_400,
                                 "la actualización sí la mueve: para eso está")
        }
    }

    /// Y sale por el cable, que es donde lo lee el globo.
    func testElResumenDelMapaLosPublica() async throws {
        try await withApp { app in
            let u = try await usuario(app, "paseante")
            let f = Font(name: "Font Trobada", latitude: 41.75, longitude: 2.16)
            try await f.save(on: app.db)
            let c = FontComment(fontID: try f.requireID(), userID: try u.requireID(),
                                body: "", rating: nil, waterStatus: "flowing", image: nil)
            try await c.save(on: app.db)

            let id = try c.requireID().uuidString
            try await app.test(.GET, "fonts/near?lat=41.75&long=2.16&km=1") { res in
                XCTAssertEqual(res.status, .ok)
                let cuerpo = res.body.string
                XCTAssertTrue(cuerpo.contains("lastCommentID"), "el globo no puede confirmar sin el id del parte")
                XCTAssertTrue(cuerpo.contains("lastReportAt"), "ni sin su fecha")
                XCTAssertTrue(cuerpo.contains(id) || cuerpo.contains(id.lowercased()),
                              "y tiene que ser el id de la reseña de verdad")
            }
        }
    }
}
