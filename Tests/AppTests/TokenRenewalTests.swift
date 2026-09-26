import Fluent
import XCTVapor
@testable import App

/// Sessions expire after six months **without use**, not a fixed time after the login:
/// every authenticated request pushes the expiry back (`RenewingTokenAuthenticator`).
final class TokenRenewalTests: XCTestCase {
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

    private func login(_ app: Application) async throws -> String {
        let n = Int.random(in: 1...999_999)
        let user = User(name: "Ada", username: "ada\(n)", email: "ada\(n)@x.test",
                        passwordHash: try Bcrypt.hash("password123"))
        try await user.save(on: app.db)
        var token = ""
        try await app.test(.POST, "auth/login", beforeRequest: { req in
            req.headers.basicAuthorization = .init(username: "ada\(n)", password: "password123")
        }, afterResponse: { res in token = try res.content.decode(LoginResponse.self).token })
        return token
    }

    private func stored(_ app: Application, _ value: String) async throws -> UserToken? {
        try await UserToken.query(on: app.db).filter(\.$value == value).first()
    }

    func testLoginIssuesSixMonthToken() async throws {
        try await withApp { app in
            let token = try await login(app)
            let row = try await stored(app, token)
            let expiry = try XCTUnwrap(row?.expiresAt)
            XCTAssertEqual(expiry.timeIntervalSinceNow, UserToken.lifetime, accuracy: 60)
        }
    }

    func testUsePushesTheExpiryBack() async throws {
        try await withApp { app in
            let value = try await login(app)
            let found = try await stored(app, value)
            let token = try XCTUnwrap(found)
            token.expiresAt = Date().addingTimeInterval(60 * 60 * 24 * 10)
            try await token.save(on: app.db)

            try await app.test(.GET, "auth/me", beforeRequest: { req in
                req.headers.bearerAuthorization = .init(token: value)
            }, afterResponse: { res in XCTAssertEqual(res.status, .ok) })

            let row = try await stored(app, value)
            let expiry = try XCTUnwrap(row?.expiresAt)
            XCTAssertEqual(expiry.timeIntervalSinceNow, UserToken.lifetime, accuracy: 60)
        }
    }

    func testFreshTokenIsNotRewrittenOnEveryRequest() {
        let token = UserToken(value: "x", userID: UUID(),
                              expiresAt: Date().addingTimeInterval(UserToken.lifetime - 60))
        XCTAssertFalse(token.needsRenewal())
        token.expiresAt = Date().addingTimeInterval(UserToken.lifetime - UserToken.renewalStep - 60)
        XCTAssertTrue(token.needsRenewal())
    }

    func testExpiredTokenIsRejectedAndDeleted() async throws {
        try await withApp { app in
            let value = try await login(app)
            let found = try await stored(app, value)
            let token = try XCTUnwrap(found)
            token.expiresAt = Date().addingTimeInterval(-60)
            try await token.save(on: app.db)

            try await app.test(.GET, "auth/me", beforeRequest: { req in
                req.headers.bearerAuthorization = .init(token: value)
            }, afterResponse: { res in XCTAssertEqual(res.status, .unauthorized) })

            let gone = try await stored(app, value)
            XCTAssertNil(gone)
        }
    }
}
