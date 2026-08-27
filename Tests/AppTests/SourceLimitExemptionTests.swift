import Fluent
import XCTVapor
@testable import App

/// Conceder la excepción al cupo de cuentas nuevas: cuánto dura y que el interesado se
/// entera.
///
/// Lo segundo es el fallo que motivó esto: se concedía el permiso y **desde el lado de
/// quien lo pidió no cambiaba nada visible**, así que o lo volvía a pedir o dejaba de
/// intentarlo creyendo que le habían dicho que no.
final class SourceLimitExemptionTests: XCTestCase {
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

    private func admin(_ app: Application) async throws -> String {
        let n = Int.random(in: 1...999_999)
        let u = User(name: "Admin", username: "admincupo\(n)", email: "admincupo\(n)@x.test",
                     passwordHash: try Bcrypt.hash("password123"))
        u.role = .admin
        try await u.save(on: app.db)
        var token = ""
        try await app.test(.POST, "auth/login", beforeRequest: { req in
            req.headers.basicAuthorization = .init(username: "admincupo\(n)", password: "password123")
        }, afterResponse: { res in
            token = try res.content.decode(LoginResponse.self).token
        })
        return token
    }

    private func solicitante(_ app: Application) async throws -> User {
        let n = Int.random(in: 1...999_999)
        let u = User(name: "Nuevo", username: "nuevocupo\(n)", email: "nuevocupo\(n)@x.test",
                     passwordHash: try Bcrypt.hash("password123"))
        try await u.save(on: app.db)
        return u
    }

    private func solicitud(_ app: Application, de user: User) async throws -> ContentFlag {
        let f = ContentFlag(flaggerID: try user.requireID(), targetType: "source_limit_exemption",
                            targetID: try user.requireID(), reason: "quiero más")
        try await f.save(on: app.db)
        return f
    }

    private func bearer(_ token: String) -> HTTPHeaders { ["Authorization": "Bearer \(token)"] }

    /// Un día es el caso normal: alguien delante de un pueblo con quince fuentes por
    /// apuntar. Siete días para eso es conceder mucho más de lo que se pidió.
    func testUnDiaConcedeExactamenteUnDia() async throws {
        try await withApp { app in
            let token = try await admin(app)
            let quien = try await solicitante(app)
            let flag = try await solicitud(app, de: quien)

            try await app.test(.POST, "flags/\(flag.requireID())/approve-source-limit-exemption?days=1",
                               headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .noContent)
            }
            let despues = try await User.find(quien.requireID(), on: app.db)
            let hasta = try XCTUnwrap(despues?.sourceLimitExemptUntil)
            let horas = hasta.timeIntervalSinceNow / 3600
            XCTAssertTrue((23...25).contains(horas), "esperaba ~24 h y son \(horas)")
        }
    }

    /// Sin parámetro sigue dando siete: un cliente viejo tiene que conceder lo que promete
    /// su botón, no algo distinto.
    func testSinParametroSiguenSiendoSiete() async throws {
        try await withApp { app in
            let token = try await admin(app)
            let quien = try await solicitante(app)
            let flag = try await solicitud(app, de: quien)

            try await app.test(.POST, "flags/\(flag.requireID())/approve-source-limit-exemption",
                               headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .noContent)
            }
            let despues = try await User.find(quien.requireID(), on: app.db)
            let hasta = try XCTUnwrap(despues?.sourceLimitExemptUntil)
            XCTAssertTrue((6.5...7.5).contains(hasta.timeIntervalSinceNow / 86_400))
        }
    }

    /// Cualquier otra duración se rechaza. Sin esto, un `?days=3650` concedería diez años
    /// y nadie lo vería nunca.
    func testOtrasDuracionesSeRechazan() async throws {
        try await withApp { app in
            let token = try await admin(app)
            let quien = try await solicitante(app)
            let flag = try await solicitud(app, de: quien)

            for dias in [0, 3, 30, 3650, -1] {
                try await app.test(.POST, "flags/\(flag.requireID())/approve-source-limit-exemption?days=\(dias)",
                                   headers: bearer(token)) { res in
                    XCTAssertEqual(res.status, .badRequest, "days=\(dias) debería rechazarse")
                }
            }
            let sinTocar = try await User.find(quien.requireID(), on: app.db)
            XCTAssertNil(sinTocar?.sourceLimitExemptUntil)
        }
    }

    /// El aviso es la mitad de esto: sin él, quien lo pidió no ve nada cambiar.
    func testQuienLoPidioRecibeUnAviso() async throws {
        try await withApp { app in
            let token = try await admin(app)
            let quien = try await solicitante(app)
            let flag = try await solicitud(app, de: quien)

            try await app.test(.POST, "flags/\(flag.requireID())/approve-source-limit-exemption?days=1",
                               headers: bearer(token))

            // El aviso se guarda en segundo plano; se espera a que aparezca sin encadenar
            // la prueba a un tiempo fijo.
            var aviso: App.Notification?
            for _ in 0..<40 {
                aviso = try await App.Notification.query(on: app.db)
                    .filter(\.$user.$id == quien.requireID()).first()
                if aviso != nil { break }
                try await Task.sleep(nanoseconds: 100_000_000)
            }
            let n = try XCTUnwrap(aviso, "no ha llegado ningún aviso")
            XCTAssertEqual(n.kind, .sourceLimit)
            // La fecha viaja en ISO y NO como frase: el servidor va en UTC y la gente de
            // esta app va de Chile a Italia. Las palabras las pone el navegador.
            XCTAssertNotNil(ISO8601DateFormatter().date(from: n.excerpt))
            XCTAssertNil(n.$actor.id, "es una decisión de la casa, no de una persona concreta")
        }
    }
}
