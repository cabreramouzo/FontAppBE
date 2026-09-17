import Fluent
import XCTVapor
@testable import App

/// La fuente de la semana (`FeaturedFountain`): una olvidada, cerca, que rota por semana.
///
/// Casos que fallan en silencio: colar una comprobada hace poco (no está olvidada), no
/// incluir las que no ha visto nadie (las que más invitan), o que la rotación no sea
/// estable/determinista.
final class FeaturedFountainTests: XCTestCase {
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

    private func usuario(_ app: Application) async throws -> User {
        let n = Int.random(in: 1...999_999)
        let u = User(name: "u", username: "u\(n)", email: "u\(n)@x.test",
                     passwordHash: try Bcrypt.hash("password123"))
        try await u.save(on: app.db)
        return u
    }

    private func fuente(_ app: Application, _ lat: Double, _ long: Double) async throws -> Font {
        let f = Font(name: "Font", latitude: lat, longitude: long)
        try await f.save(on: app.db)
        return f
    }

    private func resena(_ app: Application, _ font: Font, de user: User, hace dias: Double) async throws {
        let c = FontComment(fontID: try font.requireID(), userID: try user.requireID(),
                            body: "", rating: nil, waterStatus: "flowing", image: nil)
        try await c.save(on: app.db)
        c.createdAt = Date().addingTimeInterval(-dias * 86_400)
        try await c.save(on: app.db)
    }

    /// Elige entre las olvidadas cercanas: nunca comprobada o comprobada hace mucho.
    func testEligeUnaOlvidadaCercana() async throws {
        try await withApp { app in
            let u = try await usuario(app)
            let lat = 41.75, long = 2.16
            // Reciente: NO debe salir.
            let reciente = try await fuente(app, lat, long)
            try await resena(app, reciente, de: u, hace: 3)
            // Olvidada (nunca comprobada) cerca: candidata.
            let olvidada = try await fuente(app, lat + 0.001, long + 0.001)

            let f = try await FeaturedFountain.of(lat: lat, long: long, on: app.db)
            let elegida = try XCTUnwrap(f)
            XCTAssertEqual(elegida.fontID, try olvidada.requireID())
            XCTAssertTrue(elegida.neverChecked)
            XCTAssertNil(elegida.days)
        }
    }

    /// Una comprobada hace mucho también cuenta como olvidada, con sus días.
    func testComprobadaHaceMuchoCuenta() async throws {
        try await withApp { app in
            let u = try await usuario(app)
            let lat = 40.0, long = -3.0
            let vieja = try await fuente(app, lat, long)
            try await resena(app, vieja, de: u, hace: 200)
            let f = try await XCTUnwrapAsync { try await FeaturedFountain.of(lat: lat, long: long, on: app.db) }
            XCTAssertEqual(f.fontID, try vieja.requireID())
            XCTAssertFalse(f.neverChecked)
            XCTAssertEqual(f.days, 200)
        }
    }

    /// Si todo lo cercano se comprobó hace poco, no hay fuente de la semana.
    func testNilSiNadaEstaOlvidado() async throws {
        try await withApp { app in
            let u = try await usuario(app)
            let lat = 43.0, long = -2.0
            let f = try await fuente(app, lat, long)
            try await resena(app, f, de: u, hace: 10)
            let elegida = try await FeaturedFountain.of(lat: lat, long: long, on: app.db)
            XCTAssertNil(elegida)
        }
    }

    /// La rotación es estable dentro de una semana y determinista: dos llamadas iguales dan
    /// lo mismo, y el índice de semana avanza de una semana a la siguiente.
    func testRotacionSemanalEsDeterminista() async throws {
        let ahora = Date()
        let semana = FeaturedFountain.weekIndex(ahora)
        XCTAssertEqual(semana, FeaturedFountain.weekIndex(ahora))
        let masUnaSemana = FeaturedFountain.weekIndex(ahora.addingTimeInterval(7 * 86_400))
        XCTAssertEqual(masUnaSemana, semana + 1)
    }

    private func XCTUnwrapAsync<T>(_ expr: () async throws -> T?) async throws -> T {
        let v = try await expr()
        return try XCTUnwrap(v)
    }
}
