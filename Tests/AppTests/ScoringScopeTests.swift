@testable import App
import Fluent
import XCTVapor

/// Qué fuentes carga el baremo, y que cargar menos no le quite gotas a nadie.
///
/// `ContributionScore.compute` hacía `Font.query(on: db).all()`: las 160.738 fuentes de
/// producción como modelos de Fluent, para puntuar 115 reseñas. Medido con
/// `gamification-sync --dry-run`, **698 MB de pico**, y como el trabajador arranca a los
/// 30 s de cada arranque, la máquina entraba en un bucle de OOM que se alimentaba solo.
///
/// Ahora se cargan solo las fuentes que participan. El peligro de ese cambio es que falla
/// **en silencio**: `add(...)` descarta la aportación cuya fuente no esté cargada, así que
/// quedarse corto no da ningún error — simplemente deja de pagar. Ningún test de «¿está la
/// reseña?» lo vería, porque la reseña está.
///
/// Por eso estos tests puntúan de verdad y afirman **cifras**, no invariantes alrededor.
final class ScoringScopeTests: XCTestCase {
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

    private func bearer(_ t: String) -> HTTPHeaders { ["Authorization": "Bearer \(t)"] }

    private func usuario(_ app: Application, _ username: String) async throws -> String {
        try await app.test(.POST, "users") { req in
            try req.content.encode(CreateUserDTO(name: username, username: username,
                                                 email: "\(username)@example.com", password: "password123"))
        } afterResponse: { res in XCTAssertEqual(res.status, .created) }
        var token = ""
        try await app.test(.POST, "auth/login", beforeRequest: { req in
            req.headers.basicAuthorization = .init(username: username, password: "password123")
        }, afterResponse: { res in token = try res.content.decode(LoginResponse.self).token })
        return token
    }

    /// Una fuente **importada**: sin creador, como las 160.000 de producción. Va directa a
    /// la base y no por la API, que exige sesión y deja `created_by`.
    @discardableResult
    private func importada(_ app: Application, _ nombre: String?,
                           lat: Double, long: Double, image: String? = nil) async throws -> UUID {
        let f = Font(name: nombre, latitude: lat, longitude: long, image: image,
                     description: nil, source: nil, drinkable: nil)
        try await f.save(on: app.db)
        return try XCTUnwrap(f.id)
    }

    private struct NewComment: Content { let body: String; let waterStatus: String?; let image: String? }

    // MARK: -

    /// El caso que de verdad importa: con un montón de fuentes que no pinta nada, el
    /// resultado tiene que ser **idéntico** al de cargarlas todas.
    func testScoringIgnoresFountainsNobodyHasTouched() async throws {
        try await withApp { app in
            let token = try await usuario(app, "andarina")
            let tocada = try await importada(app, "Font tocada", lat: 41.0, long: 2.0)
            // 200 fuentes que no participan en nada. Antes se cargaban las 200; ahora no
            // se carga ninguna, y lo que se paga no puede cambiar por eso.
            for i in 0..<200 {
                try await importada(app, "Ignorada \(i)", lat: 42.0 + Double(i) / 1000, long: 3.0)
            }
            try await app.test(.POST, "fonts/\(tocada)/comments", headers: bearer(token), beforeRequest: { req in
                try req.content.encode(NewComment(body: "Raja", waterStatus: "flowing", image: nil))
            }, afterResponse: { res in XCTAssertEqual(res.status, .created) })

            let informe = try await ContributionScore.compute(on: app.db)
            let mias = informe.contributions.filter { $0.fontID == tocada }
            XCTAssertEqual(mias.count, 1, "la reseña tiene que pagar exactamente una aportación")
            XCTAssertEqual(mias.first?.kind, .firstReview)
            XCTAssertGreaterThan(informe.users.first(where: { $0.username == "andarina" })?.gotes ?? 0, 0,
                                 "quedarse corto al cargar fuentes no da error: deja de pagar")
        }
    }

    /// Las fuentes con creador cobran `fontCreated` aunque nadie las haya reseñado. Si el
    /// filtro se dejara solo las referidas por reseñas, esto desaparecería sin ruido.
    func testCreatedFountainsStillScoreWithoutAnyReview() async throws {
        try await withApp { app in
            let token = try await usuario(app, "creadora")
            var creada = UUID()
            try await app.test(.POST, "fonts", headers: bearer(token), beforeRequest: { req in
                var dto = CreateFontDTO(name: "Mía", latitude: 40.0, longitude: 1.0,
                                        image: nil, description: nil, source: nil, drinkable: nil)
                dto.allowNearbyDuplicate = true
                try req.content.encode(dto)
            }, afterResponse: { res in
                struct Out: Content { let id: UUID? }
                creada = try XCTUnwrap(res.content.decode(Out.self).id)
            })

            let informe = try await ContributionScore.compute(on: app.db)
            XCTAssertTrue(informe.contributions.contains { $0.fontID == creada && $0.kind == .fontCreated },
                          "una fuente con creador y sin reseñas se quedaría fuera si el filtro solo mirara las referidas")
        }
    }

    /// Una fuente **importada con foto** no la cobra nadie, pero sí sale en el aviso. Si el
    /// filtro no incluyera `image`, ese recuento diría cero y nadie lo notaría.
    func testImportedFountainsWithAPhotoAreStillCounted() async throws {
        try await withApp { app in
            _ = try await usuario(app, "mirona")
            try await importada(app, "Con foto", lat: 39.0, long: 0.5, image: "/uploads/x.jpg")
            let informe = try await ContributionScore.compute(on: app.db)
            XCTAssertTrue(informe.caveats.contains { $0.contains("foto") && $0.contains("creador") },
                          "el aviso de las importadas con foto sale de cargarlas: sin ellas diría cero")
        }
    }
}
