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

    func testHaversineKnownDistance() throws {
        // Madrid (Puerta del Sol) -> Barcelona (Pl. Catalunya) ≈ 505 km.
        let d = haversineKm(40.4168, -3.7038, 41.3874, 2.1686)
        XCTAssertEqual(d, 505, accuracy: 15)
    }
}
