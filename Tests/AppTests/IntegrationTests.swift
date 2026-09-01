import Fluent
import Foundation
import SQLKit
import XCTVapor
import WebAuthn
@testable import App

private struct StubGoogleVerifier: GoogleTokenVerifying {
    let profile: GoogleProfile
    func verify(_ credential: String, clientID: String, on client: any Client) async throws -> GoogleProfile {
        profile
    }
}

// Tests de integración contra una BD real (fontapp_test). Cada test migra y revierte.
// Requiere Postgres corriendo y la base `fontapp_test` (owner `vapor`).
final class IntegrationTests: XCTestCase {

    func testPasskeyOptionsUseOneTimeServerChallenges() async throws {
        try await withApp { app in
            let userID = try await register(app, username: "passkeyuser")
            let existing = PasskeyCredential(credentialID: "existing-base64url-id", publicKey: Data([1, 2, 3]),
                                             signCount: 0, label: "MacBook", userID: userID)
            try await existing.save(on: app.db)
            let token = try await login(app, username: "passkeyuser")
            try await app.test(.POST, "auth/passkeys/registration/options", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let response = try res.content.decode(RegistrationOptionsResponse.self)
                XCTAssertEqual(response.publicKey.relyingParty.id, "localhost")
                XCTAssertGreaterThanOrEqual(response.publicKey.challenge.count, 16)
                XCTAssertEqual(response.existingCredentialIDs, ["existing-base64url-id"])
            })
            try await app.test(.POST, "auth/passkeys/authentication/options", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let response = try res.content.decode(AuthenticationOptionsResponse.self)
                XCTAssertEqual(response.publicKey.relyingPartyID, "localhost")
                XCTAssertGreaterThanOrEqual(response.publicKey.challenge.count, 16)
            })
            let count = try await PasskeyChallenge.query(on: app.db).count()
            XCTAssertEqual(count, 2)
        }
    }

    func testGoogleLoginCreatesAndReusesStableIdentity() async throws {
        setenv("GOOGLE_CLIENT_ID", "test-client", 1)
        defer { unsetenv("GOOGLE_CLIENT_ID") }
        try await withApp { app in
            app.geoLocator = StubGeoLocator(location: GeoLocation(country: "Spain", region: "Galicia", city: "A Coruña"))
            app.googleTokenVerifier = StubGoogleVerifier(profile: GoogleProfile(
                subject: "google-subject-1", email: "new.person@gmail.com", name: "New Person",
                authoritativeEmail: true
            ))

            var firstUserID: UUID?
            for attempt in 0..<2 {
                try await app.test(.POST, "auth/google", beforeRequest: { req in
                    try req.content.encode(GoogleLoginDTO(credential: "signed-id-token", lang: "ca", source: " Cartell-Galicia! "))
                }, afterResponse: { res in
                    XCTAssertEqual(res.status, .ok)
                    let login = try res.content.decode(LoginResponse.self)
                    XCTAssertFalse(login.token.isEmpty)
                    XCTAssertEqual(login.isNewUser, attempt == 0)
                    if let firstUserID { XCTAssertEqual(login.user.id, firstUserID) }
                    else { firstUserID = login.user.id }
                })
            }
            let userCount = try await User.query(on: app.db).count()
            let identityCount = try await AuthIdentity.query(on: app.db).count()
            XCTAssertEqual(userCount, 1)
            XCTAssertEqual(identityCount, 1)
            let createdID = try XCTUnwrap(firstUserID)
            var saved = try await User.find(createdID, on: app.db)
            for _ in 0..<50 where saved?.signupRegion == nil {
                try await Task.sleep(for: .milliseconds(20))
                saved = try await User.find(createdID, on: app.db)
            }
            XCTAssertEqual(saved?.signupCountry, "Spain")
            XCTAssertEqual(saved?.signupRegion, "Galicia")
            XCTAssertEqual(saved?.signupCity, "A Coruña")
            XCTAssertEqual(saved?.signupSource, "cartell-galicia")
        }
    }

    func testGoogleDoesNotSilentlyLinkThirdPartyEmail() async throws {
        setenv("GOOGLE_CLIENT_ID", "test-client", 1)
        defer { unsetenv("GOOGLE_CLIENT_ID") }
        try await withApp { app in
            _ = try await register(app, username: "existing")
            app.googleTokenVerifier = StubGoogleVerifier(profile: GoogleProfile(
                subject: "google-subject-2", email: "existing@example.com", name: "Existing",
                authoritativeEmail: false
            ))
            try await app.test(.POST, "auth/google", beforeRequest: { req in
                try req.content.encode(GoogleLoginDTO(credential: "signed-id-token", lang: "es"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .conflict)
            })
            let identityCount = try await AuthIdentity.query(on: app.db).count()
            XCTAssertEqual(identityCount, 0)
        }
    }

    func testMapEndpointReturnsEverythingOrExactServerClusters() async throws {
        try await withApp { app in
            guard let sql = app.db as? SQLDatabase else { return XCTFail("Postgres requerido") }

            try await sql.raw("""
                INSERT INTO fonts (id, name, latitude, longitude, created_at)
                VALUES
                  ('00000000-0000-0000-0000-000000000001', 'Una', 41.8, 2.1, now()),
                  ('00000000-0000-0000-0000-000000000002', 'Dues', 41.81, 2.11, now())
                """).run()
            try await app.test(.GET, "fonts/map?minLat=41&maxLat=42&minLong=1&maxLong=3&width=390&height=800") { res in
                XCTAssertEqual(res.status, .ok)
                let map = try res.content.decode(MapResponse.self)
                XCTAssertEqual(map.total, 2)
                XCTAssertEqual(map.fonts.count, 2)
                XCTAssertTrue(map.clusters.isEmpty)
            }

            try await sql.raw("""
                INSERT INTO fonts (id, name, latitude, longitude, created_at)
                SELECT md5(('map-cluster-' || i)::text)::uuid, NULL,
                       0.01 + (i % 100)::double precision / 110.0,
                       0.01 + (i % 97)::double precision / 107.0,
                       now()
                FROM generate_series(1, 3001) AS i
                """).run()
            try await app.test(.GET, "fonts/map?minLat=0&maxLat=1&minLong=0&maxLong=1&width=390&height=800") { res in
                XCTAssertEqual(res.status, .ok)
                let map = try res.content.decode(MapResponse.self)
                XCTAssertEqual(map.total, 3001)
                XCTAssertTrue(map.fonts.isEmpty)
                XCTAssertFalse(map.clusters.isEmpty)
                XCTAssertEqual(map.clusters.reduce(0) { $0 + $1.count }, 3001,
                               "cada fuente tiene que estar representada en el recuento")
                XCTAssertLessThanOrEqual(map.clusters.count, 72,
                                         "390×800 a 70 px produce como mucho 6×12 celdas")
            }

            try await app.test(.GET, "fonts/map?minLat=42&maxLat=41&minLong=1&maxLong=3") { res in
                XCTAssertEqual(res.status, .badRequest)
            }
        }
    }

    private func withApp(_ test: (Application) async throws -> Void) async throws {
        setenv("DATABASE_NAME", "fontapp_test", 1)
        let app = try await Application.make(.testing)
        do {
            try await configure(app)
            try? await app.autoRevert() // limpia posibles restos de una corrida previa
            try await app.autoMigrate()
            // La caché de /activity es estática y no se va con la app: si no se vacía,
            // un caso se lleva la respuesta que dejó el anterior sobre otra BD.
            await ActivityController.cache.clear()
            await ZoneController.cache.clear()
            try await test(app)
            try await app.autoRevert()
        } catch {
            try? await app.autoRevert()
            try await app.asyncShutdown()
            throw error
        }
        try await app.asyncShutdown()
    }

    // MARK: - Helpers

    @discardableResult
    private func register(_ app: Application, name: String = "Test", username: String, password: String = "password123") async throws -> UUID {
        var id = UUID()
        try await app.test(.POST, "users", beforeRequest: { req in
            try req.content.encode(CreateUserDTO(name: name, username: username, email: "\(username)@example.com", password: password))
        }, afterResponse: { res in
            XCTAssertEqual(res.status, .created)
            id = try res.content.decode(UserResponse.self).id ?? id
        })
        return id
    }

    private func login(_ app: Application, username: String, password: String = "password123") async throws -> String {
        var token = ""
        try await app.test(.POST, "auth/login", beforeRequest: { req in
            req.headers.basicAuthorization = .init(username: username, password: password)
        }, afterResponse: { res in
            XCTAssertEqual(res.status, .ok)
            token = try res.content.decode(LoginResponse.self).token
        })
        return token
    }

    /// La fuente **tal como sale por la API**, que ya no es el modelo.
    ///
    /// `Font` tiene columnas que no se publican (`queued_offline`), así que decodificar
    /// el modelo desde una respuesta fallaba: faltaba un campo obligatorio. Es la señal
    /// correcta —el contrato de salida y la tabla son cosas distintas— y esto lo fija.
    struct FontJSON: Content {
        let id: UUID?
        let name: String
        let latitude: Double
        let longitude: Double
        let image: String?
    }

    private func createFont(_ app: Application, token: String, name: String, lat: Double, long: Double) async throws -> UUID {
        var id = UUID()
        try await app.test(.POST, "fonts", headers: bearer(token), beforeRequest: { req in
            var dto = CreateFontDTO(name: name, latitude: lat, longitude: long, image: nil, description: nil, source: nil, drinkable: nil)
            // Esta factoría prepara fixtures deliberadamente cercanas en muchos tests;
            // no está probando el aviso de duplicado, así que confirma que son distintas.
            dto.allowNearbyDuplicate = true
            try req.content.encode(dto)
        }, afterResponse: { res in
            XCTAssertEqual(res.status, .created)
            id = try res.content.decode(FontJSON.self).id ?? id
        })
        return id
    }

    /// Registra un usuario y devuelve su username, para tests que solo necesitan sesión.
    @discardableResult
    private func nombreDe(_ app: Application, _ username: String) async throws -> String {
        _ = try await register(app, username: username)
        return username
    }

    private func bearer(_ token: String) -> HTTPHeaders { ["Authorization": "Bearer \(token)"] }

    /// GeoLocator de prueba: devuelve siempre una ubicación fija.
    private struct StubGeoLocator: GeoLocator {
        let location: GeoLocation
        func locate(ip: String?, on client: any Client) async -> GeoLocation? { location }
    }

    /// Como el anterior pero nombrando con UUID, igual que el almacenamiento real: es lo
    /// que necesita `PhotoExif`, que se indexa por el identificador del nombre.
    private struct UUIDImageStorage: ImageStorage {
        func save(_ data: ByteBuffer, ext: String) async throws -> String {
            "/uploads/\(UUID().uuidString).\(ext)"
        }
        func delete(_ reference: String) async throws {}
        func copy(_ reference: String) async throws -> String { "/uploads/\(UUID().uuidString).jpg" }
    }

    /// ImageStorage de prueba: no toca disco; `copy` devuelve una referencia nueva.
    private struct StubImageStorage: ImageStorage {
        func save(_ data: ByteBuffer, ext: String) async throws -> String { "/uploads/stub.\(ext)" }
        func delete(_ reference: String) async throws {}
        func copy(_ reference: String) async throws -> String { "/uploads/copy-\(UUID().uuidString).jpg" }
    }

    /// Promociona a admin directamente en BD (no hay endpoint para ello).
    private func makeAdmin(_ app: Application, userID: UUID) async throws {
        guard let u = try await User.find(userID, on: app.db) else { return XCTFail("usuario no encontrado") }
        u.role = .admin
        try await u.save(on: app.db)
    }

    private func setRole(_ app: Application, userID: UUID, role: UserRole) async throws {
        guard let u = try await User.find(userID, on: app.db) else { return XCTFail("usuario no encontrado") }
        u.role = role
        try await u.save(on: app.db)
    }

    /// Deja una reseña en una fuente y devuelve su id.
    private func addComment(_ app: Application, token: String, fontID: UUID, body: String) async throws -> UUID {
        var id = UUID()
        try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(token), beforeRequest: { req in
            try req.content.encode(CreateCommentDTO(body: body, rating: nil, waterStatus: nil, image: nil, confirmIfUnchanged: nil))
        }, afterResponse: { res in
            XCTAssertEqual(res.status, .created)
            id = try res.content.decode(CommentResponse.self).id ?? id
        })
        return id
    }

    // MARK: - Tests

    func testSupportAnalyticsCountsClicksAndAnonymousSessions() async throws {
        try await withApp { app in
            guard let sql = app.db as? SQLDatabase else { return XCTFail("Postgres requerido") }
            let firstSession = UUID().uuidString
            let secondSession = UUID().uuidString
            try await sql.raw("""
                INSERT INTO interaction_analytics (id, event, day, session_id, hits)
                VALUES (\(bind: UUID()), 'support_heart', CURRENT_DATE - 181, \(bind: UUID()), 5)
                """).run()
            for session in [firstSession, firstSession, secondSession] {
                try await app.test(.POST, "analytics", beforeRequest: { req in
                    try req.content.encode(InteractionDTO(event: "support_heart", session: session))
                }) { res in
                    XCTAssertEqual(res.status, .noContent)
                }
            }
            try await app.test(.POST, "analytics", beforeRequest: { req in
                try req.content.encode(InteractionDTO(event: "invented_event", session: firstSession))
            }) { res in
                XCTAssertEqual(res.status, .badRequest)
            }

            let adminID = try await register(app, username: "analyticsadmin")
            try await makeAdmin(app, userID: adminID)
            let token = try await login(app, username: "analyticsadmin")
            try await app.test(.GET, "admin/analytics?days=30", headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .ok)
                let stats = try res.content.decode([InteractionSummary].self)
                let heart = try XCTUnwrap(stats.first { $0.event == "support_heart" })
                XCTAssertEqual(heart.clicks, 3)
                XCTAssertEqual(heart.sessions, 2)
            }
            try await app.test(.GET, "admin/analytics", headers: bearer(token)) { res in
                let heart = try XCTUnwrap(res.content.decode([InteractionSummary].self).first { $0.event == "support_heart" })
                XCTAssertEqual(heart.clicks, 8)
                XCTAssertEqual(heart.sessions, 3)
            }
            let archived = try await sql.raw("SELECT id FROM interaction_analytics_daily").all().count
            let oldSessions = try await sql.raw("SELECT id FROM interaction_analytics WHERE day < CURRENT_DATE - 180").all().count
            XCTAssertEqual(archived, 1)
            XCTAssertEqual(oldSessions, 0)
        }
    }

    func testSupportAnalyticsIdentifiesOnlySignedInUsers() async throws {
        try await withApp { app in
            guard let sql = app.db as? SQLDatabase else { return XCTFail("Postgres requerido") }
            let userID = try await register(app, username: "supportowner")
            try await setRole(app, userID: userID, role: .owner)
            let token = try await login(app, username: "supportowner")

            // Sin token sigue contando en el agregado, pero no se atribuye a nadie.
            try await app.test(.POST, "analytics", beforeRequest: { req in
                try req.content.encode(InteractionDTO(event: "support_heart", session: UUID().uuidString))
            }) { res in
                XCTAssertEqual(res.status, .noContent)
            }
            for _ in 0..<2 {
                try await app.test(.POST, "analytics", headers: bearer(token), beforeRequest: { req in
                    try req.content.encode(InteractionDTO(event: "support_aixeta", session: UUID().uuidString))
                }) { res in
                    XCTAssertEqual(res.status, .noContent)
                }
            }

            struct IdentifiedCount: Decodable { let rows: Int; let hits: Int }
            let identified = try await sql.raw("""
                SELECT COUNT(*)::int AS rows, COALESCE(SUM(hits), 0)::int AS hits
                FROM user_support_interactions WHERE user_id = \(bind: userID)
                """).first(decoding: IdentifiedCount.self)
            XCTAssertEqual(identified?.rows, 1)
            XCTAssertEqual(identified?.hits, 2)

            try await app.test(.GET, "users/admin", headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .ok)
                let page = try res.content.decode(Page<AdminUser>.self)
                let row = try XCTUnwrap(page.items.first { $0.id == userID })
                XCTAssertNil(row.supportClickedAt)
                XCTAssertNotNil(row.aixetaClickedAt)
            }
            try await app.test(.DELETE, "users/\(userID)", headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .noContent)
            }
            let afterDeletion = try await sql.raw("SELECT id FROM user_support_interactions WHERE user_id = \(bind: userID)").all()
            XCTAssertTrue(afterDeletion.isEmpty)
        }
    }

    func testOnlineUsersIsApproximateAndAdminOnly() async throws {
        try await withApp { app in
            let userID = try await register(app, username: "onlineadmin")
            let token = try await login(app, username: "onlineadmin")
            try await app.test(.POST, "users/presence", headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .noContent)
            }
            try await app.test(.GET, "users/stats/online", headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }
            try await makeAdmin(app, userID: userID)
            try await app.test(.GET, "users/stats/online", headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .ok)
                let online = try res.content.decode([OnlineUser].self)
                XCTAssertEqual(online.first { $0.id == userID }?.username, "onlineadmin")
            }
        }
    }

    func testActivityRankingOrdersRecentAndIncludesUnseenAccounts() async throws {
        try await withApp { app in
            let adminID = try await register(app, username: "rankingadmin")
            let adminToken = try await login(app, username: "rankingadmin")
            let oldID = try await register(app, username: "rankingold")
            let recentID = try await register(app, username: "rankingrecent")
            _ = try await register(app, username: "rankingunseen")

            try await app.test(.GET, "users/stats/activity-ranking", headers: bearer(adminToken)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }
            try await makeAdmin(app, userID: adminID)
            let sql = try XCTUnwrap(app.db as? SQLDatabase)
            try await sql.raw("UPDATE users SET last_seen_at = CURRENT_TIMESTAMP - INTERVAL '30 days' WHERE id = \(bind: oldID)").run()
            try await sql.raw("UPDATE users SET last_seen_at = CURRENT_TIMESTAMP - INTERVAL '1 day' WHERE id = \(bind: recentID)").run()

            try await app.test(.GET, "users/stats/activity-ranking", headers: bearer(adminToken)) { res in
                XCTAssertEqual(res.status, .ok)
                let ranking = try res.content.decode(UserActivityRanking.self)
                XCTAssertEqual(ranking.mostRecent.first?.username, "rankingrecent")
                XCTAssertTrue(ranking.leastRecent.contains { $0.username == "rankingunseen" && $0.lastSeenAt == nil })
                XCTAssertGreaterThanOrEqual(ranking.untrackedCount, 2) // admin + unseen
            }
        }
    }

    func testRegisterLoginMe() async throws {
        try await withApp { app in
            try await register(app, username: "ada")
            let token = try await login(app, username: "ada")
            try await app.test(.GET, "auth/me", headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(UserResponse.self).username, "ada")
            }
        }
    }

    func testDuplicateUsernameConflict() async throws {
        try await withApp { app in
            try await register(app, username: "bob")
            try await app.test(.POST, "users", beforeRequest: { req in
                try req.content.encode(CreateUserDTO(name: "Bob2", username: "bob", email: "bob2@example.com", password: "password123"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .conflict)
            })
        }
    }

    func testValidationRejectsShortPassword() async throws {
        try await withApp { app in
            try await app.test(.POST, "users", beforeRequest: { req in
                try req.content.encode(CreateUserDTO(name: "X", username: "xyz", email: "xyz@example.com", password: "123"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
            })
        }
    }

    func testFontWriteRequiresAuth() async throws {
        try await withApp { app in
            try await app.test(.POST, "fonts", beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "F", latitude: 40, longitude: -3, image: nil, description: nil, source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .unauthorized)
            })

            try await register(app, username: "creator")
            let token = try await login(app, username: "creator")
            _ = try await createFont(app, token: token, name: "F", lat: 40, long: -3)
        }
    }

    func testNearSortsByDistance() async throws {
        try await withApp { app in
            try await register(app, username: "geo")
            let token = try await login(app, username: "geo")
            _ = try await createFont(app, token: token, name: "Sol", lat: 40.4168, long: -3.7038)
            _ = try await createFont(app, token: token, name: "BCN", lat: 41.3874, long: 2.1686)

            try await app.test(.GET, "fonts/near?lat=40.4168&long=-3.7038&quantity=1") { res in
                XCTAssertEqual(res.status, .ok)
                let fonts = try res.content.decode([FontSummary].self)
                XCTAssertEqual(fonts.count, 1)
                XCTAssertEqual(fonts.first?.name, "Sol")
            }

            // Con `quantity=1` sólo se comprueba QUÉ fuente sale, no en qué orden salen
            // varias, y ése era justo el hueco: al pasar el resumen a PostgreSQL, la
            // respuesta empezó a venir ordenada por UUID y este test seguía en verde.
            // Se piden varias a propósito, y se crean en orden inverso al esperado para
            // que devolver el orden de inserción tampoco baste.
            // Tres y no más: una cuenta nueva sólo puede añadir 5 fuentes al día.
            for (index, name) in ["c", "b", "a"].enumerated() {
                _ = try await createFont(app, token: token, name: name,
                                         lat: 40.4168 + 0.03 - Double(index) * 0.01, long: -3.7038)
            }

            try await app.test(.GET, "fonts/near?lat=40.4168&long=-3.7038&quantity=4") { res in
                XCTAssertEqual(res.status, .ok)
                let fonts = try res.content.decode([FontSummary].self)
                XCTAssertEqual(fonts.map(\.name), ["Sol", "a", "b", "c"],
                               "«Cerca de ti» pinta la distancia en cada fila: si el orden no es por distancia, la lista se lee como un error.")
            }
        }
    }

    func testSummaryExplainsConfidenceEvidence() async throws {
        try await withApp { app in
            let ownerID = try await register(app, username: "confidence-owner")
            let token = try await login(app, username: "confidence-owner")
            let verifierID = try await register(app, username: "confidence-verifier")
            let fontID = try await createFont(app, token: token, name: "Confiança", lat: 40.4, long: -3.7)

            let dry = FontComment(fontID: fontID, userID: ownerID, body: "seca", waterStatus: "dry")
            try await dry.save(on: app.db)
            let flowing = FontComment(fontID: fontID, userID: ownerID, body: "raja", waterStatus: "flowing")
            try await flowing.save(on: app.db)
            try await FontConfirmation(commentID: try flowing.requireID(), userID: verifierID).save(on: app.db)

            let found = try await Font.find(fontID, on: app.db)
            let font = try XCTUnwrap(found)
            let summaries = try await Font.summaries(for: [font], on: app.db)
            let summary = try XCTUnwrap(summaries.first)
            XCTAssertEqual(summary.latestConfirmations, 1)
            XCTAssertEqual(summary.recentStatusReporters, 1)
            XCTAssertTrue(summary.recentStatusConflict)
        }
    }

    func testReviewAuthorCannotConfirmThemself() async throws {
        try await withApp { app in
            let authorID = try await register(app, username: "self-confirm-author")
            let authorToken = try await login(app, username: "self-confirm-author")
            _ = try await register(app, username: "self-confirm-neighbour")
            let neighbourToken = try await login(app, username: "self-confirm-neighbour")
            let fontID = try await createFont(app, token: authorToken, name: "No autoaval", lat: 40.4, long: -3.7)
            let comment = FontComment(fontID: fontID, userID: authorID, body: "raja", waterStatus: "flowing")
            try await comment.save(on: app.db)
            let commentID = try comment.requireID()

            // Recién publicada: todavía no. Ya no es «nunca» sino «no el mismo día» —ver
            // `SelfConfirmTests`—, y este caso sigue dando 403 por la espera de 24 h.
            try await app.test(.POST, "fonts/\(fontID)/comments/\(commentID)/confirm",
                               headers: bearer(authorToken)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }
            let selfConfirmations = try await FontConfirmation.query(on: app.db).count()
            XCTAssertEqual(selfConfirmations, 0)

            try await app.test(.POST, "fonts/\(fontID)/comments/\(commentID)/confirm",
                               headers: bearer(neighbourToken)) { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(CommentResponse.self).confirmations, 1)
            }
        }
    }

    /// Confirmar tu propia reseña **no es respaldo, pero sí es fecha**.
    ///
    /// Antes este test fijaba la regla vieja —la propia se ignoraba también para la
    /// frescura— y se cambió a propósito: lo que se separa son dos cosas distintas.
    /// **Corroboración**: ¿alguien más lo dice? La propia no cuenta y no debe contar
    /// nunca, o una fuente llegaría a «confirmada» a base de que su autor se repita.
    /// **Actualidad**: ¿de cuándo es el dato? Que quien la reseñó haya vuelto a pasar y
    /// siga igual es información nueva y verdadera, y es la que evita el desvío.
    func testSelfConfirmationIsFreshnessNotSupport() async throws {
        try await withApp { app in
            let authorID = try await register(app, username: "old-self-confirm")
            let token = try await login(app, username: "old-self-confirm")
            let fontID = try await createFont(app, token: token, name: "Històrica", lat: 40.4, long: -3.7)
            let comment = FontComment(fontID: fontID, userID: authorID, body: "raja", waterStatus: "flowing")
            try await comment.save(on: app.db)
            let confirmation = FontConfirmation(commentID: try comment.requireID(), userID: authorID)
            try await confirmation.save(on: app.db)

            let response = try await FontCommentController.response(for: comment, viewer: authorID, on: app.db)
            // La mitad que protege: sigue sin ser respaldo de nadie.
            XCTAssertEqual(response.confirmations, 0)
            // La mitad nueva: dice cuándo se miró por última vez.
            XCTAssertNotNil(response.lastConfirmedAt)
            // Y como es de hace un momento, el botón queda marcado: vuelve a estar
            // disponible al pasar el día.
            XCTAssertTrue(response.confirmedByMe)

            let found = try await Font.find(fontID, on: app.db)
            let font = try XCTUnwrap(found)
            let summaries = try await Font.summaries(for: [font], on: app.db)
            let summary = try XCTUnwrap(summaries.first)
            XCTAssertEqual(summary.latestConfirmations, 0)
            // El resumen del mapa dice lo mismo que la ficha: la fecha es la de la
            // confirmación, no la de la reseña. Se comparan dos valores leídos de
            // PostgreSQL —el reloj de Swift conserva más precisión al guardar y el driver
            // puede normalizarla al releer, y en Linux eso hacía el test inestable.
            let stored = try await FontConfirmation.find(confirmation.requireID(), on: app.db)
            XCTAssertEqual(summary.lastUpdate, try XCTUnwrap(stored?.createdAt))
        }
    }

    /// Un comentario no es una incidencia hasta que alguien lo dice, y entonces sí.
    ///
    /// Fija las dos mitades de la regla, que es donde está el valor: sin la primera
    /// volvemos a tener la caja llenándose de cosas que nadie va a cerrar nunca, y sin la
    /// segunda no habría forma de limpiar lo que ya entró así ni de ascender una avería
    /// real escrita como comentario.
    ///
    /// Y comprueba lo que se paga por descuido: **un comentario no se puede «resolver»**.
    /// Sin ese 400, el botón existiría sobre algo que no tiene nada que arreglar y la
    /// palabra «resuelta» dejaría de significar nada.
    func testCommentIsNotAnIncidentUntilItIsMarked() async throws {
        try await withApp { app in
            try await register(app, username: "comentador")
            let token = try await login(app, username: "comentador")
            let fontID = try await createFont(app, token: token, name: "F", lat: 40, long: -3)

            // Sin decir nada, es un comentario.
            var reportID = ""
            try await app.test(.POST, "fonts/\(fontID)/report", headers: bearer(token), beforeRequest: { req in
                try req.content.encode(CreateReportDTO(message: "¿le pones una foto?", isIncident: nil, incidentKind: nil, parentID: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                let r = try res.content.decode(ReportResponse.self)
                XCTAssertFalse(r.isIncident)
                XCTAssertNil(r.incidentKind)
                reportID = try XCTUnwrap(r.id).uuidString
            })

            // Y como no lo es, no se puede dar por resuelto.
            try await app.test(.POST, "fonts/\(fontID)/report/\(reportID)/resolve", headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .badRequest)
            }

            // Marcarlo lo convierte en incidencia, con su tipo.
            try await app.test(.PATCH, "fonts/\(fontID)/report/\(reportID)/incident", headers: bearer(token), beforeRequest: { req in
                try req.content.encode(FontReportController.SetIncidentDTO(isIncident: true, incidentKind: .broken))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let r = try res.content.decode(ReportResponse.self)
                XCTAssertTrue(r.isIncident)
                XCTAssertEqual(r.incidentKind, .broken)
            })

            // Ahora sí se cierra.
            try await app.test(.POST, "fonts/\(fontID)/report/\(reportID)/resolve", headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .ok)
            }

            // Y desmarcarlo borra el cierre: «resuelta» no significa nada sobre un
            // comentario, y si se volviera a marcar aparecería cerrada sin que nadie la
            // haya arreglado.
            try await app.test(.PATCH, "fonts/\(fontID)/report/\(reportID)/incident", headers: bearer(token), beforeRequest: { req in
                try req.content.encode(FontReportController.SetIncidentDTO(isIncident: false, incidentKind: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let r = try res.content.decode(ReportResponse.self)
                XCTAssertFalse(r.isIncident)
                XCTAssertNil(r.resolvedAt)
            })
        }
    }

    func testReportRecordsAuthor() async throws {
        try await withApp { app in
            try await register(app, username: "reporter")
            let token = try await login(app, username: "reporter")
            let fontID = try await createFont(app, token: token, name: "F", lat: 40, long: -3)

            try await app.test(.POST, "fonts/\(fontID)/report", headers: bearer(token), beforeRequest: { req in
                try req.content.encode(CreateReportDTO(message: "grifo roto", isIncident: true, incidentKind: .broken, parentID: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                let report = try res.content.decode(ReportResponse.self)
                XCTAssertEqual(report.username, "reporter")
            })
        }
    }

    func testSelfOnlyForbidden() async throws {
        try await withApp { app in
            let aID = try await register(app, username: "usera")
            try await register(app, username: "userb")
            let tokenB = try await login(app, username: "userb")

            try await app.test(.PUT, "users/\(aID)", headers: bearer(tokenB), beforeRequest: { req in
                try req.content.encode(UpdateUserDTO(name: "hack", username: "usera", email: "hack@example.com", password: nil, emailPublic: nil, namePublic: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })
        }
    }

    // MARK: - Edición abierta (wiki), historial y revert

    /// Cualquier usuario autenticado puede corregir la info (nombre/descripción),
    /// pero la ubicación NO cambia si no es el creador ni admin.
    func testNonOwnerEditsInfoButNotLocation() async throws {
        try await withApp { app in
            try await register(app, username: "owner")
            let ownerTok = try await login(app, username: "owner")
            let fontID = try await createFont(app, token: ownerTok, name: "Font", lat: 40, long: -3)

            try await register(app, username: "stranger")
            let strangerTok = try await login(app, username: "stranger")

            // El extraño cambia el nombre/descr y ADEMÁS intenta mover el pin.
            try await app.test(.PUT, "fonts/\(fontID)", headers: bearer(strangerTok), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Font Vella", latitude: 0, longitude: 0, image: nil, description: "Històrica", source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                // Struct local: `Font.description` colisiona con CustomStringConvertible.
                struct FontOut: Content { let name: String; let description: String?; let latitude: Double; let longitude: Double }
                let f = try res.content.decode(FontOut.self)
                XCTAssertEqual(f.name, "Font Vella")          // info sí cambia
                XCTAssertEqual(f.description, "Històrica")
                XCTAssertEqual(f.latitude, 40, accuracy: 0.0001)   // ubicación NO cambia
                XCTAssertEqual(f.longitude, -3, accuracy: 0.0001)
            })
        }
    }

    /// Borrar una fuente ajena está prohibido para quien no es creador ni admin.
    func testNonOwnerCannotDeleteFont() async throws {
        try await withApp { app in
            try await register(app, username: "owner2")
            let ownerTok = try await login(app, username: "owner2")
            let fontID = try await createFont(app, token: ownerTok, name: "F", lat: 40, long: -3)

            try await register(app, username: "stranger2")
            let strangerTok = try await login(app, username: "stranger2")
            try await app.test(.DELETE, "fonts/\(fontID)", headers: bearer(strangerTok)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }
            // El creador sí puede.
            try await app.test(.DELETE, "fonts/\(fontID)", headers: bearer(ownerTok)) { res in
                XCTAssertEqual(res.status, .noContent)
            }
        }
    }

    /// Una edición de info deja registro; listar y revertir es solo para admins;
    /// el revert restaura el estado previo.
    func testEditHistoryLoggedAndRevertAdminOnly() async throws {
        try await withApp { app in
            try await register(app, username: "owner3")
            let ownerTok = try await login(app, username: "owner3")
            let fontID = try await createFont(app, token: ownerTok, name: "Original", lat: 40, long: -3)

            try await register(app, username: "editor3")
            let editorTok = try await login(app, username: "editor3")
            try await app.test(.PUT, "fonts/\(fontID)", headers: bearer(editorTok), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Cambiado", latitude: 40, longitude: -3, image: nil, description: nil, source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })

            // Un no-admin no puede listar el historial.
            try await app.test(.GET, "fonts/edits", headers: bearer(editorTok)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }

            // Promocionamos a un admin.
            let adminID = try await register(app, username: "admin3")
            try await makeAdmin(app, userID: adminID)
            let adminTok = try await login(app, username: "admin3")

            var editID = UUID()
            try await app.test(.GET, "fonts/edits", headers: bearer(adminTok)) { res in
                XCTAssertEqual(res.status, .ok)
                let edits = try res.content.decode([FontEditResponse].self)
                XCTAssertEqual(edits.count, 1)
                XCTAssertEqual(edits.first?.before.name, "Original")
                XCTAssertEqual(edits.first?.after.name, "Cambiado")
                XCTAssertEqual(edits.first?.editorName, "editor3")
                editID = try XCTUnwrap(edits.first?.id)
            }

            // Un no-admin no puede revertir.
            try await app.test(.POST, "fonts/edits/\(editID)/revert", headers: bearer(editorTok)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }

            // El admin revierte y la fuente vuelve a su nombre original.
            try await app.test(.POST, "fonts/edits/\(editID)/revert", headers: bearer(adminTok)) { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(FontJSON.self).name, "Original")
            }
            try await app.test(.GET, "fonts/\(fontID)") { res in
                XCTAssertEqual(try res.content.decode(FontJSON.self).name, "Original")
            }
        }
    }

    /// El perfil público se resuelve tanto por username como por UUID.
    func testUserLookupByUsernameOrID() async throws {
        try await withApp { app in
            let id = try await register(app, username: "publicuser")
            try await app.test(.GET, "users/publicuser") { res in
                XCTAssertEqual(res.status, .ok)
                let u = try res.content.decode(UserResponse.self)
                XCTAssertEqual(u.username, "publicuser")
                XCTAssertNil(u.email) // el perfil público nunca expone el email
            }
            try await app.test(.GET, "users/\(id)") { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(UserResponse.self).username, "publicuser")
            }
            try await app.test(.GET, "users/noexiste") { res in
                XCTAssertEqual(res.status, .notFound)
            }
        }
    }

    /// Promover la foto de una reseña a foto principal: solo creador/admin, y la
    /// referencia resultante es una copia independiente (no la misma de la reseña).
    func testPromoteCommentPhotoToMain() async throws {
        try await withApp { app in
            app.imageStorage = StubImageStorage()
            try await register(app, username: "photoowner")
            let ownerTok = try await login(app, username: "photoowner")
            let fontID = try await createFont(app, token: ownerTok, name: "F", lat: 40, long: -3)

            // La reseña se publica SIN foto y se le añade después, editándola. Publicarla
            // ya con foto estrenaría la portada ella sola (`CoverPhoto`), y entonces este
            // test no probaría nada: llegaría al endpoint con la ficha ya puesta. Lo que
            // se quiere fijar aquí son las reglas del endpoint, no las del alta.
            struct NewComment: Content { let body: String; let image: String? }
            var commentID = UUID()
            try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(ownerTok), beforeRequest: { req in
                try req.content.encode(NewComment(body: "sin foto aún", image: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                XCTAssertFalse(try res.content.decode(CommentResponse.self).coverAdopted)
                commentID = try XCTUnwrap(res.content.decode(CommentResponse.self).id)
            })
            try await app.test(.PUT, "fonts/\(fontID)/comments/\(commentID)", headers: bearer(ownerTok), beforeRequest: { req in
                try req.content.encode(NewComment(body: "con foto", image: "/uploads/orig.jpg"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })

            // La fuente aún no tiene foto: un extraño SÍ puede poner la primera. Casi
            // ninguna fuente importada tiene creador, así que si solo pudiera él, esas
            // fichas no tendrían foto nunca. La imagen resultante es una copia
            // independiente (distinta de la de la reseña).
            struct FontOut: Content { let image: String? }
            try await register(app, username: "photostranger")
            let strangerTok = try await login(app, username: "photostranger")
            var primera: String?
            try await app.test(.POST, "fonts/\(fontID)/photo/from-comment/\(commentID)", headers: bearer(strangerTok)) { res in
                XCTAssertEqual(res.status, .ok)
                let f = try res.content.decode(FontOut.self)
                XCTAssertNotNil(f.image)
                XCTAssertNotEqual(f.image, "/uploads/orig.jpg")
                primera = f.image
            }

            // Pero SUSTITUIR la que ya hay sigue siendo cosa del creador o de un admin.
            try await app.test(.POST, "fonts/\(fontID)/photo/from-comment/\(commentID)", headers: bearer(strangerTok)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }

            // El creador sí puede cambiarla, y vuelve a copiarse.
            try await app.test(.POST, "fonts/\(fontID)/photo/from-comment/\(commentID)", headers: bearer(ownerTok)) { res in
                XCTAssertEqual(res.status, .ok)
                let f = try res.content.decode(FontOut.self)
                XCTAssertNotNil(f.image)
                XCTAssertNotEqual(f.image, primera)
            }
        }
    }

    /// La PRIMERA foto la puede poner cualquiera; sustituirla, no.
    ///
    /// Importa porque la mayoría de fuentes vienen importadas (ACA, OSM) y no tienen
    /// creador: con la regla "solo el creador" no habría a quién pedírsela.
    func testAnyoneCanAddTheFirstPhoto() async throws {
        try await withApp { app in
            try await register(app, username: "fotoowner2")
            let ownerTok = try await login(app, username: "fotoowner2")
            let fontID = try await createFont(app, token: ownerTok, name: "Sense foto", lat: 41, long: 2)

            try await register(app, username: "fotoextrany")
            let otroTok = try await login(app, username: "fotoextrany")

            struct FontOut: Content { let image: String?; let latitude: Double }
            // Pone la primera foto (y de paso intenta mover el pin, que no debe colar).
            try await app.test(.PUT, "fonts/\(fontID)", headers: bearer(otroTok), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Sense foto", latitude: 0, longitude: 0, image: "/uploads/primera.jpg", description: nil, source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let f = try res.content.decode(FontOut.self)
                XCTAssertEqual(f.image, "/uploads/primera.jpg")
                XCTAssertEqual(f.latitude, 41, "un extraño no puede mover la fuente")
            })

            // Ya hay foto: otro intento no la sustituye.
            try await app.test(.PUT, "fonts/\(fontID)", headers: bearer(otroTok), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Sense foto", latitude: 41, longitude: 2, image: "/uploads/otra.jpg", description: nil, source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(FontOut.self).image, "/uploads/primera.jpg")
            })
        }
    }

    /// El email solo aparece en el perfil público si el usuario lo activa.
    func testEmailPrivacyToggle() async throws {
        try await withApp { app in
            let id = try await register(app, username: "priv")
            try await app.test(.GET, "users/priv") { res in
                XCTAssertNil(try res.content.decode(UserResponse.self).email) // oculto por defecto
            }
            let tok = try await login(app, username: "priv")
            try await app.test(.PUT, "users/\(id)", headers: bearer(tok), beforeRequest: { req in
                try req.content.encode(UpdateUserDTO(name: "Test", username: "priv", email: "priv@example.com", password: nil, emailPublic: true, namePublic: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })
            try await app.test(.GET, "users/priv") { res in
                XCTAssertEqual(try res.content.decode(UserResponse.self).email, "priv@example.com") // ahora visible
            }
        }
    }

    /// La foto que va en el formulario de crear la fuente también la cobra alguien.
    ///
    /// No deja rastro: no hay reseña con foto ni edición que toque `image`, la columna
    /// nace con la imagen puesta. El cálculo reconstruía la autoría solo con esos dos
    /// rastros, así que quien añade una fuente nueva con su foto —el caso normal de
    /// quien está delante de ella— no cobraba la primera foto y en la ficha salía «no
    /// consta quién la puso» con el autor escrito dos líneas más arriba.
    func testPhotoUploadedWhenCreatingTheFountainCreditsTheCreator() async throws {
        try await withApp { app in
            let id = try await register(app, username: "shooter")
            let tok = try await login(app, username: "shooter")
            try await app.test(.POST, "fonts", headers: bearer(tok), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(
                    name: "Con foto de fábrica", latitude: 41, longitude: 2,
                    image: "/uploads/creacion.jpg", description: nil, source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
            })

            let informe = try await ContributionScore.compute(on: app.db)
            let suyas = informe.contributions.filter { $0.userID == id }
            XCTAssertTrue(suyas.contains { $0.kind == .firstPhoto },
                          "la foto subida al crear la fuente no se la cobra nadie")
            XCTAssertFalse(suyas.contains { $0.kind == .photoReplaced },
                           "es la primera foto de la fuente, no una sustitución")
        }
    }

    /// …pero solo cuando la foto llegó **con** la fuente. Si la trajo una reseña
    /// posterior, la primera foto es de quien la trajo y el creador no la toca.
    func testPhotoFromAReviewBeatsTheCreator() async throws {
        try await withApp { app in
            let creador = try await register(app, username: "founder")
            let tokCreador = try await login(app, username: "founder")
            let fontID = try await createFont(app, token: tokCreador, name: "Sin foto", lat: 41, long: 2)

            let fotografo = try await register(app, username: "lens")
            let tokFoto = try await login(app, username: "lens")
            try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(tokFoto), beforeRequest: { req in
                try req.content.encode(CreateCommentDTO(
                    body: "Mana", rating: 5, waterStatus: "flowing", image: "/uploads/resena.jpg",
                    confirmIfUnchanged: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
            })

            let informe = try await ContributionScore.compute(on: app.db)
            XCTAssertTrue(informe.contributions.contains { $0.userID == fotografo && $0.kind == .firstPhoto },
                          "la primera foto es de quien la trajo")
            XCTAssertFalse(informe.contributions.contains { $0.userID == creador && $0.kind == .firstPhoto },
                           "el creador no puso ninguna foto")
        }
    }

    /// Cerrar una incidencia no la borra, y se puede reabrir.
    ///
    /// Que la fuente estuvo rota y volvió a manar es parte de su historia: borrarla pierde
    /// justo lo que mira quien duda si acercarse. Y **reabrir** es la condición que hace
    /// que esto se pueda abrir por nivel — sin vuelta atrás, una incidencia legítima
    /// podría quedar silenciada por alguien que se equivocó.
    func testResolvingAnIncidentKeepsItAndCanBeUndone() async throws {
        try await withApp { app in
            _ = try await register(app, username: "avisador")
            let tok = try await login(app, username: "avisador")
            let fontID = try await createFont(app, token: tok, name: "Rota", lat: 41, long: 2)

            var reportID = UUID()
            try await app.test(.POST, "fonts/\(fontID)/report", headers: bearer(tok), beforeRequest: { req in
                try req.content.encode(CreateReportDTO(message: "El caño está roto", isIncident: true, incidentKind: .broken, parentID: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                reportID = try res.content.decode(ReportResponse.self).id ?? reportID
            })

            try await app.test(.POST, "fonts/\(fontID)/report/\(reportID)/resolve", headers: bearer(tok)) { res in
                XCTAssertEqual(res.status, .ok)
                let r = try res.content.decode(ReportResponse.self)
                XCTAssertNotNil(r.resolvedAt)
                XCTAssertEqual(r.resolvedBy, "avisador")
            }

            // Sigue estando: resolver no borra.
            try await app.test(.GET, "fonts/\(fontID)/report") { res in
                let rs = try res.content.decode([ReportResponse].self)
                XCTAssertEqual(rs.count, 1)
                XCTAssertNotNil(rs.first?.resolvedAt)
            }

            try await app.test(.DELETE, "fonts/\(fontID)/report/\(reportID)/resolve", headers: bearer(tok)) { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertNil(try res.content.decode(ReportResponse.self).resolvedAt)
            }

            // La de otra persona no, mientras no se tenga el nivel.
            _ = try await register(app, username: "extranyo")
            let otro = try await login(app, username: "extranyo")
            try await app.test(.POST, "fonts/\(fontID)/report/\(reportID)/resolve", headers: bearer(otro)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }
        }
    }

    /// La galería: los documentos los sube cualquiera, las fotos de la fuente piden nivel.
    ///
    /// Es la regla que nació del caso real —un geólogo con el informe de salubridad del
    /// agua— y la que más fácil se rompe al tocar `Capabilities`: si `document` cayera
    /// bajo la misma puerta que el resto, la aportación más valiosa sería la única que
    /// no se puede hacer sin llevar meses en la app.
    func testAnyoneCanAddADocumentButNotAFountainPhoto() async throws {
        try await withApp { app in
            _ = try await register(app, username: "geologo")
            let tok = try await login(app, username: "geologo")
            let fontID = try await createFont(app, token: tok, name: "Con informe", lat: 41, long: 2)

            // El documento entra sin nivel: la cuenta se acaba de crear y tiene 0 gotas.
            try await app.test(.POST, "fonts/\(fontID)/photos", headers: bearer(tok), beforeRequest: { req in
                try req.content.encode(FontPhotoController.CreatePhotoDTO(
                    url: "/uploads/analisis.jpg", kind: .document, caption: "Análisis ACA"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok, "un documento no debería pedir nivel")
            })

            // Otra vista de la fuente sí, y la misma cuenta no llega.
            try await app.test(.POST, "fonts/\(fontID)/photos", headers: bearer(tok), beforeRequest: { req in
                try req.content.encode(FontPhotoController.CreatePhotoDTO(
                    url: "/uploads/otra.jpg", kind: .fountain, caption: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })

            // La galería es pública y el autor viaja con la clave presente.
            try await app.test(.GET, "fonts/\(fontID)/photos") { res in
                XCTAssertEqual(res.status, .ok)
                let json = try JSONSerialization.jsonObject(with: Data(buffer: res.body)) as? [[String: Any]] ?? []
                XCTAssertEqual(json.count, 1)
                XCTAssertEqual(json.first?["kind"] as? String, "document")
                let subio = json.first?["uploader"] as? [String: Any]
                XCTAssertEqual(subio?["username"] as? String, "geologo")
                XCTAssertTrue(subio?.keys.contains("id") == true)
            }
        }
    }

    /// Quién puso la primera foto lo resuelve el servidor, incluso cuando el cliente no
    /// puede: la reseña con foto gana al creador, y sin rastro se responde `null`.
    func testPhotoAuthorPrefersTheReviewThatBroughtIt() async throws {
        try await withApp { app in
            _ = try await register(app, username: "duenyo")
            let tokDuenyo = try await login(app, username: "duenyo")
            let fontID = try await createFont(app, token: tokDuenyo, name: "Sin foto", lat: 41, long: 2)

            _ = try await register(app, username: "camara")
            let tokFoto = try await login(app, username: "camara")
            try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(tokFoto), beforeRequest: { req in
                try req.content.encode(CreateCommentDTO(body: "Foto", rating: 5, waterStatus: "flowing",
                                                        image: "/uploads/de-la-resena.jpg", confirmIfUnchanged: nil))
            }, afterResponse: { res in XCTAssertEqual(res.status, .created) })

            // La fuente ya luce esa foto. Se pone directamente para no depender aquí de
            // por qué ruta se promovió: lo que se comprueba es a quién se le atribuye.
            let font = try await Font.find(fontID, on: app.db)
            font?.image = "/uploads/de-la-resena.jpg"
            try await font?.save(on: app.db)
            try await app.test(.GET, "fonts/\(fontID)/photo-author") { res in
                XCTAssertEqual(res.status, .ok)
                let json = try JSONSerialization.jsonObject(with: Data(buffer: res.body)) as? [String: Any]
                XCTAssertEqual(json?["username"] as? String, "camara")
            }

            // Una fuente sin foto responde `null`, con la clave presente.
            let sinFoto = try await createFont(app, token: tokDuenyo, name: "Pelada", lat: 41.2, long: 2.2)
            try await app.test(.GET, "fonts/\(sinFoto)/photo-author") { res in
                let json = try JSONSerialization.jsonObject(with: Data(buffer: res.body)) as? [String: Any]
                XCTAssertTrue(json?.keys.contains("username") == true)
                XCTAssertTrue(json?["username"] is NSNull)
            }
        }
    }

    /// Las insignias públicas se piden **por nombre igual que por UUID**.
    ///
    /// La ficha de la fuente tiene el UUID del creador y funcionaba; el perfil público
    /// vive en `/users/oriol_t` y devolvía 400. Dos rutas hermanas bajo `/users/:id`
    /// resolviendo el parámetro de forma distinta es una trampa que solo se ve al usarla.
    func testPublicBadgesAcceptAUsername() async throws {
        try await withApp { app in
            let id = try await register(app, username: "porelnombre")
            for ruta in ["users/porelnombre/badges", "users/\(id)/badges"] {
                try await app.test(.GET, ruta) { res in
                    XCTAssertEqual(res.status, .ok, "\(ruta) debería resolver")
                    let json = try JSONSerialization.jsonObject(with: Data(buffer: res.body)) as? [String: Any]
                    XCTAssertNotNil(json?["badges"])
                    // Sin aportar nada no hay nivel que anunciar, pero la clave viaja.
                    XCTAssertTrue(json?.keys.contains("level") == true,
                                  "`level` omitido: en el cliente eso es `undefined`, no `null`")
                }
            }
        }
    }

    /// Qué campos publica una fuente. Fija el contrato en las dos direcciones.
    ///
    /// Hacia fuera: `queued_offline` es un dato interno de gamificación —lo afirma el
    /// cliente y solo sirve para contar una insignia— y no tiene por qué viajar en cada
    /// `GET /fonts`. Fluent serializa el modelo entero, así que sin este test la próxima
    /// columna se cuela igual y nadie se entera.
    ///
    /// Hacia dentro: `creator` tiene que seguir saliendo como `{"id": null}` y no como
    /// `{}` en las fuentes importadas, que son la mayoría. Un opcional omitido llega al
    /// navegador como `undefined`, y ese ya nos ha roto dos pantallas.
    /// `PUT /fonts/:id/photo` — poner la foto y nada más. Misma asimetría que en todas
    /// partes: la primera la pone cualquiera, sustituirla no.
    func testSetFontPhotoIsFirstOnlyForStrangers() async throws {
        try await withApp { app in
            app.imageStorage = StubImageStorage()
            _ = try await register(app, username: "duenyo")
            let dueño = try await login(app, username: "duenyo")
            _ = try await register(app, username: "cualquiera")
            let extraño = try await login(app, username: "cualquiera")
            let fontID = try await createFont(app, token: dueño, name: "Sin foto", lat: 41.2, long: 2.2)
            struct PhotoDTO: Content { let image: String }
            struct FontOut: Content { let image: String? }

            // 1) No tiene foto: un extraño puede ponerla. Casi ninguna fuente importada
            //    tiene creador, así que si no, esas fichas no tendrían foto nunca.
            try await app.test(.PUT, "fonts/\(fontID)/photo", headers: bearer(extraño), beforeRequest: { req in
                try req.content.encode(PhotoDTO(image: "/uploads/primera.jpg"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(FontOut.self).image, "/uploads/primera.jpg")
            })
            // Queda en el historial: se puede revertir desde el panel.
            let ediciones = try await FontEdit.query(on: app.db).filter(\.$font.$id == fontID).all()
            XCTAssertEqual(ediciones.count, 1)
            XCTAssertNil(ediciones.first?.before.image)
            // Y va FIRMADA: el baremo saca las aportaciones de foto de las ediciones que
            // cambian `image`, así que sin editor esta ruta no pagaría «primera foto».
            XCTAssertNotNil(ediciones.first?.$editor.id)

            // El autor de la portada puede pedir retirarla, sin borrarla directamente.
            struct RemovalStatus: Content { let canRequest: Bool; let pending: Bool; let canUndo: Bool }
            try await app.test(.GET, "fonts/\(fontID)/photo-removal-request", headers: bearer(extraño)) { res in
                XCTAssertEqual(res.status, .ok)
                let status = try res.content.decode(RemovalStatus.self)
                XCTAssertTrue(status.canRequest)
                XCTAssertFalse(status.pending)
                XCTAssertTrue(status.canUndo)
            }
            try await app.test(.POST, "fonts/\(fontID)/photo-removal-request", headers: bearer(extraño)) { res in
                XCTAssertEqual(res.status, .created)
            }
            let savedRequest = try await ContentFlag.query(on: app.db)
                .filter(\.$targetType == "cover_photo_removal").first()
            let request = try XCTUnwrap(savedRequest)
            XCTAssertEqual(request.targetID, ediciones.first?.id)
            XCTAssertEqual(request.fontID, fontID)
            // La petición se puede cancelar y la foto permanece intacta.
            try await app.test(.DELETE, "fonts/\(fontID)/photo-removal-request", headers: bearer(extraño)) { res in
                XCTAssertEqual(res.status, .noContent)
            }
            let requestCount = try await ContentFlag.query(on: app.db).count()
            let unchangedFont = try await Font.find(fontID, on: app.db)
            XCTAssertEqual(requestCount, 0)
            XCTAssertEqual(unchangedFont?.image, "/uploads/primera.jpg")

            // 2) Ya tiene: el extraño no la sustituye.
            try await app.test(.PUT, "fonts/\(fontID)/photo", headers: bearer(extraño), beforeRequest: { req in
                try req.content.encode(PhotoDTO(image: "/uploads/otra.jpg"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })
            // 3) El creador sí.
            try await app.test(.PUT, "fonts/\(fontID)/photo", headers: bearer(dueño), beforeRequest: { req in
                try req.content.encode(PhotoDTO(image: "/uploads/otra.jpg"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(FontOut.self).image, "/uploads/otra.jpg")
            })
            // 4) Sin sesión, nada.
            try await app.test(.PUT, "fonts/\(fontID)/photo", beforeRequest: { req in
                try req.content.encode(PhotoDTO(image: "/uploads/x.jpg"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .unauthorized)
            })
        }
    }

    /// Una excepción de confianza solo salta el cupo de cinco altas de las cuentas
    /// nuevas. No exige convertir a la persona en staff ni tocar su fecha de registro.
    func testTemporarySourceLimitExemption() async throws {
        try await withApp { app in
            let userID = try await register(app, username: "trusted-mapper")
            let token = try await login(app, username: "trusted-mapper")

            func create(_ n: Int) async throws -> HTTPStatus {
                var status = HTTPStatus.ok
                try await app.test(.POST, "fonts", headers: bearer(token), beforeRequest: { req in
                    try req.content.encode(CreateFontDTO(
                        name: "Fuente \(n)", latitude: 40 + Double(n) * 0.01,
                        longitude: -3, image: nil, description: nil,
                        source: .tap, drinkable: nil
                    ))
                }, afterResponse: { status = $0.status })
                return status
            }

            for n in 1...5 {
                let status = try await create(n)
                XCTAssertEqual(status, .created)
            }
            let blocked = try await create(6)
            XCTAssertEqual(blocked, .tooManyRequests)

            let storedUser = try await User.find(userID, on: app.db)
            let user = try XCTUnwrap(storedUser)
            user.sourceLimitExemptUntil = Date().addingTimeInterval(7 * 86_400)
            try await user.save(on: app.db)
            let allowed = try await create(6)
            XCTAssertEqual(allowed, .created)

            // Caducada vuelve a proteger, sin depender de ningún proceso de limpieza.
            user.sourceLimitExemptUntil = Date().addingTimeInterval(-1)
            try await user.save(on: app.db)
            let blockedAgain = try await create(7)
            XCTAssertEqual(blockedAgain, .tooManyRequests)
        }
    }

    /// El usuario puede pedir ayuda desde el propio límite y el administrador la
    /// concede desde la cola. Repetir la petición no duplica tarjetas.
    func testSourceLimitExemptionRequestFlow() async throws {
        try await withApp { app in
            let userID = try await register(app, username: "onfire")
            let userToken = try await login(app, username: "onfire")
            let adminID = try await register(app, username: "quota-admin")
            try await setRole(app, userID: adminID, role: .admin)
            let adminToken = try await login(app, username: "quota-admin")

            for expected in [HTTPStatus.created, .noContent] {
                try await app.test(.POST, "users/source-limit-exemption-request",
                                   headers: bearer(userToken)) { response in
                    XCTAssertEqual(response.status, expected)
                }
            }
            let pendingCount = try await ContentFlag.query(on: app.db)
                .filter(\.$targetType == "source_limit_exemption").count()
            XCTAssertEqual(pendingCount, 1)

            var requestID = UUID()
            try await app.test(.GET, "flags", headers: bearer(adminToken)) { response in
                let flags = try response.content.decode([FlagResponse].self)
                let request = try XCTUnwrap(flags.first { $0.targetType == "source_limit_exemption" })
                requestID = try XCTUnwrap(request.id)
                XCTAssertEqual(request.targetID, userID)
                XCTAssertEqual(request.targetAuthorName, "onfire")
            }
            try await app.test(.POST, "flags/\(requestID)/approve-source-limit-exemption",
                               headers: bearer(adminToken)) { response in
                XCTAssertEqual(response.status, .noContent)
            }

            let storedUser = try await User.find(userID, on: app.db)
            let user = try XCTUnwrap(storedUser)
            XCTAssertTrue(user.hasSourceLimitExemption)
            let remainingCount = try await ContentFlag.query(on: app.db)
                .filter(\.$targetType == "source_limit_exemption").count()
            XCTAssertEqual(remainingCount, 0)
        }
    }

    /// Las dos mitades de la regla: una reseña con foto **pone** la portada si no había
    /// ninguna, y **no la sustituye** si ya la hay. La segunda es la que sostiene que
    /// esto pueda ser automático: añadir donde no había nada solo puede mejorar la ficha.
    func testReviewPhotoBecomesCoverOnlyWhenThereIsNone() async throws {
        try await withApp { app in
            // El almacén COPIA el objeto, así que aquí va el de mentira y no se toca el
            // disco. (Si la copia fallara de verdad, la reseña se guardaría igual y
            // `coverAdopted` saldría `false`: la foto no puede costar la reseña.)
            app.imageStorage = StubImageStorage()
            _ = try await register(app, username: "portada")
            let tok = try await login(app, username: "portada")

            // 1) Fuente sin foto: la reseña se la pone, y la respuesta lo dice.
            let vacia = try await createFont(app, token: tok, name: "Sin foto", lat: 41.1, long: 2.1)
            try await app.test(.POST, "fonts/\(vacia)/comments", headers: bearer(tok), beforeRequest: { req in
                try req.content.encode(CreateCommentDTO(body: "raja", rating: nil, waterStatus: "flowing", image: "/uploads/a.jpg", confirmIfUnchanged: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                XCTAssertTrue(try res.content.decode(CommentResponse.self).coverAdopted)
            })
            let conPortada = try await Font.find(vacia, on: app.db)
            XCTAssertNotNil(conPortada?.image)
            // Se copia el objeto: la ficha no comparte fichero con la reseña.
            XCTAssertNotEqual(conPortada?.image, "/uploads/a.jpg")
            // Y queda rastro en el historial, o la portada aparecería de la nada.
            let ediciones = try await FontEdit.query(on: app.db).filter(\.$font.$id == vacia).all()
            XCTAssertEqual(ediciones.count, 1)
            XCTAssertNil(ediciones.first?.before.image)
            // **Sin firmar**, y esto no es un detalle: el baremo cuenta una aportación de
            // foto por cada reseña con imagen Y por cada edición que cambia `image`. Esta
            // foto deja las dos huellas, así que firmándola se cobraba dos veces —medido:
            // «primera foto» más «foto sustituida», 15 gotas de más—. El mérito lo lleva
            // la reseña, que es de donde salió la foto.
            XCTAssertNil(ediciones.first?.$editor.id)

            // 2) La siguiente reseña con foto ya no toca nada.
            let antes = conPortada?.image
            try await app.test(.POST, "fonts/\(vacia)/comments", headers: bearer(tok), beforeRequest: { req in
                try req.content.encode(CreateCommentDTO(body: "otra", rating: nil, waterStatus: "flowing", image: "/uploads/b.jpg", confirmIfUnchanged: nil))
            }, afterResponse: { res in
                XCTAssertFalse(try res.content.decode(CommentResponse.self).coverAdopted)
            })
            let despues = try await Font.find(vacia, on: app.db)
            XCTAssertEqual(despues?.image, antes)
        }
    }

    /// `untreated` viaja entera: se acepta al editar y sale igual al leer.
    ///
    /// Parece de perogrullo y no lo es: `Drinkable` se decodifica desde el `rawValue`,
    /// así que quitar el caso no rompe la compilación de nada — deja un 400 «Cannot
    /// initialize Drinkable from invalid String value untreated» en la única pantalla
    /// donde se usa. Es exactamente el fallo que dio un binario sin recompilar.
    func testUntreatedRoundTrips() async throws {
        try await withApp { app in
            _ = try await register(app, username: "notractada")
            let tok = try await login(app, username: "notractada")
            let id = try await createFont(app, token: tok, name: "Font del Montnegre", lat: 41.6, long: 2.6)

            try await app.test(.PUT, "fonts/\(id)", headers: bearer(tok), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Font del Montnegre", latitude: 41.6, longitude: 2.6,
                                                     image: nil, description: nil, source: .mountain, drinkable: .untreated))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok, "PUT con drinkable=untreated debería aceptarse")
            })

            try await app.test(.GET, "fonts/\(id)") { res in
                XCTAssertEqual(res.status, .ok)
                let json = try JSONSerialization.jsonObject(with: Data(buffer: res.body)) as? [String: Any]
                XCTAssertEqual(json?["drinkable"] as? String, "untreated")
            }
        }
    }

    /// No tratada NO es no potable: son la mitad de las fuentes de montaña y esconderlas
    /// del mapa vaciaría justo la zona a la que se va. Lo fija aquí y no en el cliente
    /// porque el listado es el que las tiene que seguir devolviendo.
    func testUntreatedIsNotHiddenFromTheMap() async throws {
        try await withApp { app in
            try await Font(name: "Deu sense tractar", latitude: 41.7, longitude: 2.7,
                           source: .mountain, drinkable: .untreated).create(on: app.db)

            try await app.test(.GET, "fonts?search=Deu") { res in
                XCTAssertEqual(res.status, .ok)
                let json = try JSONSerialization.jsonObject(with: Data(buffer: res.body)) as? [String: Any]
                let items = json?["items"] as? [[String: Any]] ?? []
                XCTAssertTrue(items.contains { $0["drinkable"] as? String == "untreated" },
                              "una fuente no tratada tiene que salir en el listado público")
            }
        }
    }

    /// El JSON público dice que una ficha está escondida, pero **no por qué**.
    ///
    /// El motivo (`hidden_spam`, `hidden_fake`, `hidden_abuse`) es un veredicto de
    /// moderación sobre el trabajo de una persona, y `creator` también es público: juntos
    /// publicarían «a fulano le marcaron esto como spam». Nadie lo usa — el aviso de la
    /// ficha solo distingue `pending`, y el botón del moderador solo mira si es `visible`.
    /// `GET /fonts` sirve para **buscar**, no para barrer la base.
    ///
    /// Sin término era un catálogo paginado por nombre: 89.000 fuentes a 100 por página
    /// son 893 peticiones ordenadas, sin repetir ni saltarse nada. Es el camino más cómodo
    /// para llevárselo todo. No cierra la copia —`in-bounds` da 3.000 por llamada y tiene
    /// que seguir abierta porque la usa el mapa— pero quita el camino fácil.
    ///
    /// El corte va en «hay término» y **no** en la ruta entera: cerrarla habría roto el
    /// buscador para quien no tiene cuenta, que es justo quien llega por un cartel.
    func testFontsListNeedsASearchTerm() async throws {
        try await withApp { app in
            try await app.test(.GET, "/fonts?per=100&page=2") { res in
                XCTAssertEqual(res.status, .forbidden, "barrer sin término no")
            }
            try await app.test(.GET, "/fonts?search=font&per=6") { res in
                XCTAssertEqual(res.status, .ok, "buscar sí, y sin sesión")
            }
            // Y la profundidad: exigir un término sin esto no cierra nada, porque `search=a`
            // casa con casi cualquier nombre y paginando se vuelve a barrer con una letra.
            try await app.test(.GET, "/fonts?search=a&page=\(FontController.maxPublicPage + 1)") { res in
                XCTAssertEqual(res.status, .forbidden, "quien va por la página 40 está barriendo")
            }
        }
    }

    func testFontJSONDoesNotPublishWhyItWasHidden() throws {
        XCTAssertEqual(Font.publicModerationState("visible"), "visible")
        XCTAssertEqual(Font.publicModerationState("pending"), "pending",
                       "«en cuarentena» sí es público: la ficha lo explica de otra forma")
        XCTAssertEqual(Font.publicModerationState("hidden_spam"), "hidden")
        XCTAssertEqual(Font.publicModerationState("hidden_fake"), "hidden")
        XCTAssertEqual(Font.publicModerationState("hidden_abuse"), "hidden")
    }

    func testFontJSONHidesInternalColumns() async throws {
        try await withApp { app in
            _ = try await register(app, username: "shape")
            let tok = try await login(app, username: "shape")
            _ = try await createFont(app, token: tok, name: "Con dueño", lat: 41, long: 2)

            // Una importada: sin creador, que es el caso donde el `null` importa.
            try await Font(name: "Importada", latitude: 41.5, longitude: 2.5).create(on: app.db)

            try await app.test(.GET, "fonts?search=Importada") { res in
                XCTAssertEqual(res.status, .ok)
                let json = try JSONSerialization.jsonObject(with: Data(buffer: res.body)) as? [String: Any]
                let items = json?["items"] as? [[String: Any]] ?? []
                XCTAssertFalse(items.isEmpty)
                for f in items {
                    XCTAssertNil(f["queuedOffline"], "columna interna publicada en /fonts")
                    // `retired_by` es de moderación: quién la retiró no es asunto público.
                    // `duplicateOf` y `retiredAt` **sí** salen —la ficha tiene que poder
                    // explicar por qué el punto no está— y salen SIEMPRE, con null.
                    XCTAssertNil(f["retiredBy"], "quién retiró la fuente no es público")
                    XCTAssertTrue(f.keys.contains("duplicateOf"), "omitida = `undefined` en el cliente")
                    XCTAssertTrue(f.keys.contains("retiredAt"), "omitida = `undefined` en el cliente")
                    let creator = f["creator"] as? [String: Any]
                    XCTAssertNotNil(creator, "creator debe salir siempre, aunque sea sin id")
                    XCTAssertTrue(creator?.keys.contains("id") == true,
                                  "creator sin la clave `id`: en el cliente eso es `undefined`, no `null`")
                }
            }
        }
    }

    /// "Borrar" la cuenta la anonimiza: las fuentes se conservan, los datos
    /// personales se eliminan y el login deja de funcionar.
    func testDeleteAccountAnonymizes() async throws {
        try await withApp { app in
            let id = try await register(app, username: "quitter")
            let tok = try await login(app, username: "quitter")
            let fontID = try await createFont(app, token: tok, name: "Su fuente", lat: 41, long: -2)

            try await app.test(.DELETE, "users/\(id)", headers: bearer(tok)) { res in
                XCTAssertEqual(res.status, .noContent)
            }

            // La fuente sigue existiendo.
            struct FontOut: Content { let id: UUID }
            try await app.test(.GET, "fonts/\(fontID)") { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(FontOut.self).id, fontID)
            }

            // El perfil queda anonimizado: sin el nombre real ni el email.
            try await app.test(.GET, "users/\(id)") { res in
                XCTAssertEqual(res.status, .ok)
                let u = try res.content.decode(UserResponse.self)
                XCTAssertTrue(u.anonymized)
                XCTAssertNil(u.email)
                XCTAssertNotEqual(u.name, "quitter")
            }

            // El login ya no funciona.
            try await app.test(.POST, "auth/login", beforeRequest: { req in
                req.headers.basicAuthorization = .init(username: "quitter", password: "password123")
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .unauthorized)
            })
        }
    }

    // MARK: - Ubicación de registro (geo-IP) y estadística

    /// El GeoLocator configurado rellena país/región/ciudad al registrarse.
    func testSignupLocationStored() async throws {
        try await withApp { app in
            app.geoLocator = StubGeoLocator(location: GeoLocation(country: "Spain", region: "Galicia", city: "A Coruña"))
            let id = try await register(app, username: "galego")
            // El geo-IP ya no bloquea el registro: se resuelve en segundo plano, así
            // que aquí esperamos a que aterrice en vez de leerlo de inmediato.
            var u = try await User.find(id, on: app.db)
            for _ in 0..<50 where u?.signupRegion == nil {
                try await Task.sleep(nanoseconds: 100_000_000)
                u = try await User.find(id, on: app.db)
            }
            XCTAssertEqual(u?.signupRegion, "Galicia")
            XCTAssertEqual(u?.signupCountry, "Spain")
            XCTAssertEqual(u?.signupCity, "A Coruña")
        }
    }

    /// La estadística por región es solo para admins y agrupa correctamente.
    func testRegionStatsAdminOnly() async throws {
        try await withApp { app in
            app.geoLocator = StubGeoLocator(location: GeoLocation(country: "Spain", region: "Extremadura", city: "Cáceres"))
            try await register(app, username: "ex1")
            try await register(app, username: "ex2")

            let normalTok = try await login(app, username: "ex1")
            try await app.test(.GET, "users/stats/regions", headers: bearer(normalTok)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }

            let adminID = try await register(app, username: "statsadmin")
            try await makeAdmin(app, userID: adminID)
            let adminTok = try await login(app, username: "statsadmin")
            try await app.test(.GET, "users/stats/regions", headers: bearer(adminTok)) { res in
                XCTAssertEqual(res.status, .ok)
                let rows = try res.content.decode([RegionCount].self)
                let extremadura = rows.first { $0.region == "Extremadura" }
                XCTAssertEqual(extremadura?.count, 3) // ex1, ex2 y el propio admin
            }
        }
    }

    /// Guardar/quitar favorito: toggle idempotente, recuento y aparición en /me/favorites.
    func testFavoriteToggleAndList() async throws {
        try await withApp { app in
            try await register(app, username: "faver")
            let token = try await login(app, username: "faver")
            let fontID = try await createFont(app, token: token, name: "Font", lat: 40, long: -3)

            // Sin token: recuento 0 y favorited=false.
            try await app.test(.GET, "fonts/\(fontID)/favorite") { res in
                XCTAssertEqual(res.status, .ok)
                let s = try res.content.decode(FavoriteStatus.self)
                XCTAssertFalse(s.favorited)
                XCTAssertEqual(s.count, 0)
            }

            // Guardar (dos veces: idempotente, sigue en 1).
            for _ in 0..<2 {
                try await app.test(.POST, "fonts/\(fontID)/favorite", headers: bearer(token)) { res in
                    XCTAssertEqual(res.status, .ok)
                    let s = try res.content.decode(FavoriteStatus.self)
                    XCTAssertTrue(s.favorited)
                    XCTAssertEqual(s.count, 1)
                }
            }

            // Aparece en la lista del usuario.
            try await app.test(.GET, "auth/me/favorites", headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .ok)
                let fonts = try res.content.decode([FontJSON].self)
                XCTAssertEqual(fonts.map { $0.id }, [fontID])
            }

            // Quitar: vuelve a 0 y desaparece de la lista.
            try await app.test(.DELETE, "fonts/\(fontID)/favorite", headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .ok)
                let s = try res.content.decode(FavoriteStatus.self)
                XCTAssertFalse(s.favorited)
                XCTAssertEqual(s.count, 0)
            }
            try await app.test(.GET, "auth/me/favorites", headers: bearer(token)) { res in
                let fonts = try res.content.decode([FontJSON].self)
                XCTAssertTrue(fonts.isEmpty)
            }
        }
    }

    /// Un moderador puede borrar la reseña de otro; un usuario normal, no.
    func testModeratorCanDeleteOthersComment() async throws {
        try await withApp { app in
            let authorID = try await register(app, username: "author")
            let authorTok = try await login(app, username: "author")
            let fontID = try await createFont(app, token: authorTok, name: "F", lat: 40, long: -3)
            let commentID = try await addComment(app, token: authorTok, fontID: fontID, body: "hola")
            _ = authorID

            // Usuario normal ajeno: 403.
            try await register(app, username: "rando")
            let randoTok = try await login(app, username: "rando")
            try await app.test(.DELETE, "fonts/\(fontID)/comments/\(commentID)", headers: bearer(randoTok)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }

            // Moderador: 204.
            let modID = try await register(app, username: "mod")
            try await setRole(app, userID: modID, role: .moderator)
            let modTok = try await login(app, username: "mod")
            try await app.test(.DELETE, "fonts/\(fontID)/comments/\(commentID)", headers: bearer(modTok)) { res in
                XCTAssertEqual(res.status, .noContent)
            }
        }
    }

    /// Solo el owner asigna roles; no puede crear otro owner ni cambiar el suyo.
    func testOnlyOwnerCanSetRole() async throws {
        try await withApp { app in
            let ownerID = try await register(app, username: "owner")
            try await setRole(app, userID: ownerID, role: .owner)
            let ownerTok = try await login(app, username: "owner")
            let targetID = try await register(app, username: "target")

            // Un admin (no owner) no puede asignar roles.
            let adminID = try await register(app, username: "adm")
            try await setRole(app, userID: adminID, role: .admin)
            let adminTok = try await login(app, username: "adm")
            try await app.test(.PUT, "users/\(targetID)/role", headers: bearer(adminTok), beforeRequest: { req in
                try req.content.encode(SetRoleDTO(role: "moderator"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })

            // El owner sí: promueve a moderador (además, por USERNAME, no por id).
            try await app.test(.PUT, "users/target/role", headers: bearer(ownerTok), beforeRequest: { req in
                try req.content.encode(SetRoleDTO(role: "moderator"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(UserResponse.self).role, "moderator")
            })

            // No puede asignar el rol owner desde la web.
            try await app.test(.PUT, "users/\(targetID)/role", headers: bearer(ownerTok), beforeRequest: { req in
                try req.content.encode(SetRoleDTO(role: "owner"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
            })

            // No puede cambiar su propio rol.
            try await app.test(.PUT, "users/\(ownerID)/role", headers: bearer(ownerTok), beforeRequest: { req in
                try req.content.encode(SetRoleDTO(role: "admin"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
            })
        }
    }

    /// El listado completo de usuarios es solo del owner, paginado y con búsqueda.
    func testAdminUsersListOwnerOnly() async throws {
        try await withApp { app in
            let ownerID = try await register(app, username: "owner")
            try await setRole(app, userID: ownerID, role: .owner)
            let ownerTok = try await login(app, username: "owner")
            let aliceID = try await register(app, username: "alice")
            try await register(app, username: "bob")
            let foundAlice = try await User.find(aliceID, on: app.db)
            let alice = try XCTUnwrap(foundAlice)
            alice.lang = "es"
            alice.signupCity = "Estocolmo"
            alice.signupRegion = "Stockholm"
            alice.signupSource = "cartel-centro"
            try await alice.save(on: app.db)

            try await app.test(.GET, "users/admin", headers: bearer(ownerTok), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let page = try res.content.decode(Page<AdminUser>.self)
                XCTAssertEqual(page.metadata.total, 3)
            })
            try await app.test(.GET, "users/admin?search=alic", headers: bearer(ownerTok), afterResponse: { res in
                let page = try res.content.decode(Page<AdminUser>.self)
                XCTAssertEqual(page.items.map { $0.username }, ["alice"])
                XCTAssertEqual(page.items.first?.lang, "es")
                XCTAssertEqual(page.items.first?.signupCity, "Estocolmo")
                XCTAssertEqual(page.items.first?.signupRegion, "Stockholm")
                XCTAssertEqual(page.items.first?.signupSource, "cartel-centro")
            })
            // Un usuario normal (no owner): 403.
            let aliceTok = try await login(app, username: "alice")
            try await app.test(.GET, "users/admin", headers: bearer(aliceTok), afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })
        }
    }

    /// Triaje de ediciones: aceptar (✓) marca revisada y la saca de la cola pendiente.
    func testEditReviewInboxFlow() async throws {
        try await withApp { app in
            _ = try await register(app, username: "creator")
            let creatorTok = try await login(app, username: "creator")
            let fontID = try await createFont(app, token: creatorTok, name: "Original", lat: 40, long: -3)

            // Una edición de info (cambia el nombre) crea un FontEdit pendiente.
            try await app.test(.PUT, "fonts/\(fontID)", headers: bearer(creatorTok), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Nuevo", latitude: 40, longitude: -3, image: nil, description: nil, source: nil, drinkable: nil))
            }, afterResponse: { res in XCTAssertEqual(res.status, .ok) })

            let adminID = try await register(app, username: "adm")
            try await setRole(app, userID: adminID, role: .admin)
            let adminTok = try await login(app, username: "adm")

            // Cola pendiente: 1.
            var editID = UUID()
            try await app.test(.GET, "fonts/edits?unreviewed=true", headers: bearer(adminTok), afterResponse: { res in
                let edits = try res.content.decode([FontEditResponse].self)
                XCTAssertEqual(edits.count, 1)
                editID = try XCTUnwrap(edits.first?.id)
                XCTAssertNil(edits.first?.reviewedAt)
            })

            // Aceptar (✓).
            try await app.test(.POST, "fonts/edits/\(editID)/review", headers: bearer(adminTok)) { res in
                XCTAssertEqual(res.status, .noContent)
            }

            // Ya no está en la cola…
            try await app.test(.GET, "fonts/edits?unreviewed=true", headers: bearer(adminTok), afterResponse: { res in
                XCTAssertEqual(try res.content.decode([FontEditResponse].self).count, 0)
            })
            // …pero sí en el historial completo, marcada como revisada.
            try await app.test(.GET, "fonts/edits", headers: bearer(adminTok), afterResponse: { res in
                let all = try res.content.decode([FontEditResponse].self)
                XCTAssertEqual(all.count, 1)
                XCTAssertNotNil(all.first?.reviewedAt)
            })
        }
    }

    /// Guardar favorito requiere sesión.
    func testFavoriteRequiresAuth() async throws {
        try await withApp { app in
            try await register(app, username: "anon-fav")
            let token = try await login(app, username: "anon-fav")
            let fontID = try await createFont(app, token: token, name: "F", lat: 40, long: -3)
            try await app.test(.POST, "fonts/\(fontID)/favorite") { res in
                XCTAssertEqual(res.status, .unauthorized)
            }
        }
    }

    /// El resumen semanal recoge la actividad AJENA en tus fuentes (y no la tuya),
    /// y una fuente nueva de otro cerca cuenta como novedad.
    func testWeeklyDigestCollectsOthersActivity() async throws {
        try await withApp { app in
            try await register(app, username: "digest-owner")
            try await register(app, username: "digest-other")
            let owner = try await login(app, username: "digest-owner")
            let other = try await login(app, username: "digest-other")

            let fontID = try await createFont(app, token: owner, name: "Font meva", lat: 41.8, long: 2.1)
            _ = try await addComment(app, token: other, fontID: fontID, body: "Rajava bé")
            _ = try await addComment(app, token: owner, fontID: fontID, body: "La meva pròpia")
            _ = try await createFont(app, token: other, name: "Font nova a prop", lat: 41.81, long: 2.11)

            guard let user = try await User.query(on: app.db).filter(\.$username == "digest-owner").first() else {
                return XCTFail("usuari no trobat")
            }
            let digest = try await WeeklyDigest.build(for: user, since: Date().addingTimeInterval(-7 * 86_400), on: app.db)
            XCTAssertTrue(digest.isWorthSending)
            // Solo la reseña del OTRO, nunca la propia.
            XCTAssertEqual(digest.activity.count, 1)
            XCTAssertEqual(digest.activity.first?.author, "digest-other")
            XCTAssertEqual(digest.fontsAdded, 1)
            XCTAssertEqual(digest.nearby.map(\.name), ["Font nova a prop"])
        }
    }

    /// Sin actividad ajena no se envía nada (un resumen vacío solo enseña a ignorarlo).
    func testWeeklyDigestSkipsQuietWeek() async throws {
        try await withApp { app in
            try await register(app, username: "digest-quiet")
            let token = try await login(app, username: "digest-quiet")
            _ = try await createFont(app, token: token, name: "Font solitària", lat: 10, long: 10)
            guard let user = try await User.query(on: app.db).filter(\.$username == "digest-quiet").first() else {
                return XCTFail("usuari no trobat")
            }
            let digest = try await WeeklyDigest.build(for: user, since: Date().addingTimeInterval(-7 * 86_400), on: app.db)
            XCTAssertFalse(digest.isWorthSending)
        }
    }

    /// La baja desde el correo funciona sin sesión, pero solo con el token firmado
    /// correcto: uno inventado (o el de otro usuario) no da de baja a nadie.
    func testUnsubscribeNeedsValidToken() async throws {
        try await withApp { app in
            let userID = try await register(app, username: "digest-unsub")

            try await app.test(.POST, "users/unsubscribe", beforeRequest: { req in
                try req.content.encode(UnsubscribeDTO(user: userID.uuidString, token: "inventat"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
            })

            try await app.test(.POST, "users/unsubscribe", beforeRequest: { req in
                try req.content.encode(UnsubscribeDTO(user: userID.uuidString, token: UnsubscribeToken.make(userID: userID)))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })
            let user = try await User.find(userID, on: app.db)
            XCTAssertEqual(user?.weeklyDigest, false)
        }
    }

    /// El envío manual del resumen es la acción de mayor alcance de la app
    /// (escribe a todos los usuarios): solo el propietario, ni siquiera un admin.
    func testWeeklyDigestSendIsOwnerOnly() async throws {
        try await withApp { app in
            let adminID = try await register(app, username: "digest-admin")
            try await setRole(app, userID: adminID, role: .admin)
            let adminTok = try await login(app, username: "digest-admin")

            try await app.test(.GET, "admin/weekly-digest", headers: bearer(adminTok), afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })
            try await app.test(.POST, "admin/weekly-digest", headers: bearer(adminTok), afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })
            try await app.test(.GET, "admin/weekly-digest", afterResponse: { res in
                XCTAssertEqual(res.status, .unauthorized)
            })

            // El propietario sí puede, y la vista previa no envía nada.
            let bossID = try await register(app, username: "digest-boss")
            try await setRole(app, userID: bossID, role: .owner)
            let ownerTok = try await login(app, username: "digest-boss")
            try await app.test(.GET, "admin/weekly-digest", headers: bearer(ownerTok), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertFalse(try res.content.decode(WeeklyDigestSender.Result.self).sent)
            })
        }
    }

    /// El contador de altas del distintivo: solo admins, y entiende la fecha que manda
    /// el navegador (`toISOString()`, con milisegundos).
    func testNewUsersCount() async throws {
        try await withApp { app in
            let adminID = try await register(app, username: "count-admin")
            try await setRole(app, userID: adminID, role: .admin)
            let adminTok = try await login(app, username: "count-admin")

            // Un usuario normal no ve la estadística.
            try await register(app, username: "count-plain")
            let plainTok = try await login(app, username: "count-plain")
            try await app.test(.GET, "users/stats/new", headers: bearer(plainTok), afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })

            // Marca de tiempo con milisegundos, como la que manda el navegador.
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let now = f.string(from: Date())

            try await app.test(.GET, "users/stats/new?since=\(now)", headers: bearer(adminTok), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                // Nadie s'ha registrat després d'aquest instant.
                XCTAssertEqual(try res.content.decode(NewUsersCount.self).count, 0)
            })

            try await register(app, username: "count-new-one")
            try await register(app, username: "count-new-two")

            try await app.test(.GET, "users/stats/new?since=\(now)", headers: bearer(adminTok), afterResponse: { res in
                XCTAssertEqual(try res.content.decode(NewUsersCount.self).count, 2)
            })
        }
    }

    /// El código del cartel (`?p=…`) se guarda con el alta, y entra saneado a la BD:
    /// lo escribe quien quiera en la URL, así que nada de HTML ni cadenas kilométricas.
    func testSignupSourceIsStoredAndCleaned() async throws {
        try await withApp { app in
            try await app.test(.POST, "users", beforeRequest: { req in
                var dto = CreateUserDTO(name: "Cartell", username: "src-user", email: "src@example.com", password: "password123")
                dto.source = "  CASTELLCIR/<script>x</script> "
                try req.content.encode(dto)
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
            })
            let user = try await User.query(on: app.db).filter(\.$username == "src-user").first()
            XCTAssertEqual(user?.signupSource, "castellcirscriptxscript")

            // Sin código: queda nulo, no cadena vacía.
            try await register(app, username: "src-none")
            let plain = try await User.query(on: app.db).filter(\.$username == "src-none").first()
            XCTAssertNil(plain?.signupSource)

            // Tope de longitud.
            XCTAssertEqual(UserController.cleanSource(String(repeating: "a", count: 100))?.count, 40)
            XCTAssertNil(UserController.cleanSource("///"))
        }
    }

    /// La actividad reciente mezcla los movimientos, más nuevos primero, y es de
    /// LECTURA PÚBLICA — salvo las ediciones, que solo ven los administradores.
    func testActivityFeed() async throws {
        try await withApp { app in
            let adminID = try await register(app, username: "act-admin")
            try await setRole(app, userID: adminID, role: .admin)
            let adminTok = try await login(app, username: "act-admin")

            try await register(app, username: "act-user")
            let userTok = try await login(app, username: "act-user")

            let fontID = try await createFont(app, token: userTok, name: "Font activitat", lat: 41.8, long: 2.1)
            _ = try await addComment(app, token: userTok, fontID: fontID, body: "Raja bé")

            // Sin sesión: se ve igual. Lo que hay aquí ya está en la ficha de la fuente.
            try await app.test(.GET, "activity?limit=10", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let items = try res.content.decode([ActivityItem].self)
                XCTAssertTrue(items.contains { $0.kind == .fontAdded && $0.fontName == "Font activitat" })
                XCTAssertTrue(items.contains { $0.kind == .review && $0.author == "act-user" })
                // Lo más nuevo, arriba.
                XCTAssertEqual(items.first?.createdAt, items.map(\.createdAt).max())
            })

            // Una edición: el historial es de moderación, así que no sale en público.
            try await app.test(.PUT, "fonts/\(fontID)", headers: bearer(userTok), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Font activitat", latitude: 41.8, longitude: 2.1, image: nil, description: "Editada", source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })

            try await app.test(.GET, "activity?limit=20", afterResponse: { res in
                XCTAssertFalse(try res.content.decode([ActivityItem].self).contains { $0.kind == .edit },
                               "el público no debe ver quién editó qué")
            })
            try await app.test(.GET, "activity?limit=20", headers: bearer(adminTok), afterResponse: { res in
                XCTAssertTrue(try res.content.decode([ActivityItem].self).contains { $0.kind == .edit })
            })

            // Filtro por zona: la fuente no tiene región, así que no sale.
            try await app.test(.GET, "activity?region=Barcelona", afterResponse: { res in
                XCTAssertEqual(try res.content.decode([ActivityItem].self).count, 0)
            })

            // Cercanía: dentro del radio sale; a mil kilómetros, no.
            try await app.test(.GET, "activity?lat=41.8&long=2.1&km=5", afterResponse: { res in
                XCTAssertTrue(try res.content.decode([ActivityItem].self).contains { $0.fontName == "Font activitat" })
            })
            try await app.test(.GET, "activity?lat=28.1&long=-15.4&km=5", afterResponse: { res in
                XCTAssertEqual(try res.content.decode([ActivityItem].self).count, 0)
            })
        }
    }

    /// El perfil se encuentra escribas el nombre como lo escribas.
    ///
    /// Las dos mitades de una mención decían cosas distintas: `MentionNotifier` resuelve
    /// en minúsculas —`@sebas` avisa a `Sebas`— pero `/users/:id` comparaba exacto, así
    /// que el enlace del texto llevaba a un 404. Recibías el aviso y, al ir a mirar, tu
    /// propio perfil no existía. En producción le pasaba a 4 de 15 autores recientes.
    func testUsernameLookupIgnoresCase() async throws {
        try await withApp { app in
            _ = try await register(app, username: "Sebas")

            for escrito in ["Sebas", "sebas", "SEBAS", "sEbAs"] {
                try await app.test(.GET, "users/\(escrito)", afterResponse: { res in
                    XCTAssertEqual(res.status, .ok, "no encuentra el perfil escrito «\(escrito)»")
                    XCTAssertEqual(try res.content.decode(UserResponse.self).username, "Sebas",
                                   "y devuelve el nombre REAL, no el que se tecleó")
                })
            }

            // Y no se pueden crear dos que solo difieran en mayúsculas: si se pudiera, la
            // búsqueda de arriba sería ambigua y `@sebas` no sabría a quién avisar.
            try await app.test(.POST, "users", beforeRequest: { req in
                try req.content.encode(CreateUserDTO(name: "Otro", username: "sebas",
                                                     email: "otro@example.com", password: "password123"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .conflict)
            })
        }
    }

    /// Poner una incidencia te pone la fuente en favoritas, y por tanto te llegan las
    /// respuestas.
    ///
    /// Es la mitad que faltaba: los avisos van a quien la tiene en favoritas, y reportar
    /// no lo hacía, así que quien avisaba de un fallo escribía al vacío. Pasó de verdad.
    func testReportingAFountainFollowsIt() async throws {
        try await withApp { app in
            _ = try await register(app, username: "reporta.uno")
            let tok = try await login(app, username: "reporta.uno")
            let fontID = try await createFont(app, token: tok, name: "Font seguida", lat: 41.8, long: 2.1)

            try await app.test(.GET, "fonts/\(fontID)/favorite", headers: bearer(tok), afterResponse: { res in
                XCTAssertFalse(try res.content.decode(FavoriteStatus.self).favorited,
                               "crear una fuente no la pone en favoritas; solo reportar")
            })

            try await app.test(.POST, "fonts/\(fontID)/report", headers: bearer(tok), beforeRequest: { req in
                try req.content.encode(CreateReportDTO(message: "El agua no es potable", isIncident: true, incidentKind: .other, parentID: nil))
            }, afterResponse: { res in XCTAssertEqual(res.status, .created) })

            try await app.test(.GET, "fonts/\(fontID)/favorite", headers: bearer(tok), afterResponse: { res in
                XCTAssertTrue(try res.content.decode(FavoriteStatus.self).favorited)
            })

            // Una segunda incidencia no duplica la fila: `count` es el total de gente que
            // la tiene, así que dos filas de la misma persona lo inflarían.
            try await app.test(.POST, "fonts/\(fontID)/report", headers: bearer(tok), beforeRequest: { req in
                try req.content.encode(CreateReportDTO(message: "Y además está rota", isIncident: true, incidentKind: .broken, parentID: nil))
            }, afterResponse: { res in XCTAssertEqual(res.status, .created) })

            try await app.test(.GET, "fonts/\(fontID)/favorite", headers: bearer(tok), afterResponse: { res in
                XCTAssertEqual(try res.content.decode(FavoriteStatus.self).count, 1)
            })
        }
    }

    /// Los errores llevan un **código** para que el cliente los traduzca.
    ///
    /// Lo que se prueba no es que exista el campo, sino las dos mitades del contrato:
    /// que el código llega **y** que un error sin convertir sigue funcionando sin él.
    /// Esa segunda mitad es la que permite ir convirtiéndolos poco a poco; si se
    /// rompiera, la conversión pasaría a ser todo-o-nada.
    func testErrorsCarryATranslatableCode() async throws {
        try await withApp { app in
            _ = try await register(app, username: "codigo.uno")

            struct Cuerpo: Content { let error: Bool; let reason: String; let code: String? }

            // Correo repetido: código, y la frase en castellano para quien llame a pelo.
            try await app.test(.POST, "users", beforeRequest: { req in
                try req.content.encode(CreateUserDTO(name: "Dos", username: "codigo.dos",
                                                     email: "codigo.uno@example.com", password: "password123"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .conflict)
                let c = try res.content.decode(Cuerpo.self)
                XCTAssertEqual(c.code, "user.emailTaken")
                XCTAssertFalse(c.reason.isEmpty, "la frase se queda: un código suelto no dice nada en un log")
            })

            // Nombre imposible de mencionar: su propio código.
            try await app.test(.POST, "users", beforeRequest: { req in
                try req.content.encode(CreateUserDTO(name: "Tres", username: "jose maria",
                                                     email: "tres@example.com", password: "password123"))
            }, afterResponse: { res in
                XCTAssertEqual(try res.content.decode(Cuerpo.self).code, "user.usernameChars")
            })

            // Y un error **sin convertir** sigue igual que siempre: sin `code`, con su
            // frase, y el cliente cae en ella.
            try await app.test(.GET, "zones/ranking?region=", afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
                let c = try res.content.decode(Cuerpo.self)
                XCTAssertNil(c.code)
                XCTAssertFalse(c.reason.isEmpty)
            })
        }
    }

    /// Sugerencias de `@mención`: lo que enseña y, sobre todo, lo que no.
    ///
    /// Es un listado de nombres de gente, así que lo que importa aquí no es que funcione
    /// —eso es una línea de SQL— sino las cuatro cosas que tiene que negarse a hacer.
    func testMentionSuggestions() async throws {
        try await withApp { app in
            _ = try await register(app, username: "mencion.yo")
            _ = try await register(app, username: "maria_r")
            _ = try await register(app, username: "marcos")
            let tok = try await login(app, username: "mencion.yo")

            // Sin sesión no hay directorio: los nombres se ven sobre contenido, no en
            // una lista que se recorre letra a letra.
            try await app.test(.GET, "mentions?q=ma", afterResponse: { res in
                XCTAssertEqual(res.status, .unauthorized)
            })

            try await app.test(.GET, "mentions?q=ma", headers: bearer(tok), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let out = try res.content.decode([MentionController.Suggestion].self).map(\.username)
                XCTAssertEqual(out.sorted(), ["marcos", "maria_r"])
            })

            // Una sola letra sería el censo por orden alfabético, que no sugiere nada.
            try await app.test(.GET, "mentions?q=m", headers: bearer(tok), afterResponse: { res in
                XCTAssertEqual(try res.content.decode([MentionController.Suggestion].self).count, 0)
            })

            // Nunca a ti mismo: es lo que ya hace el aviso, y ofrecerlo sería prometer
            // algo que después no pasa.
            try await app.test(.GET, "mentions?q=mencion", headers: bearer(tok), afterResponse: { res in
                XCTAssertEqual(try res.content.decode([MentionController.Suggestion].self).count, 0)
            })

            // Por delante y no por dentro: `art` no debe sacar a «marcos».
            try await app.test(.GET, "mentions?q=arc", headers: bearer(tok), afterResponse: { res in
                XCTAssertEqual(try res.content.decode([MentionController.Suggestion].self).count, 0)
            })
        }
    }

    /// Un nombre que no se puede escribir en una mención no debería poder crearse.
    ///
    /// El registro solo comprobaba la longitud, así que «jose maria» entraba. Y el daño
    /// no era no poder mencionarle: `Mentions.names(in:)` corta en el primer carácter que
    /// no vale, así que `@jose maria` menciona a `jose` — enlaza a otro perfil y, si
    /// existe, le avisa a él.
    func testRegistrationRejectsUnmentionableUsernames() async throws {
        try await withApp { app in
            try await app.test(.POST, "users", beforeRequest: { req in
                try req.content.encode(CreateUserDTO(name: "Jose Maria", username: "jose maria",
                                                     email: "jm@example.com", password: "password123"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
            })
            // La regla que hace falta que siga siendo cierta: lo válido sigue entrando.
            try await app.test(.POST, "users", beforeRequest: { req in
                try req.content.encode(CreateUserDTO(name: "Jose Maria", username: "jose_maria",
                                                     email: "jm2@example.com", password: "password123"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
            })
        }
    }

    /// El filtro por país acota **las cuatro fuentes de actividad**, no solo las altas.
    ///
    /// Se prueba porque es un fallo que no da la cara: si una de las tres consultas que
    /// cuelgan de una fuente se olvidara del país, la rejilla se llenaría de movimientos
    /// de otro continente y no saltaría ningún error — lo notaría un chileno mirando su
    /// portada, que es tarde y lejos.
    ///
    /// Y porque el país no se filtra como los demás ámbitos: la cercanía y la demarcación
    /// se resuelven a una lista de identificadores y el país va como join, así que es
    /// código aparte que ninguna otra prueba toca.
    func testActivityFiltersByCountry() async throws {
        try await withApp { app in
            let userID = try await register(app, username: "pais-user")
            try await setRole(app, userID: userID, role: .admin)   // para ver también las ediciones
            let tok = try await login(app, username: "pais-user")

            let aqui = try await createFont(app, token: tok, name: "Font d'aquí", lat: 41.8, long: 2.1)
            let alla = try await createFont(app, token: tok, name: "Fuente de allá", lat: -33.45, long: -70.65)
            for id in [aqui, alla] {
                _ = try await addComment(app, token: tok, fontID: id, body: "Mana")
                try await app.test(.POST, "fonts/\(id)/report", headers: bearer(tok), beforeRequest: { req in
                    try req.content.encode(CreateReportDTO(message: "Grifo roto", isIncident: true, incidentKind: .broken, parentID: nil))
                }, afterResponse: { res in XCTAssertEqual(res.status, .created) })
            }
            // La zona la pone `populate-regions` en producción; aquí a mano.
            for (id, pais) in [(aqui, "Spain"), (alla, "Chile")] {
                let f = try await Font.find(id, on: app.db)
                f?.country = pais
                f?.region = pais == "Spain" ? "Barcelona" : "Región Metropolitana de Santiago"
                try await f?.save(on: app.db)
            }

            try await app.test(.GET, "activity?limit=50&country=Chile", headers: bearer(tok), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let items = try res.content.decode([ActivityItem].self)
                XCTAssertFalse(items.isEmpty, "Chile tiene movimientos y deberían salir")
                // La afirmación que importa: **nada** de fuera del país, de ningún tipo.
                XCTAssertTrue(items.allSatisfy { $0.fontName == "Fuente de allá" },
                              "se ha colado algo de otro país: \(items.map(\.fontName))")
                // Y que estén los tres tipos, o el test pasaría con una sola consulta
                // acotando bien y las otras dos vacías por casualidad.
                XCTAssertTrue(items.contains { $0.kind == .fontAdded })
                XCTAssertTrue(items.contains { $0.kind == .review })
                XCTAssertTrue(items.contains { $0.kind == .report })
            })

            try await app.test(.GET, "activity?limit=50&country=Spain", headers: bearer(tok), afterResponse: { res in
                let items = try res.content.decode([ActivityItem].self)
                XCTAssertTrue(items.allSatisfy { $0.fontName == "Font d'aquí" })
            })

            // Sin país, los dos. Si no, el filtro estaría puesto siempre.
            try await app.test(.GET, "activity?limit=50", headers: bearer(tok), afterResponse: { res in
                let nombres = Set(try res.content.decode([ActivityItem].self).map(\.fontName))
                XCTAssertTrue(nombres.contains("Font d'aquí") && nombres.contains("Fuente de allá"))
            })
        }
    }

    /// Dos movimientos de la misma fuente no salen pegados mientras haya con qué
    /// separarlos.
    ///
    /// Crear una fuente y reseñarla acto seguido produce dos eventos con la misma hora,
    /// que ordenados por fecha quedan uno junto al otro y parecen un duplicado.
    func testActivityDoesNotStackSameFountain() async throws {
        try await withApp { app in
            try await register(app, username: "sep-user")
            let token = try await login(app, username: "sep-user")

            for n in 1...4 {
                let id = try await createFont(app, token: token, name: "Font sep \(n)", lat: 41.8, long: 2.1)
                _ = try await addComment(app, token: token, fontID: id, body: "Ressenya \(n)")
            }

            try await app.test(.GET, "activity?limit=20", afterResponse: { res in
                let items = try res.content.decode([ActivityItem].self)
                XCTAssertEqual(items.count, 8)
                // Arriba, que es lo que se ve, nunca hay repetición seguida.
                let cabeza = items.prefix(6)
                for (a, b) in zip(cabeza, cabeza.dropFirst()) {
                    XCTAssertNotEqual(a.fontID, b.fontID, "dos movimientos seguidos de la misma fuente")
                }
            })
        }
    }

    /// El reparto deshace las repeticiones seguidas y no pierde ni inventa nada.
    ///
    /// Puede quedar una al final: cuando ya solo restan movimientos de la misma fuente
    /// no hay nada que intercalar. Es el residuo, no un fallo — y el final de la lista
    /// es justo donde menos se mira.
    func testActivitySpreadSeparatesWhenItCan() throws {
        let a = UUID(), b = UUID(), c = UUID()
        let ahora = Date()
        // Llegan agrupados de dos en dos, que es justo el caso que se da en la vida real.
        let orden = [a, a, b, b, c, c]
        let items = orden.enumerated().map { i, id in
            ActivityItem(kind: .review, fontID: id, fontName: "F", region: nil, author: nil,
                         waterStatus: nil, text: nil, image: nil,
                         createdAt: ahora.addingTimeInterval(-Double(i)))
        }
        let salida = ActivityController.separaRepetidas(items)
        XCTAssertEqual(salida.count, items.count)
        XCTAssertEqual(Set(salida.map(\.createdAt)), Set(items.map(\.createdAt)), "no se pierde ni se duplica nada")
        let antes = zip(items, items.dropFirst()).filter { $0.fontID == $1.fontID }.count
        let despues = zip(salida, salida.dropFirst()).filter { $0.fontID == $1.fontID }.count
        XCTAssertEqual(antes, 3, "de entrada venían en parejas")
        XCTAssertLessThanOrEqual(despues, 1, "solo puede quedar el residuo del final")
        // Y ese residuo, si lo hay, está al final: en la cabeza no queda ninguna.
        let cabeza = salida.dropLast(2)
        XCTAssertEqual(zip(cabeza, cabeza.dropFirst()).filter { $0.fontID == $1.fontID }.count, 0)
    }

    /// Caso límite: si solo quedan movimientos de una misma fuente, no hay nada que meter
    /// entre medias y se devuelven tal cual. Documentado porque es el límite del método.
    func testActivitySpreadKeepsEverything() throws {
        let id = UUID()
        let ahora = Date()
        let items = (0..<3).map { i in
            ActivityItem(kind: .review, fontID: id, fontName: "F", region: nil, author: nil,
                         waterStatus: nil, text: nil, image: nil,
                         createdAt: ahora.addingTimeInterval(-Double(i)))
        }
        let salida = ActivityController.separaRepetidas(items)
        XCTAssertEqual(salida.map(\.createdAt), items.map(\.createdAt))
    }

    /// Una fuente nueva hereda país/región de la fuente clasificada más cercana, y no
    /// se inventa nada si en la zona no hay ninguna.
    func testNewFontInheritsZoneFromNearest() async throws {
        try await withApp { app in
            try await register(app, username: "zone-user")
            let token = try await login(app, username: "zone-user")

            // Vecina ya clasificada, a ~1 km.
            let neighbourID = try await createFont(app, token: token, name: "Veïna", lat: 41.800, long: 2.100)
            guard let neighbour = try await Font.find(neighbourID, on: app.db) else { return XCTFail("no trobada") }
            neighbour.country = "Spain"
            neighbour.region = "Barcelona"
            neighbour.admin1 = "ES-CT"
            try await neighbour.save(on: app.db)

            let newID = try await createFont(app, token: token, name: "Nova a prop", lat: 41.809, long: 2.100)
            var created = try await Font.find(newID, on: app.db)
            for _ in 0..<50 where created?.region == nil {
                try await Task.sleep(nanoseconds: 100_000_000)
                created = try await Font.find(newID, on: app.db)
            }
            XCTAssertEqual(created?.region, "Barcelona")
            XCTAssertEqual(created?.country, "Spain")
            XCTAssertEqual(created?.admin1, "ES-CT")

            // Lejos de todo: sin vecina clasificada, se queda sin zona (no se inventa).
            let farID = try await createFont(app, token: token, name: "Lluny", lat: -33.9, long: 151.2)
            try await Task.sleep(nanoseconds: 500_000_000)
            let far = try await Font.find(farID, on: app.db)
            XCTAssertNil(far?.region)
        }
    }

    func testCreateAllowsUnnamedButRequiresConfirmationForNearbyFountain() async throws {
        try await withApp { app in
            try await register(app, username: "anti-duplicate")
            let token = try await login(app, username: "anti-duplicate")
            struct PublicFont: Content { let id: UUID?; let name: String? }

            try await app.test(.POST, "fonts", headers: bearer(token), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: nil, latitude: 41.5, longitude: 2.5,
                                                     image: nil, description: nil, source: .mountain, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                XCTAssertNil(try res.content.decode(PublicFont.self).name)
            })

            try await app.test(.POST, "fonts", headers: bearer(token), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Massa a prop", latitude: 41.50001, longitude: 2.50001,
                                                     image: nil, description: nil, source: .tap, drinkable: nil))
            }, afterResponse: { res in XCTAssertEqual(res.status, .conflict) })

            try await app.test(.POST, "fonts", headers: bearer(token), beforeRequest: { req in
                var dto = CreateFontDTO(name: "Confirmada", latitude: 41.50001, longitude: 2.50001,
                                        image: nil, description: nil, source: .tap, drinkable: nil)
                dto.allowNearbyDuplicate = true
                try req.content.encode(dto)
            }, afterResponse: { res in XCTAssertEqual(res.status, .created) })
        }
    }

    func testThreeIndependentFlagsQuarantineWithoutStrikingAuthor() async throws {
        try await withApp { app in
            let authorID = try await register(app, username: "flag-author")
            let authorToken = try await login(app, username: "flag-author")
            let fontID = try await createFont(app, token: authorToken, name: "Sospitosa", lat: 41.2, long: 2.2)

            for i in 1...3 {
                let username = "flag-reporter-\(i)"
                try await register(app, username: username)
                let token = try await login(app, username: username)
                try await app.test(.POST, "flags", headers: bearer(token), beforeRequest: { req in
                    try req.content.encode(CreateFlagDTO(targetType: "font", targetID: fontID,
                                                        fontID: fontID, reason: "fake"))
                }, afterResponse: { res in XCTAssertEqual(res.status, .created) })
            }

            let font = try await Font.find(fontID, on: app.db)
            XCTAssertEqual(font?.moderationState, "pending")
            let author = try await User.find(authorID, on: app.db)
            let visibleCount = try await Font.visible(on: app.db).filter(\.$id == fontID).count()
            XCTAssertEqual(author?.moderationStrikes, 0)
            XCTAssertEqual(visibleCount, 0)

            let moderatorID = try await register(app, username: "flag-context-moderator")
            try await setRole(app, userID: moderatorID, role: .moderator)
            let moderatorToken = try await login(app, username: "flag-context-moderator")
            try await app.test(.GET, "flags", headers: bearer(moderatorToken), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let flags = try res.content.decode([FlagResponse].self)
                XCTAssertEqual(flags.count, 3)
                XCTAssertTrue(flags.allSatisfy { $0.targetAuthorID == authorID })
                XCTAssertTrue(flags.allSatisfy { $0.targetAuthorName == "flag-author" })
                XCTAssertTrue(flags.allSatisfy { $0.fontModerationState == "pending" })
                XCTAssertTrue(flags.allSatisfy { $0.fontLatitude == 41.2 && $0.fontLongitude == 2.2 })
            })
        }
    }

    func testModerationQueueTracksAndDismissesNewAccountSources() async throws {
        try await withApp { app in
            let authorID = try await register(app, username: "new-source-author")
            let authorToken = try await login(app, username: "new-source-author")
            let fontID = try await createFont(app, token: authorToken, name: "Per revisar", lat: 40.4, long: -3.7)

            let moderatorID = try await register(app, username: "queue-moderator")
            try await setRole(app, userID: moderatorID, role: .moderator)
            let moderatorToken = try await login(app, username: "queue-moderator")

            try await app.test(.GET, "fonts/moderation/queue", headers: bearer(authorToken), afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })
            try await app.test(.GET, "fonts/moderation/queue", headers: bearer(moderatorToken), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let queue = try res.content.decode([ModerationSourceResponse].self)
                XCTAssertEqual(queue.map(\.id), [fontID])
                XCTAssertEqual(queue.first?.authorID, authorID)
                XCTAssertEqual(queue.first?.authorName, "new-source-author")
            })

            try await app.test(.POST, "fonts/\(fontID)/moderation/review", headers: bearer(moderatorToken), afterResponse: { res in
                XCTAssertEqual(res.status, .noContent)
            })
            try await app.test(.GET, "fonts/moderation/queue", headers: bearer(moderatorToken), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertTrue(try res.content.decode([ModerationSourceResponse].self).isEmpty)
            })
        }
    }

    func testConfirmedAbuseCreatesProgressiveRestrictionAndRestoreReversesStrike() async throws {
        try await withApp { app in
            let authorID = try await register(app, username: "repeat-offender")
            let authorToken = try await login(app, username: "repeat-offender")
            let first = try await createFont(app, token: authorToken, name: "Falsa 1", lat: 40.1, long: 1.1)
            let second = try await createFont(app, token: authorToken, name: "Falsa 2", lat: 40.2, long: 1.2)
            let scored = ContributionEvent(userID: authorID, fontID: second, source: "font",
                                           subjectID: second, detail: "created", kind: "fontCreated",
                                           base: 100, multiplier: 1, gotes: 100,
                                           occurredAt: Date().addingTimeInterval(-86_400),
                                           settlesAt: Date().addingTimeInterval(-1), status: .settled)
            scored.settledAt = Date().addingTimeInterval(-1)
            try await scored.save(on: app.db)
            let moderatorID = try await register(app, username: "abuse-moderator")
            let moderator = try await User.find(moderatorID, on: app.db)!
            moderator.role = .moderator
            try await moderator.save(on: app.db)
            let moderatorToken = try await login(app, username: "abuse-moderator")

            for id in [first, second] {
                try await app.test(.POST, "fonts/\(id)/moderation/hide", headers: bearer(moderatorToken), beforeRequest: { req in
                    try req.content.encode(["reason": "fake"])
                }, afterResponse: { res in XCTAssertEqual(res.status, .ok) })
            }
            var author = try await User.find(authorID, on: app.db)
            var scoredAfter = try await ContributionEvent.find(scored.id, on: app.db)
            XCTAssertEqual(author?.moderationStrikes, 2)
            XCTAssertTrue(author?.postingIsRestricted == true)
            XCTAssertEqual(scoredAfter?.status, .void)

            // La restricción prevalece sobre acciones normales y sobre las capacidades
            // ganadas por nivel; borrar/deshacer queda fuera de esta prueba a propósito.
            try await app.test(.POST, "fonts/\(first)/comments", headers: bearer(authorToken), beforeRequest: { req in
                try req.content.encode(["body": "spam"])
            }, afterResponse: { res in XCTAssertEqual(res.status, .forbidden) })
            try await app.test(.POST, "flags", headers: bearer(authorToken), beforeRequest: { req in
                try req.content.encode(CreateFlagDTO(targetType: "font", targetID: first, fontID: first, reason: "fake"))
            }, afterResponse: { res in XCTAssertEqual(res.status, .forbidden) })
            setenv("GAMIFICATION_CAPABILITIES", "true", 1)
            setenv("GAMIFICATION_EPOCH", "2020-01-01", 1)
            defer { unsetenv("GAMIFICATION_CAPABILITIES"); unsetenv("GAMIFICATION_EPOCH") }
            let grant = try await Capabilities.of(try XCTUnwrap(author), on: app.db)
            XCTAssertTrue(grant.capabilities.isEmpty)
            XCTAssertTrue(grant.blockedBy.contains("restricted"))

            try await app.test(.DELETE, "fonts/\(second)/moderation/hide", headers: bearer(moderatorToken), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })
            author = try await User.find(authorID, on: app.db)
            scoredAfter = try await ContributionEvent.find(scored.id, on: app.db)
            XCTAssertEqual(author?.moderationStrikes, 1)
            XCTAssertFalse(author?.postingIsRestricted == true)
            XCTAssertEqual(scoredAfter?.status, .settled)
            let afterRestoreGrant = try await Capabilities.of(try XCTUnwrap(author), on: app.db)
            XCTAssertTrue(afterRestoreGrant.capabilities.isEmpty)
            XCTAssertTrue(afterRestoreGrant.blockedBy.contains("recentlyVoided"))
        }
    }

    /// El tamaño de página que pide el cliente va acotado: `?per=100000` devolvía
    /// catorce megas por una petición anónima.
    func testPageSizeIsCapped() async throws {
        try await withApp { app in
            let userID = try await register(app, username: "pager")
            let user = try await User.find(userID, on: app.db)!
            user.createdAt = Date().addingTimeInterval(-8 * 86_400)
            try await user.save(on: app.db)
            let token = try await login(app, username: "pager")
            for i in 0..<12 {
                _ = try await createFont(app, token: token, name: "Font \(i)", lat: 41.0 + Double(i) / 1000, long: 2.0)
            }
            try await app.test(.GET, "fonts?search=Font&per=100000", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let page = try res.content.decode(Page<FontJSON>.self)
                XCTAssertLessThanOrEqual(page.metadata.per, SafePage.maxPer)
            })
            // Y una búsqueda con comodines busca el carácter literal, no todo.
            try await app.test(.GET, "fonts?search=%25", afterResponse: { res in
                XCTAssertEqual(try res.content.decode(Page<FontJSON>.self).metadata.total, 0)
            })
        }
    }

    // MARK: - Misiones (fase 4)

    /// La ruta ciega propone fuentes **sin foto** y ordenadas por distancia, no por lo que
    /// valen: una lista donde la primera parada está a 300 m y la segunda a 3 km no la
    /// hace nadie.
    func testBlindRouteListsPhotolessFountainsByDistance() async throws {
        try await withApp { app in
            _ = try await register(app, username: "rutero")
            let token = try await login(app, username: "rutero")

            // Tres cerca (una con foto) y una lejos, para comprobar los dos filtros.
            let lejana = try await createFont(app, token: token, name: "Lluny", lat: 42.5, long: 2.0975)
            let cerca1 = try await createFont(app, token: token, name: "A 100 m", lat: 41.8116, long: 2.0975)
            let cerca2 = try await createFont(app, token: token, name: "A 1 km", lat: 41.8197, long: 2.0975)
            let conFoto = try await createFont(app, token: token, name: "Ja té foto", lat: 41.8125, long: 2.0975)
            if let f = try await Font.find(conFoto, on: app.db) {
                f.image = "/uploads/ya-tiene.jpg"
                try await f.save(on: app.db)
            }

            try await app.test(.GET, "missions?lat=41.8107&long=2.0975&km=4", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let m = try res.content.decode(MissionController.Response.self)
                let ids = m.photoless.map { $0.id }
                XCTAssertTrue(ids.contains(cerca1))
                XCTAssertTrue(ids.contains(cerca2))
                XCTAssertFalse(ids.contains(conFoto), "si ya tiene foto, no es una parada de la ruta ciega")
                XCTAssertFalse(ids.contains(lejana), "fuera del radio")
                XCTAssertEqual(m.photoless.map { $0.distanceKm }, m.photoless.map { $0.distanceKm }.sorted(),
                               "las paradas van por distancia")
            })
        }
    }

    /// La ronda de comprobación son fuentes que **sí tienen foto** pero que nadie mira
    /// desde hace medio año. No se solapan con la ruta ciega: repetir la misma parada en
    /// dos rutas hace que ninguna de las dos parezca seria.
    func testCheckupRoundPicksForgottenFountainsAndDoesNotRepeatTheBlindRoute() async throws {
        try await withApp { app in
            let userID = try await register(app, username: "rondador")
            let token = try await login(app, username: "rondador")
            let olvidada = try await createFont(app, token: token, name: "Oblidada", lat: 41.8116, long: 2.0975)
            _ = try await createFont(app, token: token, name: "Sense foto", lat: 41.8120, long: 2.0975)

            if let f = try await Font.find(olvidada, on: app.db) {
                f.image = "/uploads/vieja.jpg"
                try await f.save(on: app.db)
            }
            // Una reseña de hace un año. `createdAt` lo pone Fluent, así que se reescribe
            // a mano: es la única forma de tener historia antigua en un test.
            let vieja = FontComment(fontID: olvidada, userID: userID, body: "Rajava")
            try await vieja.save(on: app.db)
            vieja.createdAt = Date().addingTimeInterval(-365 * 86_400)
            try await vieja.save(on: app.db)

            try await app.test(.GET, "missions?lat=41.8107&long=2.0975&km=4", afterResponse: { res in
                let m = try res.content.decode(MissionController.Response.self)
                XCTAssertTrue(m.stale.contains { $0.id == olvidada }, "un año sin visitas es una ronda")
                XCTAssertFalse(m.photoless.contains { $0.id == olvidada }, "ya tiene foto: no va en la ruta ciega")
                let repetidas = Set(m.stale.map { $0.id }).intersection(m.photoless.map { $0.id })
                XCTAssertTrue(repetidas.isEmpty, "una parada no puede salir en las dos rutas")
            })
        }
    }

    // MARK: - Gamificación (fase 2: registro y liquidación)

    /// Lo esencial del registro: se puede volver a pasar cuantas veces haga falta sin
    /// duplicar nada. Sin esto no se podría recalcular el histórico al tocar el baremo,
    /// que es justo para lo que existe.
    func testLedgerSyncIsIdempotent() async throws {
        try await withApp { app in
            _ = try await register(app, username: "ledger1")
            let token = try await login(app, username: "ledger1")
            let fontID = try await createFont(app, token: token, name: "Font del Registre", lat: 41.8, long: 2.1)
            _ = try await addComment(app, token: token, fontID: fontID, body: "Raja bé")

            let primera = try await ContributionLedger.sync(on: app.db)
            XCTAssertGreaterThan(primera.inserted, 0)
            let total = try await ContributionEvent.query(on: app.db).count()

            let segunda = try await ContributionLedger.sync(on: app.db)
            XCTAssertEqual(segunda.inserted, 0, "la segunda pasada no puede registrar nada nuevo")
            XCTAssertEqual(segunda.alreadyKnown, primera.inserted)
            let despues = try await ContributionEvent.query(on: app.db).count()
            XCTAssertEqual(despues, total, "el número de filas no puede crecer al re-sincronizar")
        }
    }

    /// La ventana de 72 h: nada se cobra al instante. Es la pieza antifraude central —
    /// evita el grueso del problema sin tener que detectar nada.
    func testNothingSettlesBeforeSeventyTwoHours() async throws {
        try await withApp { app in
            _ = try await register(app, username: "ledger2")
            let token = try await login(app, username: "ledger2")
            let fontID = try await createFont(app, token: token, name: "Font Nova", lat: 41.81, long: 2.11)
            _ = try await addComment(app, token: token, fontID: fontID, body: "Hi ha aigua")

            // Ahora mismo: todo pendiente, marcador a cero.
            let r = try await ContributionLedger.sync(on: app.db)
            XCTAssertEqual(r.settled, 0, "recién aportado no puede estar liquidado")
            let uid = try await User.query(on: app.db).filter(\.$username == "ledger2").first()!.requireID()
            var t = try await ContributionLedger.totals(for: uid, on: app.db)
            XCTAssertEqual(t.settled, 0)
            XCTAssertGreaterThan(t.pending, 0, "las gotas en camino sí se ven")

            // Tres días después: cobra.
            let despues = Date().addingTimeInterval(ContributionLedger.settlementWindow + 60)
            let r2 = try await ContributionLedger.sync(on: app.db, now: despues)
            XCTAssertGreaterThan(r2.settled, 0)
            t = try await ContributionLedger.totals(for: uid, on: app.db)
            XCTAssertGreaterThan(t.settled, 0)
            XCTAssertEqual(t.pending, 0)
        }
    }

    /// Borrar la reseña dentro de la ventana anula la aportación: la fila se queda como
    /// rastro, pero en estado `void` y sin sumar.
    func testDeletingTheContributionVoidsItInsteadOfPaying() async throws {
        try await withApp { app in
            _ = try await register(app, username: "ledger3")
            let token = try await login(app, username: "ledger3")
            let fontID = try await createFont(app, token: token, name: "Font Efímera", lat: 41.82, long: 2.12)
            let commentID = try await addComment(app, token: token, fontID: fontID, body: "Raja")

            _ = try await ContributionLedger.sync(on: app.db)
            let antes = try await ContributionEvent.query(on: app.db)
                .filter(\.$source == "comment").count()
            XCTAssertGreaterThan(antes, 0)

            try await app.test(.DELETE, "fonts/\(fontID)/comments/\(commentID)", headers: bearer(token),
                               afterResponse: { res in XCTAssertEqual(res.status, .noContent) })

            // Aunque hayan pasado los tres días, no cobra: ya no existe.
            let despues = Date().addingTimeInterval(ContributionLedger.settlementWindow + 60)
            _ = try await ContributionLedger.sync(on: app.db, now: despues)

            let delComentario = try await ContributionEvent.query(on: app.db)
                .filter(\.$source == "comment").all()
            XCTAssertTrue(delComentario.allSatisfy { $0.status == .void },
                          "la reseña borrada no puede quedar liquidada")
            XCTAssertTrue(delComentario.allSatisfy { $0.voidReason != nil }, "y debe decir por qué")

            let uid = try await User.query(on: app.db).filter(\.$username == "ledger3").first()!.requireID()
            let eventos = try await ContributionEvent.query(on: app.db)
                .filter(\.$user.$id == uid).filter(\.$status == .settled).all()
            XCTAssertFalse(eventos.contains { $0.source == "comment" })
        }
    }

    /// El marcador del perfil solo cuenta lo liquidado. Lo pendiente se enseña aparte:
    /// «120 gotas en camino» explica la espera; 120 gotas que luego desaparecen destruyen
    /// la confianza.
    func testProfileCountsOnlySettledGotes() async throws {
        try await withApp { app in
            _ = try await register(app, username: "perfil1")
            let token = try await login(app, username: "perfil1")
            let fontID = try await createFont(app, token: token, name: "Font del Perfil", lat: 41.84, long: 2.14)
            _ = try await addComment(app, token: token, fontID: fontID, body: "Raja")
            _ = try await ContributionLedger.sync(on: app.db)

            // Recién aportado: todo en camino, nada cobrado.
            try await app.test(.GET, "gamification/me", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let p = try res.content.decode(ContributionLedger.Profile.self)
                XCTAssertEqual(p.gotes, 0)
                XCTAssertGreaterThan(p.pending, 0)
                XCTAssertTrue(p.provisional, "sin GAMIFICATION_EPOCH todo es provisional")
            })

            // Pasados los tres días, lo mismo pero ya cobrado.
            _ = try await ContributionLedger.sync(
                on: app.db, now: Date().addingTimeInterval(ContributionLedger.settlementWindow + 60))
            try await app.test(.GET, "gamification/me", headers: bearer(token), afterResponse: { res in
                let p = try res.content.decode(ContributionLedger.Profile.self)
                XCTAssertGreaterThan(p.gotes, 0)
                XCTAssertEqual(p.pending, 0)
                XCTAssertEqual(p.impact.fontsYouPutOnTheMap, 1)
                XCTAssertEqual(p.impact.fontsYouKeepFresh, 1, "su reseña es la última de esa fuente")
            })
        }
    }

    /// Solo las peticiones que salen de la bandeja offline llevan la marca. Tiene que
    /// persistir en el contenido y alimentar la insignia incluso después de resincronizar.
    func testQueuedOfflineHeaderFeedsOfflineBadge() async throws {
        try await withApp { app in
            let userID = try await register(app, username: "offlinebadge")
            let token = try await login(app, username: "offlinebadge")
            var headers = bearer(token)
            headers.add(name: "X-FontApp-Queued-Offline", value: "1")

            var fontID = UUID()
            try await app.test(.POST, "fonts", headers: headers, beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Font sense senyal", latitude: 41.9,
                                                     longitude: 2.2, image: nil, description: nil,
                                                     source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                fontID = try res.content.decode(FontJSON.self).id ?? fontID
            })
            try await app.test(.POST, "fonts/\(fontID)/comments", headers: headers, beforeRequest: { req in
                try req.content.encode(CreateCommentDTO(body: "Raja", rating: nil,
                                                        waterStatus: nil, image: nil,
                                                        confirmIfUnchanged: nil))
            }, afterResponse: { res in XCTAssertEqual(res.status, .created) })

            let storedFont = try await Font.find(fontID, on: app.db)
            let storedComment = try await FontComment.query(on: app.db)
                .filter(\.$font.$id == fontID).first()
            XCTAssertTrue(storedFont?.queuedOffline == true)
            XCTAssertTrue(storedComment?.queuedOffline == true)

            _ = try await ContributionLedger.sync(on: app.db)
            _ = try await ContributionLedger.sync(
                on: app.db, now: Date().addingTimeInterval(ContributionLedger.settlementWindow + 60))
            let profile = try await ContributionLedger.profile(for: userID, on: app.db)
            XCTAssertEqual(profile.collection.first { $0.family == "offline" }?.progress, 2)
        }
    }

    /// Apagar la gamificación devuelve 204, no un error: no es que falle, es que no hay
    /// nada que enseñar. Y las aportaciones se siguen contando por debajo.
    func testOptingOutHidesTheScoreButKeepsCounting() async throws {
        try await withApp { app in
            let userID = try await register(app, username: "perfil2")
            let token = try await login(app, username: "perfil2")
            let fontID = try await createFont(app, token: token, name: "Font Discreta", lat: 41.85, long: 2.15)
            _ = try await addComment(app, token: token, fontID: fontID, body: "Bona")
            _ = try await ContributionLedger.sync(on: app.db)

            try await app.test(.PUT, "users/\(userID)", headers: bearer(token), beforeRequest: { req in
                struct Patch: Content {
                    let name: String, username: String, email: String, gamificationOptOut: Bool
                }
                try req.content.encode(Patch(name: "Perfil", username: "perfil2",
                                             email: "perfil2@example.com", gamificationOptOut: true))
            }, afterResponse: { res in XCTAssertEqual(res.status, .ok) })

            try await app.test(.GET, "gamification/me", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .noContent)
            })

            // Pero las aportaciones siguen registradas: apagar el marcador no borra nada.
            let eventos = try await ContributionEvent.query(on: app.db)
                .filter(\.$user.$id == userID).count()
            XCTAssertGreaterThan(eventos, 0)
        }
    }

    /// Las gotas quedan congeladas con el valor del día en que se registraron. Si mañana
    /// se sube el baremo, el marcador de quien ya aportó no cambia de golpe.
    func testSettledGotesAreFrozenAgainstBaremoChanges() async throws {
        try await withApp { app in
            _ = try await register(app, username: "ledger4")
            let token = try await login(app, username: "ledger4")
            let fontID = try await createFont(app, token: token, name: "Font Congelada", lat: 41.83, long: 2.13)
            _ = try await addComment(app, token: token, fontID: fontID, body: "Bona")

            _ = try await ContributionLedger.sync(on: app.db)
            let original = try await ContributionEvent.query(on: app.db).all().map { $0.gotes }.reduce(0, +)

            // Re-sincronizar no reescribe lo ya registrado, pase lo que pase con el cálculo.
            _ = try await ContributionLedger.sync(on: app.db)
            let despues = try await ContributionEvent.query(on: app.db).all().map { $0.gotes }.reduce(0, +)
            XCTAssertEqual(original, despues)
        }
    }

    // MARK: - Capacidades por nivel (fase 6)

    /// Deja a un usuario con gotas suficientes y repartidas en días distintos, sin
    /// pasar por el baremo: aquí lo que se prueba son las **puertas**, no el cálculo.
    private func grantGotes(_ userID: UUID, _ gotes: Int, days: Int, on db: any Database,
                            status: ContributionEvent.Status = .settled,
                            voidReason: String? = nil) async throws {
        for i in 0..<days {
            let cuando = Date().addingTimeInterval(-Double(i + 1) * 86_400)
            let e = ContributionEvent()
            e.$user.id = userID
            e.source = "font"
            e.subjectID = UUID()
            e.detail = "test-\(i)"
            e.kind = ContributionScore.Kind.fontCreated.rawValue
            e.base = gotes / days
            e.multiplier = 1
            e.gotes = gotes / days
            e.status = status
            e.voidReason = voidReason
            e.occurredAt = cuando
            e.settlesAt = cuando
            e.settledAt = cuando
            try await e.save(on: db)
        }
    }

    /// El interruptor por defecto está **apagado**, y sin él ningún nivel abre nada.
    /// Es la propiedad que hace que desplegar la fase 6 no cambie nada por sí solo.
    func testCapabilitiesAreOffUntilExplicitlyEnabled() async throws {
        try await withApp { app in
            let id = try await register(app, username: "nivelazo")
            try await grantGotes(id, 100_000, days: 40, on: app.db)
            let user = try await User.find(id, on: app.db)!

            unsetenv("GAMIFICATION_CAPABILITIES")
            unsetenv("GAMIFICATION_EPOCH")
            var grant = try await Capabilities.of(user, on: app.db)
            XCTAssertTrue(grant.capabilities.isEmpty, "Apagado por defecto, ni con 100.000 gotas.")
            XCTAssertEqual(grant.blockedBy, ["disabled"])

            // Encendido pero con puntos provisionales, la regla ya no es la misma para
            // todas y es a propósito. Conceder **escritura destructiva** sobre puntos que
            // `--rescore` puede reescribir da permisos que desaparecen solos, y eso sigue
            // cerrado. Añadir una foto es aditivo y reversible: exigirle lo mismo dejaba
            // la capacidad inservible, porque la época no está puesta ni lo va a estar.
            setenv("GAMIFICATION_CAPABILITIES", "true", 1)
            grant = try await Capabilities.of(user, on: app.db)
            XCTAssertFalse(grant.capabilities.contains(.relocateAnyFont),
                           "mover el pin ajeno sigue pidiendo puntos definitivos")
            XCTAssertTrue(grant.capabilities.contains(.addSecondaryPhoto),
                          "añadir fotos no los pide: si no, no la tendría nadie nunca")
            unsetenv("GAMIFICATION_CAPABILITIES")
        }
    }

    /// Con los dos interruptores puestos, las gotas solas no bastan: hacen falta días
    /// distintos. Si no, el camino a «mover el pin de cualquiera» es una tarde intensa.
    func testCapabilityNeedsDaysAndNotJustGotes() async throws {
        try await withApp { app in
            setenv("GAMIFICATION_CAPABILITIES", "true", 1)
            setenv("GAMIFICATION_EPOCH", "2020-01-01", 1)
            defer { unsetenv("GAMIFICATION_CAPABILITIES"); unsetenv("GAMIFICATION_EPOCH") }

            let prisa = try await register(app, username: "conprisa")
            try await grantGotes(prisa, 50_000, days: 2, on: app.db)
            let rapido = try await Capabilities.of(try await User.find(prisa, on: app.db)!, on: app.db)
            XCTAssertTrue(rapido.capabilities.isEmpty)
            XCTAssertEqual(rapido.blockedBy, ["activeDays"])

            let constante = try await register(app, username: "constante")
            try await grantGotes(constante, 5_000, days: 20, on: app.db)
            let lento = try await Capabilities.of(try await User.find(constante, on: app.db)!, on: app.db)
            XCTAssertTrue(lento.capabilities.contains(.relocateAnyFont))
        }
    }

    /// Una anulación reciente por mala conducta cierra las puertas; pasarse del techo
    /// diario NO, porque eso es haber aportado mucho, no haber hecho nada malo.
    func testRecentMisconductClosesTheDoorButHittingTheDailyCapDoesNot() async throws {
        try await withApp { app in
            setenv("GAMIFICATION_CAPABILITIES", "true", 1)
            setenv("GAMIFICATION_EPOCH", "2020-01-01", 1)
            defer { unsetenv("GAMIFICATION_CAPABILITIES"); unsetenv("GAMIFICATION_EPOCH") }

            let sancionada = try await register(app, username: "denunciada")
            try await grantGotes(sancionada, 5_000, days: 20, on: app.db)
            try await grantGotes(sancionada, 10, days: 1, on: app.db, status: .void,
                                 voidReason: "contenido denunciado durante la ventana de liquidación")
            let mala = try await Capabilities.of(try await User.find(sancionada, on: app.db)!, on: app.db)
            XCTAssertEqual(mala.blockedBy, ["recentlyVoided"])

            let generosa = try await register(app, username: "generosa")
            try await grantGotes(generosa, 5_000, days: 20, on: app.db)
            try await grantGotes(generosa, 10, days: 1, on: app.db, status: .void,
                                 voidReason: "por encima del techo de 4000 gotas de ese día")
            let buena = try await Capabilities.of(try await User.find(generosa, on: app.db)!, on: app.db)
            XCTAssertTrue(buena.capabilities.contains(.relocateAnyFont),
                          "Pasarse del techo diario no es mala conducta.")
        }
    }

    /// La puerta de verdad: reubicar una fuente ajena por HTTP. Y lo que NO se abre —
    /// sustituir la foto y borrar siguen siendo del creador o de un admin.
    func testLevelLetsYouRelocateSomeoneElsesFountainButNotDeleteOrReplaceItsPhoto() async throws {
        try await withApp { app in
            setenv("GAMIFICATION_CAPABILITIES", "true", 1)
            setenv("GAMIFICATION_EPOCH", "2020-01-01", 1)
            defer { unsetenv("GAMIFICATION_CAPABILITIES"); unsetenv("GAMIFICATION_EPOCH") }

            _ = try await register(app, username: "duena")
            let tokenD = try await login(app, username: "duena")
            let fontID = try await createFont(app, token: tokenD, name: "Font aliena", lat: 41.5, long: 2.0)
            let f = try await Font.find(fontID, on: app.db)!
            f.image = "/uploads/original.jpg"
            try await f.save(on: app.db)

            let veterana = try await register(app, username: "veterana")
            let tokenV = try await login(app, username: "veterana")
            try await grantGotes(veterana, 5_000, days: 20, on: app.db)

            try await app.test(.PUT, "fonts/\(fontID)", headers: bearer(tokenV), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Font aliena", latitude: 41.6, longitude: 2.1,
                                                     image: "/uploads/suplantada.jpg", description: nil,
                                                     source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })

            let despues = try await Font.find(fontID, on: app.db)!
            XCTAssertEqual(despues.latitude, 41.6, accuracy: 0.0001, "El nivel abre mover el pin.")
            XCTAssertEqual(despues.image, "/uploads/original.jpg",
                           "Pero NO sustituir la foto: eso invita a la guerra de ediciones.")

            // Y borrar sigue cerrado.
            try await app.test(.DELETE, "fonts/\(fontID)", headers: bearer(tokenV), afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden, "Borrar no se abre por nivel: no se deshace.")
            })

            // El movimiento queda registrado y por tanto es reversible desde el panel.
            let ediciones = try await FontEdit.query(on: app.db).filter(\.$font.$id == fontID).all()
            XCTAssertEqual(ediciones.count, 1)
            XCTAssertEqual(ediciones.first?.before.latitude ?? 0, 41.5, accuracy: 0.0001)
        }
    }

    /// Quien apaga la gamificación no recibe poderes por un contador que ha pedido no
    /// tener. Y un admin los tiene por su rol, con el sistema apagado o encendido.
    func testOptedOutGetsNoPowersAndAdminsDoNotNeedThem() async throws {
        try await withApp { app in
            let id = try await register(app, username: "apagada")
            try await grantGotes(id, 50_000, days: 30, on: app.db)
            let u = try await User.find(id, on: app.db)!
            u.gamificationOptOut = true
            try await u.save(on: app.db)

            setenv("GAMIFICATION_CAPABILITIES", "true", 1)
            setenv("GAMIFICATION_EPOCH", "2020-01-01", 1)
            defer { unsetenv("GAMIFICATION_CAPABILITIES"); unsetenv("GAMIFICATION_EPOCH") }

            let grant = try await Capabilities.of(u, on: app.db)
            XCTAssertEqual(grant.blockedBy, ["optedOut"])

            let adminID = try await register(app, username: "jefa")
            let admin = try await User.find(adminID, on: app.db)!
            admin.role = .admin
            try await admin.save(on: app.db)
            unsetenv("GAMIFICATION_CAPABILITIES")
            let suyas = try await Capabilities.of(admin, on: app.db)
            XCTAssertTrue(suyas.capabilities.contains(.relocateAnyFont),
                          "El admin ya lo puede por rol; el nivel no le quita nada.")
        }
    }

    /// Los nuevos retos se reconstruyen desde el historial liquidado: una secuencia seca
    /// → incidencia → vuelve a manar, tres fuentes el mismo día y una confirmación ajena.
    /// Este caso evita que el catálogo pueda crecer mientras todos los contadores reales
    /// se quedan accidentalmente en cero.
    func testContextualBadgesProgressFromSettledHistory() async throws {
        try await withApp { app in
            let ownerID = try await register(app, username: "badgeowner")
            let explorerID = try await register(app, username: "badgeexplorer")
            let ownerToken = try await login(app, username: "badgeowner")
            let explorerToken = try await login(app, username: "badgeexplorer")

            let oldFontID = try await createFont(app, token: ownerToken, name: "Antiga", lat: 41, long: 2)
            let secondID = try await createFont(app, token: ownerToken, name: "Segona", lat: 42, long: 1)
            let thirdID = try await createFont(app, token: ownerToken, name: "Tercera", lat: 43, long: 0)
            let countries = [(oldFontID, "España"), (secondID, "Francia"), (thirdID, "Portugal")]
            for (id, country) in countries {
                let f = try await Font.find(id, on: app.db)!
                f.country = country
                f.region = country
                try await f.save(on: app.db)
            }

            let now = Date()
            let dryAt = now.addingTimeInterval(-400 * 86_400)
            let reportAt = now.addingTimeInterval(-10 * 86_400)
            let routeAt = now.addingTimeInterval(-5 * 86_400)

            let dry = FontComment(fontID: oldFontID, userID: ownerID, body: "Seca", waterStatus: "dry")
            try await dry.save(on: app.db)
            let report = FontReport(fontID: oldFontID, userID: explorerID, message: "Continua seca")
            try await report.save(on: app.db)
            let recovered = FontComment(fontID: oldFontID, userID: explorerID,
                                        body: "Torna a rajar", waterStatus: "flowing")
            try await recovered.save(on: app.db)
            let second = FontComment(fontID: secondID, userID: explorerID,
                                     body: "Comprovada", waterStatus: "flowing")
            try await second.save(on: app.db)
            let third = FontComment(fontID: thirdID, userID: explorerID,
                                    body: "Comprovada", waterStatus: "flowing")
            try await third.save(on: app.db)
            let confirmation = FontConfirmation(commentID: try dry.requireID(), userID: explorerID)
            try await confirmation.save(on: app.db)

            guard let sql = app.db as? SQLDatabase else { return XCTFail("Postgres requerido") }
            try await sql.raw("UPDATE font_comments SET created_at = \(bind: dryAt) WHERE id = \(bind: dry.requireID())").run()
            for id in [try recovered.requireID(), try second.requireID(), try third.requireID()] {
                try await sql.raw("UPDATE font_comments SET created_at = \(bind: routeAt) WHERE id = \(bind: id)").run()
            }
            try await sql.raw("UPDATE font_reports SET created_at = \(bind: reportAt) WHERE id = \(bind: report.requireID())").run()
            try await sql.raw("UPDATE font_confirmations SET created_at = \(bind: routeAt) WHERE id = \(bind: confirmation.requireID())").run()

            _ = try await ContributionLedger.sync(on: app.db, now: now)
            let profile = try await ContributionLedger.profile(for: explorerID, on: app.db, now: now)
            func slot(_ family: String) -> ContributionScore.BadgeSlot? {
                profile.collection.first { $0.family == family }
            }

            XCTAssertEqual(slot("waterRecovered")?.progress, 1)
            XCTAssertEqual(slot("waterRecovered")?.tier, "bronze")
            XCTAssertEqual(slot("routes")?.progress, 1)
            XCTAssertEqual(slot("verifier")?.progress, 1)
            XCTAssertEqual(slot("international")?.progress, 3)
            XCTAssertEqual(slot("international")?.tier, "bronze")
            XCTAssertEqual(slot("reunion")?.progress, 1)
            XCTAssertEqual(slot("incidentResolved")?.progress, 1)
            XCTAssertEqual(slot("guardianLocal")?.progress, 3)
        }
    }

    // MARK: - Zonas (fase 5)

    /// Las barras cuentan fuentes de la zona, no reseñas: una fuente muy comentada no
    /// puede inflar la cobertura de su comarca. Es el fallo clásico de un `JOIN` mal
    /// agrupado y aquí se mediría como «esta comarca tiene 12 fuentes» teniendo 3.
    func testZoneCoverageCountsFountainsAndNotReviews() async throws {
        try await withApp { app in
            _ = try await register(app, username: "zona1")
            let token = try await login(app, username: "zona1")

            let conFoto = try await createFont(app, token: token, name: "Amb foto", lat: 41.80, long: 2.10)
            let sinFoto = try await createFont(app, token: token, name: "Sense foto", lat: 41.81, long: 2.11)
            let fuera = try await createFont(app, token: token, name: "Fora de zona", lat: 40.00, long: 1.00)

            // Las tres primeras en la misma región; la de fuera, en otra.
            for id in [conFoto, sinFoto] {
                let f = try await Font.find(id, on: app.db)!
                f.region = "Osona"
                f.country = "España"
                f.admin1 = "ES-CT"
                if id == conFoto { f.image = "/uploads/x.jpg" }
                try await f.save(on: app.db)
            }
            let otra = try await Font.find(fuera, on: app.db)!
            otra.region = "Segrià"
            try await otra.save(on: app.db)

            // Cuatro reseñas sobre la MISMA fuente: no debe contar como cuatro fuentes.
            for i in 0..<4 { _ = try await addComment(app, token: token, fontID: conFoto, body: "Ressenya \(i)") }

            try await app.test(.GET, "zones", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let out = try res.content.decode(ZoneController.CoverageResponse.self)
                let osona = out.zones.first { $0.region == "Osona" }
                XCTAssertEqual(osona?.fonts, 2, "Cuatro reseñas sobre una fuente no son cuatro fuentes.")
                XCTAssertEqual(osona?.withPhoto, 1)
                XCTAssertEqual(osona?.admin1, "ES-CT")
                XCTAssertEqual(osona?.photoPct, 50)
                // Solo la reseñada cuenta como comprobada, aunque lo esté cuatro veces.
                XCTAssertEqual(osona?.checkedRecently, 1)
                XCTAssertEqual(out.zones.first { $0.region == "Segrià" }?.fonts, 1)
            })
        }
    }

    /// Quien apaga la gamificación desaparece de la tabla del mes pero **sigue contando
    /// en las barras de la zona**. El interruptor dice que oculta puntos y tablas; si
    /// apagarlo te dejara igualmente en una tabla pública, estaría mintiendo. Las barras
    /// son del territorio y no de nadie, así que ahí no aplica.
    func testOptingOutHidesYouFromTheRankingButNotFromTheZoneBars() async throws {
        try await withApp { app in
            let discreta = try await register(app, username: "discreta")
            _ = try await register(app, username: "visible")
            let tokenD = try await login(app, username: "discreta")
            let tokenV = try await login(app, username: "visible")

            let fontD = try await createFont(app, token: tokenD, name: "Font discreta", lat: 41.90, long: 2.20)
            let fontV = try await createFont(app, token: tokenV, name: "Font visible", lat: 41.91, long: 2.21)
            for id in [fontD, fontV] {
                let f = try await Font.find(id, on: app.db)!
                f.region = "Bages"
                try await f.save(on: app.db)
            }
            _ = try await ContributionLedger.sync(on: app.db, now: Date().addingTimeInterval(96 * 3_600))

            // Antes de apagarlo, las dos salen.
            try await app.test(.GET, "zones/ranking?region=Bages", afterResponse: { res in
                let r = try res.content.decode(ZoneStats.Ranking.self)
                XCTAssertEqual(Set(r.rows.map(\.username)), ["discreta", "visible"])
            })

            let u = try await User.find(discreta, on: app.db)!
            u.gamificationOptOut = true
            try await u.save(on: app.db)
            await ZoneController.cache.clear()

            try await app.test(.GET, "zones/ranking?region=Bages", afterResponse: { res in
                let r = try res.content.decode(ZoneStats.Ranking.self)
                XCTAssertEqual(r.rows.map(\.username), ["visible"], "El opt-out tiene que sacarte de la tabla.")
            })
            try await app.test(.GET, "zones", afterResponse: { res in
                let out = try res.content.decode(ZoneController.CoverageResponse.self)
                XCTAssertEqual(out.zones.first { $0.region == "Bages" }?.fonts, 2,
                               "Las barras son del territorio: el opt-out no descuenta la fuente.")
            })
        }
    }

    /// El ranking es MENSUAL: lo del mes pasado no se arrastra. Un ranking histórico lo
    /// gana para siempre quien llegó primero y a partir de ahí nadie más juega.
    func testRankingOnlyCountsTheMonthAsked() async throws {
        try await withApp { app in
            _ = try await register(app, username: "mensual")
            let token = try await login(app, username: "mensual")
            let fontID = try await createFont(app, token: token, name: "Font del mes", lat: 41.70, long: 2.05)
            let f = try await Font.find(fontID, on: app.db)!
            f.region = "Anoia"
            try await f.save(on: app.db)
            _ = try await ContributionLedger.sync(on: app.db, now: Date().addingTimeInterval(96 * 3_600))

            // Un mes en el que no hubo nada sale vacío, no con lo de este mes.
            try await app.test(.GET, "zones/ranking?region=Anoia&month=2001-01", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let r = try res.content.decode(ZoneStats.Ranking.self)
                XCTAssertEqual(r.month, "2001-01")
                XCTAssertTrue(r.rows.isEmpty)
            })
            // Y un mes ilegible es un error, no el mes en curso servido en silencio.
            try await app.test(.GET, "zones/ranking?region=Anoia&month=agosto", afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
            })
        }
    }

    // MARK: - Tu entorno (el objetivo de barrio)

    /// El objetivo de barrio se corta por **recuento y no por radio**, y ese es su motivo
    /// de existir: con un radio fijo, medido sobre la base real, a 5 km hay 53 fuentes en
    /// Castellcir y 1.482 en el centro de Barcelona, así que la barra saldría terminable
    /// en un sitio e inalcanzable en el otro — que es justo el defecto de la barra de
    /// comarca que esto viene a arreglar.
    ///
    /// Con el tope, una foto vale siempre lo mismo: 1/30, un 3 %, se viva donde se viva.
    func testLocalGoalCapsTheDenominatorSoOnePhotoAlwaysMovesTheBar() async throws {
        try await withApp { app in
            // Un sitio sin ninguna otra fixture cerca: el radio máximo son 25 km y las
            // demás pruebas siembran fuentes por todo el Principat.
            let lat = 45.0, long = 7.0
            for i in 1...40 {
                let f = Font(name: "Entorn \(i)", latitude: lat + Double(i) * 0.001, longitude: long)
                // Foto a tres de las treinta primeras y a una que se queda fuera del corte:
                // si el recuento se hiciera antes de recortar, saldrían cuatro.
                if [1, 2, 3, 35].contains(i) { f.image = "/uploads/e\(i).jpg" }
                try await f.save(on: app.db)
            }

            let out = try await ZoneStats.local(lat: lat, long: long, on: app.db)
            XCTAssertEqual(out.fonts, ZoneStats.localFonts, "Tiene que cortar en treinta, haya las que haya.")
            XCTAssertEqual(out.withPhoto, 3, "La foto de la 35ª está fuera del objetivo y no cuenta.")
            XCTAssertEqual(out.photoPct, 10)
            // La 30ª está a 0,030° ≈ 3,3 km: el radio sale del dato, no está fijado.
            XCTAssertEqual(out.radiusKm, 3.3, accuracy: 0.2)
        }
    }

    /// Las escondidas no entran. Una duplicada o una retirada ya no manda a nadie a
    /// ninguna parte: contarlas en el denominador sería pedir fotos de algo que no está.
    func testLocalGoalIgnoresHiddenFonts() async throws {
        try await withApp { app in
            let lat = 46.0, long = 8.0
            var ids: [UUID] = []
            for i in 1...5 {
                let f = Font(name: "Amagada \(i)", latitude: lat + Double(i) * 0.001, longitude: long)
                try await f.save(on: app.db)
                ids.append(try f.requireID())
            }
            let duplicada = try await Font.find(ids[0], on: app.db)!
            duplicada.$duplicateOf.id = ids[4]
            try await duplicada.save(on: app.db)
            let retirada = try await Font.find(ids[1], on: app.db)!
            retirada.retiredAt = Date()
            try await retirada.save(on: app.db)

            let out = try await ZoneStats.local(lat: lat, long: long, on: app.db)
            XCTAssertEqual(out.fonts, 3, "La duplicada y la retirada no son objetivo de nadie.")
        }
    }

    /// Cuenta **personas distintas**, no reseñas, y no le importa el interruptor de la
    /// gamificación: aquí no sale ningún nombre, solo cuántos. Es la mitad colectiva del
    /// dato — sin ella la tarjeta es otro marcador personal.
    func testLocalGoalCountsPeopleAndNotReviews() async throws {
        try await withApp { app in
            let lat = 47.0, long = 9.0
            var ids: [UUID] = []
            for i in 1...2 {
                let f = Font(name: "Veïna \(i)", latitude: lat + Double(i) * 0.001, longitude: long)
                try await f.save(on: app.db)
                ids.append(try f.requireID())
            }
            let discreta = try await register(app, username: "entorn_off")
            _ = try await register(app, username: "entorn_a")
            _ = try await register(app, username: "entorn_b")
            let u = try await User.find(discreta, on: app.db)!
            u.gamificationOptOut = true
            try await u.save(on: app.db)

            let tokenA = try await login(app, username: "entorn_a")
            let tokenB = try await login(app, username: "entorn_b")
            let tokenOff = try await login(app, username: "entorn_off")
            // Tres reseñas de la misma persona sobre las dos fuentes: sigue siendo una.
            for i in 0..<3 { _ = try await addComment(app, token: tokenA, fontID: ids[0], body: "A\(i)") }
            _ = try await addComment(app, token: tokenA, fontID: ids[1], body: "A altra")
            _ = try await addComment(app, token: tokenB, fontID: ids[0], body: "B")
            _ = try await addComment(app, token: tokenOff, fontID: ids[0], body: "Off")

            let out = try await ZoneStats.local(lat: lat, long: long, on: app.db)
            XCTAssertEqual(out.fonts, 2)
            XCTAssertEqual(out.contributors, 3,
                           "Cinco reseñas de tres personas son tres, y el opt-out no descuenta a nadie.")
            XCTAssertEqual(out.checkedRecently, 2)
            XCTAssertEqual(out.freshPct, 100)
        }
    }

    /// Las coordenadas se redondean **antes de consultar** y no solo para la clave de la
    /// caché. Las dos mitades de la regla:
    ///
    /// - Dos vecinos de la misma casilla ven el mismo objetivo, que es lo que hace que
    ///   esto sea colectivo y no un marcador que cada uno lleva encima.
    /// - Dos sitios distintos **no** se sirven el resultado del otro, que es el fallo que
    ///   aparecería si solo se redondease la clave.
    func testLocalGoalIsSharedBetweenNeighboursButNotBetweenPlaces() async throws {
        try await withApp { app in
            for i in 1...5 {
                try await Font(name: "Prop \(i)", latitude: 48.0 + Double(i) * 0.001, longitude: 10.0).save(on: app.db)
            }
            try await Font(name: "Lluny", latitude: 49.0, longitude: 11.0).save(on: app.db)

            // Cien metros de diferencia: misma casilla de 0,005°, mismo objetivo.
            let yo = try await ZoneStats.local(lat: 48.0, long: 10.0, on: app.db)
            let vecino = try await ZoneStats.local(lat: 48.0009, long: 10.0008, on: app.db)
            XCTAssertEqual(yo.fonts, 5)
            XCTAssertEqual(vecino.fonts, yo.fonts)
            XCTAssertEqual(vecino.radiusKm, yo.radiusKm, "Los vecinos tienen que ver el mismo objetivo.")

            await ZoneController.cache.clear()
            var deAqui = 0
            try await app.test(.GET, "zones/local?lat=48.0&long=10.0", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                deAqui = try res.content.decode(ZoneStats.Local.self).fonts
            })
            try await app.test(.GET, "zones/local?lat=49.0&long=11.0", afterResponse: { res in
                let otro = try res.content.decode(ZoneStats.Local.self)
                XCTAssertEqual(deAqui, 5)
                XCTAssertEqual(otro.fonts, 1, "La caché no puede servir el entorno de otro sitio.")
            })
        }
    }

    /// Sin coordenadas no hay entorno que valga: se contesta 400 en vez de inventarse un
    /// centro, que saldría como datos raros y no como un error.
    func testLocalGoalNeedsCoordinates() async throws {
        try await withApp { app in
            try await app.test(.GET, "zones/local", afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
            })
            try await app.test(.GET, "zones/local?lat=200&long=10", afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
            })
        }
    }

    // MARK: - EXIF de las fotos (solo moderación)

    /// Construye un cuerpo multipart con el fichero y los campos sueltos del EXIF.
    private func multipart(_ campos: [(String, String)], boundary: String = "----fontapptest") -> (HTTPHeaders, ByteBuffer) {
        var cuerpo = ByteBufferAllocator().buffer(capacity: 0)
        cuerpo.writeString("--\(boundary)\r\n")
        cuerpo.writeString("Content-Disposition: form-data; name=\"file\"; filename=\"f.jpg\"\r\n")
        cuerpo.writeString("Content-Type: image/jpeg\r\n\r\n")
        cuerpo.writeBytes([0xFF, 0xD8, 0xFF, 0xD9]) // JPEG mínimo: SOI + EOI
        cuerpo.writeString("\r\n")
        for (k, v) in campos {
            cuerpo.writeString("--\(boundary)\r\n")
            cuerpo.writeString("Content-Disposition: form-data; name=\"\(k)\"\r\n\r\n\(v)\r\n")
        }
        cuerpo.writeString("--\(boundary)--\r\n")
        var h = HTTPHeaders()
        h.contentType = HTTPMediaType(type: "multipart", subType: "form-data",
                                      parameters: ["boundary": boundary])
        return (h, cuerpo)
    }

    /// El EXIF viaja en campos aparte porque la compresión del cliente lo borra de la
    /// imagen, y **la fecha va como texto ISO a propósito**: el decodificador multipart de
    /// Vapor no promete ninguna estrategia para `Date`. Este test es lo que impide que
    /// alguien lo «simplifique» a `Date?` y descubra en producción que llega nulo.
    func testUploadKeepsExifAndOnlyAdminsCanReadIt() async throws {
        try await withApp { app in
            app.imageStorage = UUIDImageStorage()
            _ = try await register(app, username: "fotografa")
            let token = try await login(app, username: "fotografa")
            let adminID = try await register(app, username: "fotoadmin")
            try await makeAdmin(app, userID: adminID)
            let tokenAdmin = try await login(app, username: "fotoadmin")

            var headers = bearer(token)
            let (tipo, cuerpo) = multipart([
                ("takenAt", "2026-08-01T09:41:02Z"),
                ("latitude", "41.7466"),
                ("longitude", "2.1660"),
            ])
            tipo.forEach { headers.replaceOrAdd(name: $0.name, value: $0.value) }

            var url = ""
            try await app.test(.POST, "images", headers: headers, body: cuerpo, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                url = try res.content.decode(ImageUploadResponse.self).url
            })
            let photoID = try XCTUnwrap(PhotoExif.photoID(fromURL: url))

            // Quien no es admin no lo ve, aunque la foto la haya subido él.
            try await app.test(.GET, "images/meta?ids=\(photoID)", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden, "Las coordenadas de una foto no son públicas.")
            })

            try await app.test(.GET, "images/meta?ids=\(photoID)", headers: bearer(tokenAdmin), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let filas = try res.content.decode([ImageController.MetaResponse].self)
                XCTAssertEqual(filas.count, 1)
                XCTAssertEqual(filas.first?.latitude ?? 0, 41.7466, accuracy: 0.0001)
                let hecha = try XCTUnwrap(filas.first?.takenAt)
                XCTAssertEqual(hecha.timeIntervalSince1970,
                               ISO8601DateFormatter().date(from: "2026-08-01T09:41:02Z")!.timeIntervalSince1970,
                               accuracy: 1)
                // La otra mitad de la comparación: sin `uploadedAt` no se puede decir
                // «hecha veinte días antes de subirla», que es para lo único que sirve esto.
                XCTAssertNotNil(filas.first?.uploadedAt)
            })
        }
    }

    /// Una foto sin nada de EXIF **también deja fila**. Es lo que permite distinguir «no
    /// traía metadatos» —lo más normal: todo lo que pasa por mensajería llega limpio— de
    /// «se subió antes de que existiera esto». Sin la fila, las dos cosas se leerían igual
    /// y un moderador sacaría conclusiones de un hueco.
    func testUploadWithoutExifStillRecordsTheUploadTime() async throws {
        try await withApp { app in
            app.imageStorage = UUIDImageStorage()
            let adminID = try await register(app, username: "sinexif")
            try await makeAdmin(app, userID: adminID)
            let token = try await login(app, username: "sinexif")

            var headers = bearer(token)
            let (tipo, cuerpo) = multipart([])
            tipo.forEach { headers.replaceOrAdd(name: $0.name, value: $0.value) }

            var url = ""
            try await app.test(.POST, "images", headers: headers, body: cuerpo, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                url = try res.content.decode(ImageUploadResponse.self).url
            })
            let photoID = try XCTUnwrap(PhotoExif.photoID(fromURL: url))
            try await app.test(.GET, "images/meta?ids=\(photoID)", headers: bearer(token), afterResponse: { res in
                let filas = try res.content.decode([ImageController.MetaResponse].self)
                XCTAssertEqual(filas.count, 1, "Sin EXIF también hay fila.")
                XCTAssertNil(filas.first?.takenAt)
                XCTAssertNil(filas.first?.latitude)
                XCTAssertNotNil(filas.first?.uploadedAt)
            })
        }
    }

