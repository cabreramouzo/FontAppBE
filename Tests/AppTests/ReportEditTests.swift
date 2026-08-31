import Fluent
import XCTVapor
@testable import App

/// Corregir un comentario durante la primera hora.
///
/// La ventana existe por lo que un comentario significa aquí: otras personas lo leen para
/// decidir si se desvían, y algunos llevan respuesta debajo. Poder reescribirlo a los tres
/// días deja conversaciones que no se entienden. Una hora cubre la errata y el dedo en el
/// móvil, que es lo que de verdad se pide.
final class ReportEditTests: XCTestCase {
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

    private func usuario(_ app: Application, _ nombre: String) async throws -> (User, String) {
        let n = Int.random(in: 1...999_999)
        let u = User(name: nombre, username: "\(nombre)\(n)", email: "\(nombre)\(n)@x.test",
                     passwordHash: try Bcrypt.hash("password123"))
        try await u.save(on: app.db)
        var token = ""
        try await app.test(.POST, "auth/login", beforeRequest: { req in
            req.headers.basicAuthorization = .init(username: "\(nombre)\(n)", password: "password123")
        }, afterResponse: { res in token = try res.content.decode(LoginResponse.self).token })
        return (u, token)
    }

    /// Un comentario de `autor` con la antigüedad que haga falta.
    private func comentario(_ app: Application, de autor: User, en f: Font,
                            hace segundos: TimeInterval = 0) async throws -> FontReport {
        let r = FontReport(fontID: try f.requireID(), userID: try autor.requireID(),
                           message: "La fuente está detrás del quiosco",
                           isIncident: false, incidentKind: nil)
        try await r.save(on: app.db)
        if segundos > 0 {
            r.createdAt = Date().addingTimeInterval(-segundos)
            try await r.save(on: app.db)
        }
        return r
    }

    private func fuente(_ app: Application) async throws -> Font {
        let f = Font(name: "Font del Roure", latitude: 41.75, longitude: 2.16)
        try await f.save(on: app.db)
        return f
    }

    private func bearer(_ t: String) -> HTTPHeaders { ["Authorization": "Bearer \(t)"] }

    private func edita(_ app: Application, _ f: Font, _ r: FontReport, token: String,
                       texto: String = "Detrás del quiosco, junto a la pista de petanca",
                       espera: (XCTHTTPResponse) throws -> Void) async throws {
        try await app.test(.PUT, "fonts/\(f.requireID())/report/\(r.requireID())",
                           headers: bearer(token), beforeRequest: { req in
            try req.content.encode(CreateReportDTO(message: texto, isIncident: nil, incidentKind: nil))
        }, afterResponse: espera)
    }

    func testSePuedeCorregirDentroDeLaPrimeraHora() async throws {
        try await withApp { app in
            let (autor, token) = try await usuario(app, "autora")
            let f = try await fuente(app)
            let r = try await comentario(app, de: autor, en: f, hace: 60 * 10)

            try await edita(app, f, r, token: token) { res in
                XCTAssertEqual(res.status, .ok)
                let dto = try res.content.decode(ReportResponse.self)
                XCTAssertEqual(dto.message, "Detrás del quiosco, junto a la pista de petanca")
                XCTAssertNotNil(dto.editedAt, "sin esto la ficha no puede decir «editado»")
            }
        }
    }

    /// La otra mitad, que es la que hace que la ventana signifique algo.
    func testPasadaLaHoraYaNo() async throws {
        try await withApp { app in
            let (autor, token) = try await usuario(app, "tardona")
            let f = try await fuente(app)
            let r = try await comentario(app, de: autor, en: f,
                                         hace: FontReportController.editWindow + 60)

            try await edita(app, f, r, token: token) { res in
                XCTAssertEqual(res.status, .forbidden)
                XCTAssertTrue(res.body.string.contains("report.editWindowOver"))
            }
        }
    }

    /// El texto es de quien lo escribió. Marcar como incidencia sí lo puede tocar un
    /// moderador, pero eso tiene su propia ruta.
    func testNadieEditaLoQueEscribioOtro() async throws {
        try await withApp { app in
            let (autor, _) = try await usuario(app, "autora")
            let (_, ajeno) = try await usuario(app, "entrometido")
            let f = try await fuente(app)
            let r = try await comentario(app, de: autor, en: f)

            try await edita(app, f, r, token: ajeno) { res in
                XCTAssertEqual(res.status, .forbidden)
                XCTAssertTrue(res.body.string.contains("report.selfOnly"))
            }
        }
    }

    /// Sin editar, `editedAt` es nulo: «editado» solo se dice cuando es verdad.
    func testSinEditarNoDiceEditado() async throws {
        try await withApp { app in
            let (autor, _) = try await usuario(app, "autora")
            let f = try await fuente(app)
            _ = try await comentario(app, de: autor, en: f)

            try await app.test(.GET, "fonts/\(f.requireID())/report") { res in
                XCTAssertEqual(res.status, .ok)
                let lista = try res.content.decode([ReportResponse].self)
                XCTAssertEqual(lista.count, 1)
                XCTAssertNil(lista[0].editedAt)
            }
        }
    }

    /// Editar el texto **no** cambia si es incidencia ni su tipo: eso tiene otra ruta y
    /// otros permisos. Sin esto, corregir una errata reabriría la clasificación.
    func testEditarNoTocaLaMarcaDeIncidencia() async throws {
        try await withApp { app in
            let (autor, token) = try await usuario(app, "autora")
            let f = try await fuente(app)
            let r = FontReport(fontID: try f.requireID(), userID: try autor.requireID(),
                               message: "El caño está roto", isIncident: true, incidentKind: .broken)
            try await r.save(on: app.db)

            try await edita(app, f, r, token: token, texto: "El caño está roto del todo") { res in
                XCTAssertEqual(res.status, .ok)
                let dto = try res.content.decode(ReportResponse.self)
                XCTAssertTrue(dto.isIncident)
                XCTAssertEqual(dto.incidentKind, .broken)
            }
        }
    }
}
