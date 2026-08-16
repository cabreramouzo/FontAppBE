import XCTVapor
@testable import App

final class AppTests: XCTestCase {
    // Smoke test sin base de datos: sólo registra rutas y comprueba /health.
    func testHealth() async throws {
        let app = try await Application.make(.testing)
        do {
            try routes(app)
            try app.test(.GET, "health") { res in
                XCTAssertEqual(res.status, .ok)
            }
        } catch {
            try await app.asyncShutdown()
            throw error
        }
        try await app.asyncShutdown()
    }

    /// De qué cabecera sale la IP del cliente al meter Cloudflare delante de Fly.
    ///
    /// Los tres casos son el contrato entero: sin secreto no cambia nada (se puede
    /// desplegar antes de tocar el DNS), con el secreto correcto manda Cloudflare, y
    /// **una `CF-Connecting-IP` sin el secreto se ignora** — que es justo lo que
    /// intentaría quien fuese directo a fly.dev para saltarse el rate-limit rotando IPs
    /// inventadas.
    func testClientIPOnlyTrustsCloudflareWithTheSharedSecret() async throws {
        let app = try await Application.make(.testing)
        defer { unsetenv("EDGE_SECRET") }

        func peticion() -> Request {
            var headers = HTTPHeaders()
            headers.add(name: "Fly-Client-IP", value: "203.0.113.7")
            headers.add(name: "CF-Connecting-IP", value: "198.51.100.9")
            headers.add(name: "X-Edge-Secret", value: "el-secreto-bueno")
            return Request(application: app, method: .GET, url: "/x", headers: headers,
                           on: app.eventLoopGroup.next())
        }

        unsetenv("EDGE_SECRET")
        XCTAssertEqual(ClientIP.of(peticion()), "203.0.113.7", "sin EDGE_SECRET manda Fly")

        setenv("EDGE_SECRET", "el-secreto-bueno", 1)
        XCTAssertEqual(ClientIP.of(peticion()), "198.51.100.9", "con el secreto manda Cloudflare")

        setenv("EDGE_SECRET", "otro-secreto", 1)
        XCTAssertEqual(ClientIP.of(peticion()), "203.0.113.7", "secreto que no cuadra: se ignora Cloudflare")

        try await app.asyncShutdown()
    }

    func testHaversineKnownDistance() throws {
        // Madrid (Puerta del Sol) -> Barcelona (Pl. Catalunya) ≈ 505 km.
        let d = haversineKm(40.4168, -3.7038, 41.3874, 2.1686)
        XCTAssertEqual(d, 505, accuracy: 15)
    }
}