/// La portada de novedades enseña **lo que ha hecho la gente**, no lo que ha entrado por
    /// un importador. Al cargar el Pirineo francés entraron 11.043 fuentes de golpe y la
    /// rejilla se llenó de ellas, tapando las reseñas y las fuentes de verdad.
    ///
    /// Es el mismo criterio que el sitemap y por el mismo motivo: `created_by` nulo
    /// significa «esto lo puso una máquina».
    func testActivityHidesImportedFountainsAndHiddenOnes() async throws {
        try await withApp { app in
            _ = try await register(app, username: "novetats")
            let token = try await login(app, username: "novetats")

            // Puesta por una persona: sale.
            let dePersona = try await createFont(app, token: token, name: "Font d'algú", lat: 41.60, long: 2.10)

            // Importada: no sale, por reciente que sea.
            let importada = Font(name: "Font importada", latitude: 41.61, longitude: 2.11)
            try await importada.save(on: app.db)

            // De una persona pero escondida: tampoco.
            let escondida = try await createFont(app, token: token, name: "Font duplicada", lat: 41.62, long: 2.12)
            let e = try await Font.find(escondida, on: app.db)!
            e.$duplicateOf.id = dePersona
            try await e.save(on: app.db)

            await ActivityController.cache.clear()
            try await app.test(.GET, "activity?limit=50", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let body = res.body.string
                XCTAssertTrue(body.contains("Font d'algú"), "La que puso una persona tiene que salir.")
                XCTAssertFalse(body.contains("Font importada"), "Una importación no es actividad.")
                XCTAssertFalse(body.contains("Font duplicada"), "Una escondida no sale en novedades.")
            })
        }
    }

    /// El ascenso que aún no ha liquidado se anuncia, pero **solo a quien es**.
    ///
    /// La felicitación cuenta lo pendiente para poder celebrar en el momento; la tarjeta
    /// contaba solo lo liquidado y seguía enseñando el peldaño viejo hasta 72 h después.
    /// Hacia fuera no se adelanta nada: el perfil público sigue diciendo lo liquidado.
    func testPendingLevelIsShownToYouButNotToOthers() async throws {
        try await withApp { app in
            let id = try await register(app, username: "puja")
            let token = try await login(app, username: "puja")

            // Gotas de sobra para subir, pero sin liquidar.
            for i in 0..<40 {
                let e = ContributionEvent()
                e.$user.id = id
                e.source = "test"; e.subjectID = UUID(); e.detail = "p\(i)"
                e.kind = ContributionScore.Kind.updateReview.rawValue
                e.base = 70; e.multiplier = 1; e.gotes = 70
                e.status = .pending
                e.occurredAt = Date(); e.settlesAt = Date().addingTimeInterval(72 * 3_600)
                try await e.save(on: app.db)
            }

            let perfil = try await ContributionLedger.profile(for: id, on: app.db)
            XCTAssertEqual(perfil.gotes, 0, "Nada liquidado todavía.")
            XCTAssertGreaterThan(perfil.pending, 0)
            let enCamino = try XCTUnwrap(perfil.pendingLevel, "Con 2.800 gotas pendientes hay ascenso que anunciar.")
            XCTAssertNotEqual(enCamino, perfil.level)

            // Y el perfil público no lo adelanta.
            try await app.test(.GET, "users/puja/badges", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let body = res.body.string
                XCTAssertFalse(body.contains(enCamino),
                               "Hacia fuera solo se enseña lo liquidado.")
            })
        }
    }

    /// Con cero gotas el nivel es **Gota**, no «ninguno». La escalera empieza ahí y ahí está
    /// todo el mundo desde que se registra.
    ///
    /// Se callaba hasta tener la primera gota **liquidada**, y eso pegaba justo donde más
    /// duele: quien acaba de reseñar las tiene pendientes 72 h, así que entraba en su
    /// perfil recién estrenado y lo encontraba vacío.
    func testEveryoneStartsAtDropEvenWithNothingSettled() async throws {
        try await withApp { app in
            _ = try await register(app, username: "acabadellegar")
            try await app.test(.GET, "users/acabadellegar/badges", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let out = try res.content.decode(GamificationController.PublicBadges.self)
                XCTAssertEqual(out.level, "drop", "Cero gotas es Gota, no nada.")
                XCTAssertTrue(out.badges.isEmpty, "Pero sin insignias, que ésas sí hay que ganarlas.")
            })

            // Quien lo apaga sigue sin enseñar nivel: eso no lo cambia esto.
            let calladoID = try await register(app, username: "callado")
            let u = try await User.find(calladoID, on: app.db)!
            u.gamificationOptOut = true
            try await u.save(on: app.db)
            await GamificationController.badgeCache.clear()
            try await app.test(.GET, "users/callado/badges", afterResponse: { res in
                let out = try res.content.decode(GamificationController.PublicBadges.self)
                XCTAssertNil(out.level, "El interruptor manda por encima de todo.")
            })
        }
    }

    // MARK: - Seguir una fuente

    /// Guardar una fuente **es** seguirla: quien la tiene en favoritos recibe por la
    /// campana lo que le pase. Y la mitad que más importa — **a quien lo provoca no se le
    /// avisa de lo suyo**, que es la forma más rápida de que la campana se vuelva ruido.
    func testWatchersAreToldButNeverAboutTheirOwnDoing() async throws {
        try await withApp { app in
            let seguidoraID = try await register(app, username: "seguidora")
            _ = try await register(app, username: "passavolant")
            let tokenSeguidora = try await login(app, username: "seguidora")
            let tokenOtro = try await login(app, username: "passavolant")

            let fontID = try await createFont(app, token: tokenSeguidora, name: "Font seguida",
                                              lat: 41.55, long: 2.05)
            try await app.test(.POST, "fonts/\(fontID)/favorite", headers: bearer(tokenSeguidora),
                               afterResponse: { res in XCTAssertEqual(res.status, .ok) })

            // Lo suyo no se le avisa.
            _ = try await addComment(app, token: tokenSeguidora, fontID: fontID, body: "Hi he anat jo")
            try await esperaAvisos(app)
            var avisos = try await Notification.query(on: app.db)
                .filter(\.$user.$id == seguidoraID).filter(\.$kind == .fontUpdate).all()
            XCTAssertEqual(avisos.count, 0, "Nadie quiere que le avisen de lo que acaba de hacer.")

            // Lo de otra persona sí, y con el estado del agua dentro.
            try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(tokenOtro), beforeRequest: { req in
                try req.content.encode(["body": "Seca del tot", "waterStatus": "dry"])
            }, afterResponse: { res in XCTAssertEqual(res.status, .created) })
            try await esperaAvisos(app)
            avisos = try await Notification.query(on: app.db)
                .filter(\.$user.$id == seguidoraID).filter(\.$kind == .fontUpdate).all()
            XCTAssertEqual(avisos.count, 1)
            // Un **código**, no una frase: el servidor no sabe en qué idioma lee quien
            // mira, así que manda el hecho y el navegador pone las palabras.
            XCTAssertEqual(avisos.first?.excerpt, "review:dry")
            XCTAssertEqual(avisos.first?.fontName, "Font seguida")
        }
    }

    /// Quien no la sigue no recibe nada. Parece obvio y es justo lo que se rompe al
    /// escribir mal el filtro de la consulta de seguidores.
    func testNonWatchersGetNothing() async throws {
        try await withApp { app in
            let mironaID = try await register(app, username: "mirona")
            _ = try await register(app, username: "autora")
            let tokenAutora = try await login(app, username: "autora")

            let fontID = try await createFont(app, token: tokenAutora, name: "Font qualsevol",
                                              lat: 41.56, long: 2.06)
            _ = try await addComment(app, token: tokenAutora, fontID: fontID, body: "Raja")
            try await esperaAvisos(app)
            let avisos = try await Notification.query(on: app.db)
                .filter(\.$user.$id == mironaID).all()
            XCTAssertTrue(avisos.isEmpty, "No la sigue: no le toca ningún aviso.")
        }
    }

    /// Los avisos se mandan con `Task.detached` para no hacer esperar a quien aporta, así
    /// que el test tiene que darles un momento. Se mira la tabla en vez de dormir a ciegas.
    private func esperaAvisos(_ app: Application, _ intentos: Int = 40) async throws {
        for _ in 0..<intentos {
            try await Task.sleep(nanoseconds: 50_000_000)
            if try await Notification.query(on: app.db).filter(\.$kind == .fontUpdate).count() > 0 { return }
        }
    }

        // MARK: - Sitemap

    /// Lo que entra en el sitemap es lo que **ha tocado una persona**, y muy explícitamente
    /// **no** «lo que tiene descripción».
    ///
    /// La columna `description` la rellenan los importadores: medido sobre la base real, de
    /// 9.935 fuentes con descripción, 9.692 son la atribución («© ICGC/ACA», «Manantial
    /// (OpenStreetMap)») repetida miles de veces. Mandarle eso a un buscador es mandarle
    /// diez mil páginas idénticas, que es exactamente lo que el sitemap existe para evitar.
    /// Este test es la red: si alguien vuelve a meter `description` en la condición, salta.
    func testSitemapOnlyListsFountainsAPersonHasTouched() async throws {
        try await withApp { app in
            _ = try await register(app, username: "mapaweb")
            let token = try await login(app, username: "mapaweb")

            // Importada: sin creador, sin foto, sin reseñas… y con la descripción del
            // importador, que es la trampa.
            let importada = Font(name: "Font importada", latitude: 42.10, longitude: 1.10)
            importada.description = "© ICGC/ACA"
            try await importada.save(on: app.db)

            // Importada pero fotografiada por alguien: eso sí es mano humana.
            let conFoto = Font(name: "Font amb foto", latitude: 42.11, longitude: 1.11)
            conFoto.image = "/uploads/sitemap.jpg"
            try await conFoto.save(on: app.db)

            // Puesta por una persona, aunque esté vacía.
            let creada = try await createFont(app, token: token, name: "Font creada", lat: 42.12, long: 1.12)

            // Reseñada: la fecha de la reseña manda sobre la de creación. Se envejece la
            // fuente un año para que la diferencia sea imposible de confundir con el
            // redondeo al segundo de la serialización.
            let resenyada = Font(name: "Font ressenyada", latitude: 42.13, longitude: 1.13)
            try await resenyada.save(on: app.db)
            let resenyadaID = try resenyada.requireID()
            let haceUnAno = Date().addingTimeInterval(-365 * 86_400)
            try await (app.db as! any SQLDatabase).raw(
                "UPDATE fonts SET created_at = \(bind: haceUnAno) WHERE id = \(bind: resenyadaID)").run()
            _ = try await addComment(app, token: token, fontID: resenyadaID, body: "Raja bé")

            // Escondida y con foto: fuera. Una duplicada indexada compite con la buena.
            let escondida = Font(name: "Font duplicada", latitude: 42.14, longitude: 1.14)
            escondida.image = "/uploads/dup.jpg"
            try await escondida.save(on: app.db)
            escondida.$duplicateOf.id = try conFoto.requireID()
            try await escondida.save(on: app.db)

            try await app.test(.GET, "sitemap/fonts", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let filas = try res.content.decode([SitemapController.Entry].self)
                let ids = Set(filas.map(\.id))

                XCTAssertFalse(ids.contains(try importada.requireID()),
                               "La atribución del importador no es contenido.")
                XCTAssertTrue(ids.contains(try conFoto.requireID()))
                XCTAssertTrue(ids.contains(creada))
                XCTAssertTrue(ids.contains(resenyadaID))
                XCTAssertFalse(ids.contains(try escondida.requireID()),
                               "Una escondida no se ofrece a indexar aunque tenga foto.")

                // El `lastmod` de la reseñada es el de la RESEÑA y no el de la fuente: es
                // la fecha que le dice a un buscador que ahí hay algo nuevo que leer. La
                // fuente se creó hace un año, así que si saliera la suya se vería.
                let lastmod = try XCTUnwrap(filas.first { $0.id == resenyadaID }?.lastmod)
                XCTAssertGreaterThan(lastmod, Date().addingTimeInterval(-3_600),
                                     "Tiene que ganar la fecha de la reseña, no la de creación.")
            })
        }
    }

    // MARK: - Insignias especiales

    /// Le da a alguien `n` reseñas liquidadas, fechadas hacia atrás desde `endingAt`.
    /// La última que se crea es la más reciente, y su fecha es la que ordena la carrera.
    @discardableResult
    private func grantReviews(_ userID: UUID, _ n: Int, endingAt: Date,
                              on db: any Database) async throws -> Date {
        for i in 0..<n {
            let cuando = endingAt.addingTimeInterval(-Double(n - 1 - i) * 3_600)
            let e = ContributionEvent()
            e.$user.id = userID
            e.source = "comment"
            e.subjectID = UUID()
            e.detail = "r\(i)"
            e.kind = ContributionScore.Kind.updateReview.rawValue
            e.base = 10; e.multiplier = 1; e.gotes = 10
            e.status = .settled
            e.occurredAt = cuando
            e.settlesAt = cuando
            e.settledAt = cuando
            try await e.save(on: db)
        }
        return endingAt
    }

    /// El cupo es de verdad: la plaza 101 no existe, y la reparte quien llegó antes **por
    /// la fecha de su reseña número quince**, no por el orden en que la base devuelva las
    /// filas. Con el histórico volcado de golpe eso es lo único que distingue una carrera
    /// de un sorteo.
    func testBetatesterGoesToWhoeverGotThereFirstAndTheQuotaRunsOut() async throws {
        try await withApp { app in
            // Tres aspirantes y sitio para dos.
            let pronto = try await register(app, username: "pronto")
            let medio = try await register(app, username: "medio")
            let tarde = try await register(app, username: "tarde")
            let base = Date().addingTimeInterval(-30 * 86_400)
            // A propósito en orden inverso al de llegada: si el reparto siguiera el orden
            // de inserción, «tarde» se llevaría una plaza y el test lo vería.
            try await grantReviews(tarde, 15, endingAt: base.addingTimeInterval(3 * 86_400), on: app.db)
            try await grantReviews(medio, 15, endingAt: base.addingTimeInterval(2 * 86_400), on: app.db)
            try await grantReviews(pronto, 15, endingAt: base.addingTimeInterval(86_400), on: app.db)
            // Y alguien que se queda a una reseña: catorce no son quince.
            let casi = try await register(app, username: "casi")
            try await grantReviews(casi, 14, endingAt: base, on: app.db)

            try await SpecialBadges.award(on: app.db, limits: ["betatester": 2])

            let dadas = try await BadgeAward.query(on: app.db).filter(\.$key == "betatester").all()
            XCTAssertEqual(dadas.count, 2, "el cupo de dos no se puede sobrepasar")
            let conMedalla = Set(dadas.map { $0.$user.id })
            XCTAssertTrue(conMedalla.contains(pronto))
            XCTAssertTrue(conMedalla.contains(medio))
            XCTAssertFalse(conMedalla.contains(tarde), "llegó el tercero y solo había dos plazas")
            XCTAssertFalse(conMedalla.contains(casi), "con catorce reseñas no se entra")

            // Idempotente: repetir el barrido no reparte de nuevo ni duplica.
            try await SpecialBadges.award(on: app.db, limits: ["betatester": 2])
            let otraVez = try await BadgeAward.query(on: app.db).filter(\.$key == "betatester").count()
            XCTAssertEqual(otraVez, 2)
        }
    }

    /// Catalunya pide las cuatro demarcaciones, acepta las dos grafías (producción dice
    /// «Girona» y una base repoblada con Natural Earth dice «Gerona») y **sobrevive a
    /// `--rescore`**, que es la mitad del sentido de guardarlas.
