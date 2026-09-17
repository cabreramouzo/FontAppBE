import Fluent
import XCTVapor
@testable import App

/// La Pokédex de fuentes (`VisitedCollection`): fuentes visitadas y tipos coleccionados.
///
/// Los casos que fallan en silencio: contar reseñas en vez de fuentes distintas (inflaría
/// el total al reseñar dos veces la misma), colar fuentes escondidas, y omitir los tipos
/// que faltan (sin ellos no hay «5 de 6» que invite a completar).
final class VisitedCollectionTests: XCTestCase {
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

    private func fuente(_ app: Application, _ source: WaterSource?) async throws -> Font {
        try await fuenteEn(app, 41.75, 2.16, source)
    }

    private func fuenteEn(_ app: Application, _ lat: Double, _ long: Double,
                          _ source: WaterSource?) async throws -> Font {
        let f = Font(name: "Font", latitude: lat, longitude: long)
        f.source = source
        try await f.save(on: app.db)
        return f
    }

    private func resena(_ app: Application, _ font: Font, de user: User) async throws {
        let c = FontComment(fontID: try font.requireID(), userID: try user.requireID(),
                            body: "", rating: nil, waterStatus: "flowing", image: nil)
        try await c.save(on: app.db)
    }

    /// El total cuenta fuentes distintas, no reseñas: dos reseñas de la misma son una visita.
    func testVisitadasSonFuentesDistintas() async throws {
        try await withApp { app in
            let u = try await usuario(app, "andarina")
            let f1 = try await fuente(app, .mountain)
            try await resena(app, f1, de: u)
            try await resena(app, f1, de: u)   // la misma otra vez
            let f2 = try await fuente(app, .spring)
            try await resena(app, f2, de: u)

            let col = try await VisitedCollection.of(try u.requireID(), on: app.db)
            XCTAssertEqual(col.visited, 2)
        }
    }

    /// Devuelve los seis tipos siempre, con 0 los que faltan, y cuenta bien los que hay.
    func testTiposIncluyenLosQueFaltan() async throws {
        try await withApp { app in
            let u = try await usuario(app, "coleccionista")
            try await resena(app, try await fuente(app, .mountain), de: u)
            try await resena(app, try await fuente(app, .mountain), de: u)
            try await resena(app, try await fuente(app, .tap), de: u)

            let col = try await VisitedCollection.of(try u.requireID(), on: app.db)
            XCTAssertEqual(col.types.count, WaterSource.allCases.count)
            let mapa = Dictionary(col.types.map { ($0.source, $0.count) }, uniquingKeysWith: { a, _ in a })
            XCTAssertEqual(mapa["mountain"], 2)
            XCTAssertEqual(mapa["tap"], 1)
            XCTAssertEqual(mapa["spring"], 0, "el tipo que falta sale con 0, no se omite")
        }
    }

    /// Una fuente escondida no cuenta ni en el total ni en los tipos.
    func testEscondidasNoCuentan() async throws {
        try await withApp { app in
            let u = try await usuario(app, "visitante")
            let f = try await fuente(app, .well)
            try await resena(app, f, de: u)
            let antes = try await VisitedCollection.of(try u.requireID(), on: app.db)
            XCTAssertEqual(antes.visited, 1)

            f.retiredAt = Date()
            try await f.save(on: app.db)
            let despues = try await VisitedCollection.of(try u.requireID(), on: app.db)
            XCTAssertEqual(despues.visited, 0)
            let well = despues.types.first { $0.source == "well" }?.count
            XCTAssertEqual(well, 0)
        }
    }

    /// El objetivo local: de las cercanas, cuántas has visitado tú. Las de otra persona no
    /// cuentan para ti, y una lejana no entra en el conjunto.
    func testObjetivoLocal() async throws {
        try await withApp { app in
            let u = try await usuario(app, "local")
            let otra = try await usuario(app, "vecina")
            let lat = 41.75, long = 2.16
            let a = try await fuenteEn(app, lat, long, .tap)
            let b = try await fuenteEn(app, lat + 0.001, long + 0.001, .spring)
            let c = try await fuenteEn(app, lat + 0.002, long, .well)
            // Tú visitas dos de las tres cercanas.
            try await resena(app, a, de: u)
            try await resena(app, b, de: u)
            // La tercera la reseña otra persona: no cuenta como tuya.
            try await resena(app, c, de: otra)
            // Y una lejana (fuera de los 25 km) no entra en el conjunto.
            _ = try await fuenteEn(app, lat + 1.0, long, .fountain)

            let g = try await VisitedCollection.local(try u.requireID(), lat: lat, long: long, on: app.db)
            let goal = try XCTUnwrap(g)
            XCTAssertEqual(goal.nearby, 3, "las tres cercanas, no la lejana")
            XCTAssertEqual(goal.visited, 2, "solo tus dos, no la de la vecina")
        }
    }

    /// Sin fuentes cerca no hay objetivo: `nil`, no un «0 de 0».
    func testObjetivoLocalNilSinCercanas() async throws {
        try await withApp { app in
            let u = try await usuario(app, "aislada")
            let goal = try await VisitedCollection.local(try u.requireID(), lat: 0, long: 0, on: app.db)
            XCTAssertNil(goal)
        }
    }

    /// El endpoint responde 204 a quien apagó la gamificación.
    func testEndpoint204SiOptOut() async throws {
        try await withApp { app in
            let n = Int.random(in: 1...999_999)
            let u = User(name: "silenciosa", username: "silenciosa\(n)",
                         email: "silenciosa\(n)@x.test", passwordHash: try Bcrypt.hash("password123"),
                         gamificationOptOut: true)
            try await u.save(on: app.db)
            var token = ""
            try await app.test(.POST, "auth/login", beforeRequest: { req in
                req.headers.basicAuthorization = .init(username: "silenciosa\(n)", password: "password123")
            }, afterResponse: { res in token = try res.content.decode(LoginResponse.self).token })

            try await app.test(.GET, "gamification/collection",
                               headers: ["Authorization": "Bearer \(token)"]) { res in
                XCTAssertEqual(res.status, .noContent)
            }
        }
    }
}
