import Fluent
import XCTVapor
@testable import App

/// Reviews written far from the fountain (`remoteDistanceM` → `RemoteReviewController`).
///
/// The web app only sends the distance when the person is clearly more than a kilometre
/// away; the server stores it, keeps it out of every public response, and lists it in a
/// moderators-only lane. Nothing automatic: the review is published and stays published.
final class RemoteReviewTests: XCTestCase {
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

    private func user(_ app: Application, _ name: String, role: UserRole = .user) async throws -> (User, String) {
        let n = Int.random(in: 1...999_999)
        let u = User(name: name, username: "\(name)\(n)", email: "\(name)\(n)@x.test",
                     passwordHash: try Bcrypt.hash("password123"))
        u.role = role
        try await u.save(on: app.db)
        var token = ""
        try await app.test(.POST, "auth/login", beforeRequest: { req in
            req.headers.basicAuthorization = .init(username: "\(name)\(n)", password: "password123")
        }, afterResponse: { res in token = try res.content.decode(LoginResponse.self).token })
        return (u, token)
    }

    private func fountain(_ app: Application) async throws -> Font {
        let f = Font(name: "Font del Roure", latitude: 41.75, longitude: 2.16)
        try await f.save(on: app.db)
        return f
    }

    private func bearer(_ t: String) -> HTTPHeaders { ["Authorization": "Bearer \(t)"] }

    /// Posts a status-only review, optionally declaring the distance.
    private func review(_ app: Application, _ f: Font, token: String, distance: Int?,
                        expect: HTTPStatus = .created) async throws {
        try await app.test(.POST, "fonts/\(f.requireID())/comments", headers: bearer(token),
                           beforeRequest: { req in
            try req.content.encode(CreateCommentDTO(body: nil, rating: nil, waterStatus: "flowing",
                                                    image: nil, confirmIfUnchanged: nil,
                                                    remoteDistanceM: distance))
        }, afterResponse: { res in XCTAssertEqual(res.status, expect) })
    }

    private func lane(_ app: Application, token: String) async throws -> [RemoteReviewController.Row] {
        var rows: [RemoteReviewController.Row] = []
        try await app.test(.GET, "moderation/remote-reviews", headers: bearer(token), afterResponse: { res in
            XCTAssertEqual(res.status, .ok)
            rows = try res.content.decode([RemoteReviewController.Row].self)
        })
        return rows
    }

    /// The review is published as usual — never blocked — and the distance is stored.
    func testRemoteReviewIsPublishedAndItsDistanceStored() async throws {
        try await withApp { app in
            let (_, token) = try await user(app, "walker")
            let f = try await fountain(app)
            try await review(app, f, token: token, distance: 12_000)
            let saved = try await FontComment.query(on: app.db).filter(\.$font.$id == f.requireID()).all()
            XCTAssertEqual(saved.count, 1)
            XCTAssertEqual(saved.first?.remoteDistanceM, 12_000)
        }
    }

    /// The distance says roughly where someone was: it must not reach any public response.
    func testDistanceIsNotInThePublicReviewList() async throws {
        try await withApp { app in
            let (_, token) = try await user(app, "walker")
            let f = try await fountain(app)
            try await review(app, f, token: token, distance: 12_000)
            try await app.test(.GET, "fonts/\(f.requireID())/comments", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertFalse(res.body.string.contains("remote"), res.body.string)
                XCTAssertFalse(res.body.string.contains("12000"), res.body.string)
            })
        }
    }

    /// Only "clearly far" is ever sent; anything else is a malformed client.
    func testImplausibleDistancesAreRejected() async throws {
        try await withApp { app in
            let (_, token) = try await user(app, "walker")
            let f = try await fountain(app)
            try await review(app, f, token: token, distance: 300, expect: .badRequest)
            try await review(app, f, token: token, distance: 50_000_000, expect: .badRequest)
        }
    }

    /// The lane lists remote reviews for moderators, with the author's count in the window,
    /// and leaves out reviews without a distance (near or unknown).
    func testLaneListsRemoteReviewsForModerators() async throws {
        try await withApp { app in
            let (_, token) = try await user(app, "walker")
            let (_, near) = try await user(app, "local")
            let (_, mod) = try await user(app, "mod", role: .moderator)
            let f = try await fountain(app)
            let g = try await fountain(app)
            try await review(app, f, token: token, distance: 12_000)
            try await review(app, g, token: token, distance: 3_000)
            try await review(app, f, token: near, distance: nil)

            let rows = try await lane(app, token: mod)
            XCTAssertEqual(rows.count, 2)
            XCTAssertEqual(Set(rows.map(\.distanceM)), [12_000, 3_000])
            XCTAssertTrue(rows.allSatisfy { $0.authorRemoteCount == 2 })
        }
    }

    /// Vigilance is for the team: a regular account gets 403, not the list.
    func testLaneIsForbiddenToRegularUsers() async throws {
        try await withApp { app in
            let (_, token) = try await user(app, "walker")
            try await app.test(.GET, "moderation/remote-reviews", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })
        }
    }

    /// "Checked" takes it out of the lane and leaves the review exactly where it was.
    func testCheckedLeavesTheLaneButKeepsTheReview() async throws {
        try await withApp { app in
            let (_, token) = try await user(app, "walker")
            let (_, mod) = try await user(app, "mod", role: .moderator)
            let f = try await fountain(app)
            try await review(app, f, token: token, distance: 12_000)
            let before = try await lane(app, token: mod)
            let id = try XCTUnwrap(before.first?.commentID)

            try await app.test(.POST, "moderation/remote-reviews/\(id)/checked", headers: bearer(mod),
                               afterResponse: { res in XCTAssertEqual(res.status, .noContent) })

            let rows = try await lane(app, token: mod)
            XCTAssertTrue(rows.isEmpty)
            let still = try await FontComment.find(id, on: app.db)
            XCTAssertNotNil(still, "checking a remote review must not delete it")
            XCTAssertEqual(still?.remoteDistanceM, 12_000)
        }
    }
}