/// La insignia de Catalunya premia **haber recorrido el país**, así que solo cuentan las
    /// aportaciones que prueban que estuviste delante de la fuente.
    ///
    /// Rellenar un campo es edición estilo wiki y mover el pin se hace con la ortofoto: las
    /// dos se pueden hacer sobre una fuente de Tarragona desde el sofá de Castellcir. Con
    /// ellas dentro, la insignia decía una cosa y medía otra — y el más expuesto era
    /// justamente quien tiene el panel de administración.
/// «Demarcaciones» premia haber recorrido territorio, así que tampoco se gana desde el
    /// sofá: rellenar la descripción de una fuente de Cádiz no es haber estado en Cádiz.
    ///
    /// Es la misma regla que Catalunya y **sale de la misma lista** (`Kind.provesPresence`),
    /// para que añadir un tipo de aportación nuevo obligue a responder la pregunta una vez
    /// y no tres.
    func testRegionBadgesOnlyCountPlacesYouActuallyVisited() async throws {
        try await withApp { app in
            let id = try await register(app, username: "sofa")
            let token = try await login(app, username: "sofa")

            func aporta(_ region: String, _ kind: ContributionScore.Kind, i: Int) async throws {
                let fontID = try await createFont(app, token: token, name: "\(region)-\(i)",
                                                  lat: 38.0 + Double(i), long: -3.0)
                let f = try await Font.find(fontID, on: app.db)!
                f.country = "Spain"; f.region = region
                try await f.save(on: app.db)
                let e = ContributionEvent()
                e.$user.id = id
                e.$font.id = fontID
                e.source = "test"; e.subjectID = UUID(); e.detail = region
                e.kind = kind.rawValue
                e.base = 10; e.multiplier = 1; e.gotes = 10
                e.status = .settled
                let cuando = Date().addingTimeInterval(-Double(20 - i) * 86_400)
                e.occurredAt = cuando; e.settlesAt = cuando; e.settledAt = cuando
                try await e.save(on: app.db)
            }

            // Tres demarcaciones, pero dos de ellas tocadas desde casa.
            try await aporta("Barcelona", .firstReview, i: 0)
            try await aporta("Bizkaia", .fieldCompleted, i: 1)
            try await aporta("Cádiz", .relocation, i: 2)

            var perfil = try await ContributionLedger.profile(for: id, on: app.db)
            XCTAssertNil(perfil.badges.first { $0.family == "regions" },
                         "Rellenar un campo y mover un pin no son dos viajes.")

            // Las mismas dos, ahora pisadas de verdad.
            try await aporta("Bizkaia", .firstPhoto, i: 3)
            try await aporta("Cádiz", .updateReview, i: 4)
            perfil = try await ContributionLedger.profile(for: id, on: app.db)
            XCTAssertEqual(perfil.badges.first { $0.family == "regions" }?.tier, "bronze",
                           "Con tres demarcaciones pisadas, la medalla es suya.")
        }
    }

        func testCataloniaIgnoresContributionsYouCanMakeFromHome() async throws {
        try await withApp { app in
            let id = try await register(app, username: "desdecasa")
            let user = try await User.find(id, on: app.db)!
            user.createdAt = Date().addingTimeInterval(-8 * 86_400)
            try await user.save(on: app.db)
            let token = try await login(app, username: "desdecasa")

            /// Coloca una aportación del tipo pedido sobre una fuente de esa demarcación.
            /// (Un grado de separación: `inheritZone` pisa la zona si están cerca.)
            func aporta(_ region: String, _ kind: ContributionScore.Kind, i: Int) async throws {
                let fontID = try await createFont(app, token: token, name: "\(region)-\(kind.rawValue)",
                                                  lat: 41.0 + Double(i), long: 2.0)
                let f = try await Font.find(fontID, on: app.db)!
                f.country = "Spain"; f.region = region
                try await f.save(on: app.db)
                let e = ContributionEvent()
                e.$user.id = id
                e.$font.id = fontID
                e.source = "test"; e.subjectID = UUID(); e.detail = region
                e.kind = kind.rawValue
                e.base = 10; e.multiplier = 1; e.gotes = 10
                e.status = .settled
                let cuando = Date().addingTimeInterval(-Double(20 - i) * 86_400)
                e.occurredAt = cuando; e.settlesAt = cuando; e.settledAt = cuando
                try await e.save(on: app.db)
            }

            // Tres pisadas de verdad y la cuarta desde casa.
            try await aporta("Barcelona", .firstReview, i: 0)
            try await aporta("Girona", .firstPhoto, i: 1)
            try await aporta("Lleida", .fontCreated, i: 2)
            try await aporta("Tarragona", .fieldCompleted, i: 3)

            try await SpecialBadges.award(on: app.db)
            var dadas = try await BadgeAward.query(on: app.db).filter(\.$key == "catalonia").count()
            XCTAssertEqual(dadas, 0, "Rellenar un campo no es haber ido a Tarragona.")

            // Mover el pin tampoco: se hace con la ortofoto.
            try await aporta("Tarragona", .relocation, i: 4)
            try await SpecialBadges.award(on: app.db)
            dadas = try await BadgeAward.query(on: app.db).filter(\.$key == "catalonia").count()
            XCTAssertEqual(dadas, 0, "Mover el pin tampoco prueba que estuvieras allí.")

            // Con una reseña en Tarragona, ahora sí.
            try await aporta("Tarragona", .updateReview, i: 5)
            try await SpecialBadges.award(on: app.db)
            dadas = try await BadgeAward.query(on: app.db).filter(\.$key == "catalonia").count()
            XCTAssertEqual(dadas, 1, "Con las cuatro pisadas de verdad, se gana.")
        }
    }

        func testCataloniaBadgeNeedsAllFourAndSurvivesARescore() async throws {
        try await withApp { app in
            let id = try await register(app, username: "quatre")
            let token = try await login(app, username: "quatre")

            // Las fuentes van **muy separadas** (un grado de latitud, ~111 km) y no es
            // decoración: al crear una fuente, `FontController.inheritZone` le copia en
            // segundo plano la zona de la clasificada más cercana si la hay a menos de
            // 55 km. Con las cuatro juntas, la segunda heredaba «Barcelona» por encima de
            // lo que escribe el test y la insignia no se ganaba nunca — costó un rato.
            // Tres demarcaciones: todavía no.
            for (i, region) in ["Barcelona", "Gerona", "Tarragona"].enumerated() {
                let fontID = try await createFont(app, token: token, name: "F\(i)",
                                                  lat: 41.5 + Double(i), long: 2.0)
                let f = try await Font.find(fontID, on: app.db)!
                f.country = "Spain"; f.region = region
                try await f.save(on: app.db)
                try await grantReviews(id, 1, endingAt: Date().addingTimeInterval(-Double(10 - i) * 86_400),
                                       on: app.db)
                // La reseña tiene que colgar de esa fuente para que cuente la región.
                let ultimo = try await ContributionEvent.query(on: app.db)
                    .filter(\.$user.$id == id).sort(\.$occurredAt, .descending).first()!
                ultimo.$font.id = fontID
                try await ultimo.save(on: app.db)
            }
            try await SpecialBadges.award(on: app.db)
            let conTres = try await BadgeAward.query(on: app.db).filter(\.$key == "catalonia").count()
            XCTAssertEqual(conTres, 0, "con tres demarcaciones no se gana")

            // La cuarta, con la grafía catalana. Debe unificarse con «Lérida».
            let fontID = try await createFont(app, token: token, name: "F4", lat: 44.9, long: 2.0)
            let f = try await Font.find(fontID, on: app.db)!
            f.country = "Spain"; f.region = "Lleida"
            try await f.save(on: app.db)
            try await grantReviews(id, 1, endingAt: Date().addingTimeInterval(-86_400), on: app.db)
            let ultimo = try await ContributionEvent.query(on: app.db)
                .filter(\.$user.$id == id).sort(\.$occurredAt, .descending).first()!
            ultimo.$font.id = fontID
            try await ultimo.save(on: app.db)

            try await SpecialBadges.award(on: app.db)
            let ganada = try await BadgeAward.query(on: app.db)
                .filter(\.$key == "catalonia").filter(\.$user.$id == id).first()
            XCTAssertNotNil(ganada, "las cuatro demarcaciones dan la insignia")

            // Y ahora lo que de verdad las separa de las otras 21: reconstruir el
            // histórico borra las gotas y **no** la medalla.
            _ = try await ContributionLedger.rescore(on: app.db)
            let sigue = try await BadgeAward.query(on: app.db)
                .filter(\.$key == "catalonia").filter(\.$user.$id == id).first()
            XCTAssertNotNil(sigue, "--rescore no puede quitar una insignia ya concedida")

            // Y sale en el perfil público, junto a las normales y marcada como especial.
            try await app.test(.GET, "users/quatre/badges", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let body = res.body.string
                XCTAssertTrue(body.contains("catalonia"), body)
                XCTAssertTrue(body.contains("special"), body)
            })
        }
    }

    // MARK: - Fuentes que cuidas

    /// Cuidas una fuente si **tu reseña es la última**, y deja de ser tuya en cuanto otra
    /// persona reseña después. No es propiedad, es relevo.
    func testYouLookAfterAFountainUntilSomeoneElseReviewsIt() async throws {
        try await withApp { app in
            let a = try await register(app, username: "cuidadora")
            let tokA = try await login(app, username: "cuidadora")
            _ = try await register(app, username: "relevo")
            let tokB = try await login(app, username: "relevo")
            let fontID = try await createFont(app, token: tokA, name: "Font del relleu", lat: 41.5, long: 2.0)

            try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(tokA), beforeRequest: { req in
                try req.content.encode(["body": "mana", "waterStatus": "flowing"])
            }, afterResponse: { _ in })

            var mias = try await Guardianship.of(a, on: app.db)
            XCTAssertEqual(mias.map(\.fontID), [fontID])
            XCTAssertFalse(mias[0].stale, "recién reseñada no está vieja")

            // Otra persona reseña después: el relevo cambia de manos.
            try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(tokB), beforeRequest: { req in
                try req.content.encode(["body": "sigue manando", "waterStatus": "flowing"])
            }, afterResponse: { _ in })

            mias = try await Guardianship.of(a, on: app.db)
            XCTAssertTrue(mias.isEmpty, "ya no la cuida quien reseñó primero")
        }
    }

    /// Una fuente escondida deja de contar como cuidada: recordarte que la revises sería
    /// trabajo inventado, porque ya no manda a nadie a ninguna parte.
    func testHiddenFountainsAreNotGuarded() async throws {
        try await withApp { app in
            let a = try await register(app, username: "cuidaesconde")
            let tok = try await login(app, username: "cuidaesconde")
            let fontID = try await createFont(app, token: tok, name: "Font retirada", lat: 41.5, long: 2.0)
            try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(tok), beforeRequest: { req in
                try req.content.encode(["body": "mana", "waterStatus": "flowing"])
            }, afterResponse: { _ in })
            let antes = try await Guardianship.of(a, on: app.db)
            XCTAssertEqual(antes.count, 1)

            let f = try await Font.find(fontID, on: app.db)!
            f.retiredAt = Date()
            try await f.save(on: app.db)
            let despues = try await Guardianship.of(a, on: app.db)
            XCTAssertTrue(despues.isEmpty)
        }
    }

    /// El recordatorio llega **una sola vez** aunque el barrido pase cada media hora, y no
    /// llega si no hay nada olvidado.
    ///
    /// Sin el cerrojo de reincidencia esto sería un aviso cada treinta minutos, que es
    /// exactamente cómo se enseña a la gente a no mirar nunca la campana.
    func testStaleGuardedRemindsOnceAndOnlyWhenThereIsSomething() async throws {
        try await withApp { app in
            let a = try await register(app, username: "olvidadiza")
            let tok = try await login(app, username: "olvidadiza")
            let fontID = try await createFont(app, token: tok, name: "Font oblidada", lat: 41.5, long: 2.0)
            try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(tok), beforeRequest: { req in
                try req.content.encode(["body": "mana", "waterStatus": "flowing"])
            }, afterResponse: { _ in })

            // Recién comprobada: no hay nada que recordar.
            var n = try await StaleGuardedNotifier.run(on: app.db)
            XCTAssertEqual(n, 0, "una fuente al día no genera aviso")

            // La envejecemos.
            let c = try await FontComment.query(on: app.db).filter(\.$font.$id == fontID).first()!
            c.createdAt = Date().addingTimeInterval(-200 * 86_400)
            try await c.save(on: app.db)

            n = try await StaleGuardedNotifier.run(on: app.db)
            XCTAssertEqual(n, 1)
            // Y repetir el barrido no vuelve a avisar.
            n = try await StaleGuardedNotifier.run(on: app.db)
            XCTAssertEqual(n, 0, "el mismo aviso no se repite dentro de la ventana")

            let avisos = try await Notification.query(on: app.db)
                .filter(\.$user.$id == a).filter(\.$kind == .staleGuarded).all()
            XCTAssertEqual(avisos.count, 1)
            XCTAssertEqual(avisos[0].fontName, "Font oblidada")
            // Las cifras viajan crudas para que el idioma lo ponga el navegador.
            XCTAssertTrue(avisos[0].excerpt.hasPrefix("1|0|"), avisos[0].excerpt)
        }
    }

    // MARK: - Fugas y promesas que ahora ve gente de verdad

    /// El hash de la contraseña no sale por ninguna de las rutas que devuelven usuarios.
    ///
    /// `User` no es `Content` justamente para que esto no pueda pasar, pero la protección
    /// depende de que nadie devuelva el modelo por descuido, y eso no lo impide el
    /// compilador. Es la fuga más cara que puede tener esta app y no había test.
    func testPasswordHashNeverLeaves() async throws {
        try await withApp { app in
            let id = try await register(app, username: "secreta")
            let token = try await login(app, username: "secreta")
            let fontID = try await createFont(app, token: token, name: "Font", lat: 41.5, long: 2.0)
            try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(token), beforeRequest: { req in
                try req.content.encode(["body": "hola", "waterStatus": "flowing"])
            }, afterResponse: { _ in })

            let rutas = ["users/\(id)", "users/secreta", "users/secreta/badges",
                         "users/\(id)/fonts", "fonts/\(fontID)/comments", "fonts/\(fontID)"]
            for ruta in rutas {
                try await app.test(.GET, ruta, headers: bearer(token), afterResponse: { res in
                    let body = res.body.string
                    XCTAssertFalse(body.contains("passwordHash"), "\(ruta) publica el hash")
                    XCTAssertFalse(body.contains("password_hash"), "\(ruta) publica el hash")
                    XCTAssertFalse(body.contains("$2b$"), "\(ruta) publica un hash de bcrypt")
                })
            }
            // Y en la respuesta propia, que sí lleva email y preferencias, tampoco.
            try await app.test(.GET, "auth/me", headers: bearer(token), afterResponse: { res in
                XCTAssertFalse(res.body.string.contains("$2b$"))
            })
        }
    }

    /// El techo diario se aplica de verdad: nadie liquida más de `dailyCap` en un día.
    ///
    /// Es la defensa contra el guion que da de alta doscientas fuentes en una tarde, y
    /// hasta ahora no la probaba nada. Se comprueba el invariante —lo liquidado de un día
    /// nunca pasa del techo— y no un número concreto, porque los multiplicadores del
    /// baremo cambian el total y la promesa es el tope, no la cifra.
    func testDailyCapIsEnforced() async throws {
        try await withApp { app in
            let id = try await register(app, username: "maquina")
            // Directas a la BD y no por HTTP: la ruta de crear tiene su propio límite de
            // 30/hora, que es otra defensa distinta. Aquí se prueba el techo de gotas.
            let dia = Date().addingTimeInterval(-10 * 86_400)
            for i in 0..<60 {
                let f = Font(name: "Massiva \(i)", latitude: 41.0 + Double(i) / 1000, longitude: 2.0,
                             creatorID: id)
                try await f.create(on: app.db)
                f.createdAt = dia
                try await f.save(on: app.db)
            }

            _ = try await ContributionLedger.sync(on: app.db, now: dia.addingTimeInterval(96 * 3_600))

            let liquidadas = try await ContributionEvent.query(on: app.db)
                .filter(\.$user.$id == id).filter(\.$status == .settled).all()
            let total = liquidadas.reduce(0) { $0 + $1.gotes }
            XCTAssertGreaterThan(total, 0, "algo tiene que cobrar")
            XCTAssertLessThanOrEqual(total, ContributionLedger.dailyCap,
                                     "se ha liquidado más del techo de un solo día")

            let porTecho = try await ContributionEvent.query(on: app.db)
                .filter(\.$user.$id == id).filter(\.$status == .void).all()
                .filter { $0.voidReason?.contains("techo") == true }
            XCTAssertFalse(porTecho.isEmpty, "lo que pasa del techo tiene que quedar anulado y dicho")
        }
    }

    /// `--rescore` **no toca** lo posterior a la época.
    ///
    /// Es la promesa que se le hizo a los usuarios al fijar `GAMIFICATION_EPOCH`: a partir
    /// de esa fecha tus gotas no se mueven aunque se recalibre el baremo. Hasta ahora solo
    /// estaba probado que sobrevivían las insignias especiales, que van en otra tabla.
    func testRescoreLeavesEverythingAfterTheEpochAlone() async throws {
        try await withApp { app in
            let id = try await register(app, username: "congelada")
            let vieja = Date().addingTimeInterval(-40 * 86_400)
            let nueva = Date().addingTimeInterval(-5 * 86_400)
            for (i, cuando) in [vieja, nueva].enumerated() {
                let f = Font(name: "F\(i)", latitude: 41.0 + Double(i), longitude: 2.0, creatorID: id)
                try await f.create(on: app.db)
                f.createdAt = cuando
                try await f.save(on: app.db)
            }
            _ = try await ContributionLedger.sync(on: app.db, now: Date())

            let antes = try await ContributionEvent.query(on: app.db).filter(\.$user.$id == id).all()
            XCTAssertEqual(antes.count, 2)
            let idProtegida = antes.first { $0.occurredAt > vieja.addingTimeInterval(86_400) }?.id
            let idBorrable = antes.first { $0.occurredAt < vieja.addingTimeInterval(86_400) }?.id
            XCTAssertNotNil(idProtegida); XCTAssertNotNil(idBorrable)

            // Línea entre las dos.
            let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: "UTC")
            setenv("GAMIFICATION_EPOCH", f.string(from: Date().addingTimeInterval(-20 * 86_400)), 1)
            defer { unsetenv("GAMIFICATION_EPOCH") }

            let r = try await ContributionLedger.rescore(on: app.db)
            XCTAssertEqual(r.protected, 1)
            XCTAssertEqual(r.deleted, 1)

            let despues = try await ContributionEvent.query(on: app.db).filter(\.$user.$id == id).all()
            // La misma fila, no una reconstruida: mismo id.
            XCTAssertTrue(despues.contains { $0.id == idProtegida },
                          "la aportación posterior a la época tiene que ser LA MISMA fila")
            XCTAssertFalse(despues.contains { $0.id == idBorrable },
                           "la anterior sí se reconstruye")
        }
    }

    /// Una fuente escondida tampoco sale por cercanía ni en las rutas propuestas.
    ///
    /// El listado y el mapa ya estaban probados. Éstas dos son las que de verdad mandan a
    /// alguien a caminar: «la más cercana» y «una vuelta por aquí».
    func testHiddenFountainsStayOutOfNearbyAndRoutes() async throws {
        try await withApp { app in
            let id = try await register(app, username: "caminante")
            let token = try await login(app, username: "caminante")
            let buena = try await createFont(app, token: token, name: "Font bona", lat: 41.800, long: 2.100)
            let mala = try await createFont(app, token: token, name: "Font repetida", lat: 41.801, long: 2.101)
            let ida = try await createFont(app, token: token, name: "Font que ja no hi és", lat: 41.802, long: 2.102)

            let f1 = try await Font.find(mala, on: app.db)!
            f1.$duplicateOf.id = buena
            try await f1.save(on: app.db)
            let f2 = try await Font.find(ida, on: app.db)!
            f2.retiredAt = Date()
            try await f2.save(on: app.db)
            _ = id

            try await app.test(.GET, "fonts/near?lat=41.8&long=2.1&quantity=50", afterResponse: { res in
                let cuerpo = res.body.string
                XCTAssertTrue(cuerpo.contains("Font bona"))
                XCTAssertFalse(cuerpo.contains("Font repetida"), "una duplicada no es «la más cercana»")
                XCTAssertFalse(cuerpo.contains("ja no hi és"), "una retirada no es «la más cercana»")
            })
            try await app.test(.GET, "missions?lat=41.8&long=2.1&km=5", afterResponse: { res in
                let cuerpo = res.body.string
                XCTAssertFalse(cuerpo.contains("Font repetida"), "una duplicada no es una parada")
                XCTAssertFalse(cuerpo.contains("ja no hi és"), "una retirada no es una parada")
            })
        }
    }

    // MARK: - Esconder fuentes (duplicadas y retiradas)

    /// Marcar una duplicada la saca del mapa, del listado y de la cercanía **sin
    /// borrarla**, y se puede deshacer.
    ///
    /// Lo que de verdad prueba este test es el filtro: si una escondida se cuela en
    /// cualquier lectura pública, la app manda a alguien a caminar hasta un punto que no
    /// debería estar ahí, que es exactamente lo que viene a evitar.
    func testDuplicateIsHiddenEverywhereButStillReachableByLink() async throws {
        try await withApp { app in
            let id = try await register(app, username: "duplicadora")
            let token = try await login(app, username: "duplicadora")
            try await grantGotes(id, 100_000, days: 40, on: app.db)
            // Las dos que esconden un punto exigen puntos definitivos, así que hace falta
            // también la época: es la mitad de la regla que fija `requiresDefinitivePoints`.
            setenv("GAMIFICATION_CAPABILITIES", "true", 1)
            setenv("GAMIFICATION_EPOCH", "2020-01-01", 1)
            defer { unsetenv("GAMIFICATION_CAPABILITIES"); unsetenv("GAMIFICATION_EPOCH") }

            let buena = try await createFont(app, token: token, name: "Font bona", lat: 41.80, long: 2.10)
            let mala = try await createFont(app, token: token, name: "Font repetida", lat: 41.8001, long: 2.1001)

            try await app.test(.POST, "fonts/\(mala)/duplicate-of", headers: bearer(token), beforeRequest: { req in
                try req.content.encode(["of": buena.uuidString])
            }, afterResponse: { res in XCTAssertEqual(res.status, .ok) })

            // Fuera del listado…
            try await app.test(.GET, "fonts?search=Font&per=100", afterResponse: { res in
                let p = try res.content.decode(Page<FontJSON>.self)
                XCTAssertTrue(p.items.contains { $0.id == buena })
                XCTAssertFalse(p.items.contains { $0.id == mala }, "la duplicada no sale en el listado")
            })
            // …y fuera del mapa.
            try await app.test(.GET, "fonts/in-bounds?minLat=41.7&maxLat=41.9&minLong=2.0&maxLong=2.2", afterResponse: { res in
                let body = res.body.string
                XCTAssertTrue(body.contains(buena.uuidString.lowercased()) || body.contains(buena.uuidString))
                XCTAssertFalse(body.contains(mala.uuidString.lowercased()) || body.contains(mala.uuidString),
                               "la duplicada no sale en el mapa")
            })
            // Pero por enlace directo se sigue viendo, y dice de quién es duplicada.
            try await app.test(.GET, "fonts/\(mala)", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertTrue(res.body.string.contains("duplicateOf"), res.body.string)
            })
            // Y no se ha borrado nada.
            let sigue = try await Font.find(mala, on: app.db)
            XCTAssertNotNil(sigue)

            // Deshacer: vuelve al mapa.
            try await app.test(.DELETE, "fonts/\(mala)/duplicate-of", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })
            try await app.test(.GET, "fonts?search=Font&per=100", afterResponse: { res in
                let p = try res.content.decode(Page<FontJSON>.self)
                XCTAssertTrue(p.items.contains { $0.id == mala }, "al deshacerlo vuelve")
            })
        }
    }

    /// Retirar exige, además del nivel, dos testimonios `gone` de personas distintas.
    ///
    /// Es la única de estas acciones que hace desaparecer un punto para todo el mundo, y
    /// no debería poder hacerla sola una persona que se haya equivocado o tenga prisa.
    func testRetiringNeedsTwoIndependentWitnesses() async throws {
        try await withApp { app in
            let id = try await register(app, username: "retiradora")
            let token = try await login(app, username: "retiradora")
            try await grantGotes(id, 100_000, days: 40, on: app.db)
            setenv("GAMIFICATION_CAPABILITIES", "true", 1)
            setenv("GAMIFICATION_EPOCH", "2020-01-01", 1)
            defer { unsetenv("GAMIFICATION_CAPABILITIES"); unsetenv("GAMIFICATION_EPOCH") }

            let fontID = try await createFont(app, token: token, name: "Font que ja no hi és", lat: 41.5, long: 2.0)

            // Sin testigos: no.
            try await app.test(.POST, "fonts/\(fontID)/retire", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
            })

            // Un solo testigo tampoco: la misma persona no cuenta dos veces.
            try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(token), beforeRequest: { req in
                try req.content.encode(["body": "ya no está", "waterStatus": "gone"])
            }, afterResponse: { res in XCTAssertEqual(res.status, .created) })
            try await app.test(.POST, "fonts/\(fontID)/retire", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest, "una sola persona no basta")
            })

            // Con una segunda persona, sí.
            _ = try await register(app, username: "testiga")
            let token2 = try await login(app, username: "testiga")
            try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(token2), beforeRequest: { req in
                try req.content.encode(["body": "confirmo, no existe", "waterStatus": "gone"])
            }, afterResponse: { res in XCTAssertEqual(res.status, .created) })
            try await app.test(.POST, "fonts/\(fontID)/retire", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })

            try await app.test(.GET, "fonts?search=Font&per=100", afterResponse: { res in
                let p = try res.content.decode(Page<FontJSON>.self)
                XCTAssertFalse(p.items.contains { $0.id == fontID }, "una fuente retirada no sale")
            })
        }
    }

    /// El historial de una fuente lo abre el nivel 4; sin él, no.
    func testFontHistoryOpensAtItsLevel() async throws {
        try await withApp { app in
            let id = try await register(app, username: "curiosa")
            let token = try await login(app, username: "curiosa")
            let fontID = try await createFont(app, token: token, name: "Font", lat: 41.5, long: 2.0)

            // Sin capacidades encendidas no lo ve nadie que no sea admin.
            try await app.test(.GET, "fonts/\(fontID)/history", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })

            try await grantGotes(id, 100_000, days: 40, on: app.db)
            setenv("GAMIFICATION_CAPABILITIES", "true", 1)
            defer { unsetenv("GAMIFICATION_CAPABILITIES") }
            try await app.test(.GET, "fonts/\(fontID)/history", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })
        }
    }

    /// Una reseña que dice que vuelve a manar cierra sola las incidencias abiertas.
    ///
    /// El sistema ya deducía esto para pagar la insignia «Incidencia resuelta» y no hacía
    /// nada con ello: la ficha seguía avisando de una avería que ya no existía hasta que
    /// alguien con nivel pulsara un botón. Se cierra al publicar y no al liquidar, porque
    /// aquí no se paga nada — se dice si hay agua, y eso caduca deprisa.
    func testAFlowingReviewClosesOpenIncidentsByItself() async throws {
        try await withApp { app in
            let token = try await login(app, username: try await nombreDe(app, "avisador"))
            let fontID = try await createFont(app, token: token, name: "Font seca", lat: 41.8, long: 2.1)

            try await app.test(.POST, "fonts/\(fontID)/report", headers: bearer(token), beforeRequest: { req in
                try req.content.encode(CreateReportDTO(message: "Está seca desde julio", isIncident: true, incidentKind: .dry, parentID: nil))
            }, afterResponse: { res in XCTAssertEqual(res.status, .created) })

            // Una reseña que NO dice que mana no cierra nada.
            try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(token), beforeRequest: { req in
                try req.content.encode(["body": "sigue igual", "waterStatus": "dry"])
            }, afterResponse: { res in XCTAssertEqual(res.status, .created) })
            var abiertas = try await FontReport.query(on: app.db)
                .filter(\.$font.$id == fontID).filter(\.$resolvedAt == nil).count()
            XCTAssertEqual(abiertas, 1, "«seca» no cierra una incidencia de fuente seca")

            // Una que sí, la cierra.
            try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(token), beforeRequest: { req in
                try req.content.encode(["body": "vuelve a manar", "waterStatus": "flowing"])
            }, afterResponse: { res in XCTAssertEqual(res.status, .created) })
            abiertas = try await FontReport.query(on: app.db)
                .filter(\.$font.$id == fontID).filter(\.$resolvedAt == nil).count()
            XCTAssertEqual(abiertas, 0)

            // Y queda **sin resolver por nadie**: no la cerró una persona.
            try await app.test(.GET, "fonts/\(fontID)/report", afterResponse: { res in
                let rs = try res.content.decode([ReportResponse].self)
                XCTAssertNotNil(rs[0].resolvedAt)
                XCTAssertNil(rs[0].resolvedBy, "nadie la cerró: se cerró sola")
            })
        }
    }

    /// Se puede corregir una errata en el nombre de usuario, pero no ponerse cualquier
    /// cosa: lo que no encaja en una mención no vale.
    ///
    /// Y la regla solo se aplica **al cambiarlo**. Las cuentas antiguas se registraron sin
    /// ella, y exigirla siempre dejaría a quien tenga un nombre raro sin poder guardar ni
    /// un interruptor de su perfil, por un campo que ni ha tocado.
    func testUsernameCanBeFixedButOnlyToAMentionableOne() async throws {
        try await withApp { app in
            let id = try await register(app, username: "erratta")
            let token = try await login(app, username: "erratta")

            func guarda(_ username: String, _ name: String = "Test") async throws -> HTTPStatus {
                var status = HTTPStatus.ok
                try await app.test(.PUT, "users/\(id)", headers: bearer(token), beforeRequest: { req in
                    try req.content.encode(UpdateUserDTO(
                        name: name, username: username, email: "erratta@example.com", password: nil,
                        emailPublic: nil, namePublic: nil))
                }, afterResponse: { res in status = res.status })
                return status
            }

            // Corregir la errata: adelante.
            var status = try await guarda("errata")
            XCTAssertEqual(status, .ok)
            let corregido = try await User.find(id, on: app.db)
            XCTAssertEqual(corregido?.username, "errata")
            // Y el perfil público responde por el nombre nuevo.
            try await app.test(.GET, "users/errata", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })

            // Lo que no se puede mencionar, no se puede poner.
            status = try await guarda("con espacio"); XCTAssertEqual(status, .badRequest)
            status = try await guarda("acentuado");   XCTAssertEqual(status, .ok, "sin acentos, pasa")
            status = try await guarda("Ñandú");       XCTAssertEqual(status, .badRequest)
            status = try await guarda(String(repeating: "a", count: 31))
            XCTAssertEqual(status, .badRequest)

            // Y el que ya se tiene se puede reenviar tal cual aunque no cumpliera: es lo
            // que hace cualquier guardado del perfil que no toque el nombre.
            let raro = try await User.find(id, on: app.db)!
            raro.username = "nom rar amb espais"
            try await raro.save(on: app.db)
            status = try await guarda("nom rar amb espais", "Nombre nuevo")
            XCTAssertEqual(status, .ok)
            let final = try await User.find(id, on: app.db)
            XCTAssertEqual(final?.name, "Nombre nuevo")
        }
    }

    /// Dos personas no pueden acabar con el mismo nombre.
    func testUsernameChangeRejectsOneAlreadyTaken() async throws {
        try await withApp { app in
            _ = try await register(app, username: "ocupado")
            let id = try await register(app, username: "libre")
            let token = try await login(app, username: "libre")
            try await app.test(.PUT, "users/\(id)", headers: bearer(token), beforeRequest: { req in
                try req.content.encode(UpdateUserDTO(
                    name: "Test", username: "ocupado", email: "libre@example.com", password: nil,
                    emailPublic: nil, namePublic: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .conflict)
            })
        }
    }

    // MARK: - Campana

    /// La bandeja cuenta lo no leído, **no** lo marca al pedirlo, y al marcar conserva
    /// los avisos.
    ///
    /// Lo de no marcar al pedir es la mitad del test: la app pide esta ruta en cada carga,
    /// y si leer contara como haber mirado, la campana se vaciaría sola antes de que nadie
    /// la abriera. Se marca al abrir el panel, que es un gesto.
    func testNotificationInboxCountsUnreadAndOnlyClearsWhenAsked() async throws {
        try await withApp { app in
            let id = try await register(app, username: "campanera")
            let token = try await login(app, username: "campanera")
            for i in 0..<2 {
                try await Notification(userID: id, kind: .mention, actorID: nil, actorName: "admin",
                                       fontID: nil, fontName: "Font \(i)", excerpt: "hola @campanera")
                    .save(on: app.db)
            }

            try await app.test(.GET, "notifications", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let inbox = try res.content.decode(NotificationController.Inbox.self)
                XCTAssertEqual(inbox.unread, 2)
                XCTAssertEqual(inbox.items.count, 2)
                XCTAssertFalse(inbox.items[0].read)
                // Sin fuente el aviso sigue existiendo; es el enlace lo que desaparece.
                XCTAssertNil(inbox.items[0].fontID)
            })

            // Pedirla otra vez no ha marcado nada.
            try await app.test(.GET, "notifications", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(try res.content.decode(NotificationController.Inbox.self).unread, 2)
            })

            try await app.test(.POST, "notifications/read", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .noContent)
            })
            try await app.test(.GET, "notifications", headers: bearer(token), afterResponse: { res in
                let inbox = try res.content.decode(NotificationController.Inbox.self)
                XCTAssertEqual(inbox.unread, 0)
                XCTAssertEqual(inbox.items.count, 2, "marcar como leído no borra nada")
            })
        }
    }

    /// La bandeja es privada: sin sesión no hay campana, y la de otro no se ve.
    func testNotificationInboxIsPrivate() async throws {
        try await withApp { app in
            let ajeno = try await register(app, username: "ajena")
            try await Notification(userID: ajeno, kind: .mention, actorID: nil, actorName: "admin",
                                   fontID: nil, fontName: "Font", excerpt: "@ajena").save(on: app.db)
            let mirona = try await register(app, username: "mirona")
            _ = mirona
            let token = try await login(app, username: "mirona")

            try await app.test(.GET, "notifications", afterResponse: { res in
                XCTAssertEqual(res.status, .unauthorized)
            })
            try await app.test(.GET, "notifications", headers: bearer(token), afterResponse: { res in
                let inbox = try res.content.decode(NotificationController.Inbox.self)
                XCTAssertEqual(inbox.unread, 0)
                XCTAssertTrue(inbox.items.isEmpty, "la bandeja de otro no se ve")
            })
        }
    }

    /// Pedir la bandeja anota que has pasado, y eso es lo que decide que **no** te llegue
    /// un correo contándote lo que ya tienes en la campana.
    func testAskingForTheInboxMarksYouAsAround() async throws {
        try await withApp { app in
            let id = try await register(app, username: "presente")
            let token = try await login(app, username: "presente")
            let antes = try await User.find(id, on: app.db)
            XCTAssertNil(antes?.lastSeenAt)
            XCTAssertEqual(antes?.isAround, false)

            try await app.test(.GET, "notifications", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })
            let despues = try await User.find(id, on: app.db)
            XCTAssertNotNil(despues?.lastSeenAt)
            XCTAssertEqual(despues?.isAround, true)
        }
    }

    /// Una fuente **sin zona** dentro de Catalunya cuenta igual, heredando la demarcación
    /// de la clasificada más cercana.
    ///
    /// Sin esto la insignia era inganable sin explicación posible: `fonts.region` la
    /// rellena `populate-regions` contra un GeoJSON de fronteras, y lo que ese fichero no
    /// cubre —hoy 90 fuentes catalanas, casi todas costeras o pegadas a un límite— se
    /// queda nulo. Quien hubiera pisado las cuatro de verdad podía no ganarla nunca.
    func testCataloniaRescuesFontsWithNoZoneFromTheirNeighbour() async throws {
        try await withApp { app in
            let id = try await register(app, username: "rescatada")
            let token = try await login(app, username: "rescatada")

            /// Cuelga una aportación liquidada de `fontID`, fechada `daysAgo` atrás.
            ///
            /// Se crea con la fuente puesta desde el principio y no buscando después «la
            /// más reciente»: aquí las fechas no van en orden y ese atajo reasignaba
            /// siempre el mismo evento.
            func aporta(_ fontID: UUID, daysAgo: Int) async throws {
                let cuando = Date().addingTimeInterval(-Double(daysAgo) * 86_400)
                let e = ContributionEvent()
                e.$user.id = id
                e.$font.id = fontID
                e.source = "comment"
                e.subjectID = UUID()
                e.detail = "z\(daysAgo)"
                e.kind = ContributionScore.Kind.updateReview.rawValue
                e.base = 10; e.multiplier = 1; e.gotes = 10
                e.status = .settled
                e.occurredAt = cuando
                e.settlesAt = cuando
                e.settledAt = cuando
                try await e.save(on: app.db)
            }

            // La huérfana va **primero**, y a propósito: `inheritZone` corre en segundo
            // plano al crear una fuente y le copiaría la zona de la vecina, que es justo
            // lo que este test necesita que NO pase. Creada cuando todavía no hay ninguna
            // clasificada a menos de 55 km, no hay de quién heredar y se queda nula sin
            // depender de ganarle una carrera a una tarea de fondo.
            //
            // Coordenadas dentro de la caja catalana (40,4–43,0 · 0,0–3,4): la consulta de
            // rescate solo mira ahí, que es lo que la mantiene barata.
            let huerfana = try await createFont(app, token: token, name: "Huérfana", lat: 41.618, long: 0.620)
            try await aporta(huerfana, daysAgo: 1)

            // Las otras tres, lejísimos entre sí y de la huérfana, para que nadie herede
            // de nadie. Su demarcación se pone a mano y la consulta principal —que no
            // filtra por caja— las cuenta igual.
            for (i, region) in ["Barcelona", "Girona", "Tarragona"].enumerated() {
                let fid = try await createFont(app, token: token, name: "Z\(i)", lat: 45.5 + Double(i), long: 2.0)
                let f = try await Font.find(fid, on: app.db)!
                f.country = "Spain"; f.region = region
                try await f.save(on: app.db)
                try await aporta(fid, daysAgo: 10 - i)
            }

            // Y la vecina de Lleida, a 2 km de la huérfana. Aquí **no se aporta**: la
            // única aportación de esa demarcación está en la fuente sin zona, así que sin
            // rescate no hay cuarta y la insignia no cae.
            let vecina = try await createFont(app, token: token, name: "Vecina", lat: 41.600, long: 0.620)
            let v = try await Font.find(vecina, on: app.db)!
            v.country = "Spain"; v.region = "Lleida"
            try await v.save(on: app.db)

            let h = try await Font.find(huerfana, on: app.db)!
            XCTAssertNil(h.region, "la huérfana tiene que llegar sin zona a la prueba")

            try await SpecialBadges.award(on: app.db)
            let ganada = try await BadgeAward.query(on: app.db)
                .filter(\.$key == "catalonia").filter(\.$user.$id == id).first()
            XCTAssertNotNil(ganada, "la fuente sin zona debe heredar la de su vecina a 2 km")
        }
    }
}
