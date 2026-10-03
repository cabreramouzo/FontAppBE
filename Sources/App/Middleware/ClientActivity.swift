import Fluent
import SQLKit
import Vapor

/// Which client made a request: the web, the iOS app or (later) the Android app.
///
/// Every client sends `X-FontApp-Client: <platform>/<version>`: `web/2026.10.03`,
/// `ios/1.0 (212)`, `android/1.0 (5)`. iOS builds from before the header are still told
/// apart by URLSession's user agent (`FontApp/212 CFNetwork/… Darwin/…`). Anything else
/// is `unknown`: scripts, crawlers, old web bundles.
///
/// The whole contract, and what Android must send, is in `docs/clients.md`.
struct ClientInfo: Sendable, Equatable {
    enum Platform: String, Sendable, CaseIterable, Codable {
        case web, ios, android, unknown
    }

    let platform: Platform
    let version: String?

    static let header = "X-FontApp-Client"
    static let unknown = ClientInfo(platform: .unknown, version: nil)

    static func parse(header: String?, userAgent: String?) -> ClientInfo {
        if let header, let slash = header.firstIndex(of: "/"),
           let platform = Platform(rawValue: header[..<slash].lowercased()), platform != .unknown {
            let version = header[header.index(after: slash)...].trimmingCharacters(in: .whitespaces)
            return ClientInfo(platform: platform, version: version.isEmpty ? nil : String(version.prefix(40)))
        }
        if let userAgent, userAgent.hasPrefix("FontApp/"), userAgent.contains("CFNetwork") {
            let build = userAgent.split(separator: " ").first?.dropFirst("FontApp/".count)
            return ClientInfo(platform: .ios, version: build.map { "(\($0.prefix(30)))" })
        }
        return .unknown
    }
}

extension Request {
    private struct ClientInfoKey: StorageKey { typealias Value = ClientInfo }

    /// The client that made this request (set by `ClientActivityMiddleware`). Not
    /// `client`: that is Vapor's HTTP client.
    var fontAppClient: ClientInfo {
        get { storage[ClientInfoKey.self] ?? ClientInfo.parse(header: headers.first(name: ClientInfo.header),
                                                              userAgent: headers.first(name: .userAgent)) }
        set { storage[ClientInfoKey.self] = newValue }
    }
}

/// Notes, once a day per person and platform, that a signed-in person used FontApp from
/// that client, and whether they contributed from it. That is what the native apps have
/// to prove (FA-09 in `docs/producto-crecimiento-2026-09.md`): people who come back and
/// contribute from the app, not installs.
///
/// Only signed-in people: an anonymous request has no stable identity, and inventing one
/// (IP, fingerprint) is what this project does not do. Only successful requests. One row
/// per person, day and platform (`client_days`), deleted after 180 days like the rest of
/// the analytics. A write that fails here never fails the request.
struct ClientActivityMiddleware: AsyncMiddleware {
    let seen = ClientActivitySeen()

    func respond(to request: Request, chainingTo next: AsyncResponder) async throws -> Response {
        let client = ClientInfo.parse(header: request.headers.first(name: ClientInfo.header),
                                      userAgent: request.headers.first(name: .userAgent))
        request.fontAppClient = client
        let response = try await next.respond(to: request)
        // The user is known only now: routes authenticate inside their own groups.
        guard client.platform != .unknown, response.status.code < 400,
              let userID = request.auth.get(User.self)?.id else { return response }
        let contributed = Self.isContribution(method: request.method, path: request.url.path)
        let day = Self.today()
        guard await seen.firstTime(day: day, platform: client.platform, userID: userID, contributed: contributed),
              let sql = request.db as? SQLDatabase else { return response }
        do {
            // Once a day per process: the retention, as the other analytics tables do it.
            if await seen.startsDay(day) {
                try await sql.raw("DELETE FROM client_days WHERE day < CURRENT_DATE - 180").run()
            }
            try await sql.raw("""
                INSERT INTO client_days (id, day, platform, user_id, version, contributed)
                VALUES (\(bind: UUID()), \(bind: day)::date, \(bind: client.platform.rawValue), \(bind: userID),
                        \(bind: client.version), \(bind: contributed))
                ON CONFLICT (day, platform, user_id) DO UPDATE SET
                    contributed = client_days.contributed OR EXCLUDED.contributed,
                    version = COALESCE(EXCLUDED.version, client_days.version)
                """).run()
        } catch {
            await seen.forget(day: day, platform: client.platform, userID: userID, contributed: contributed)
            request.logger.warning("client_days: \(String(reflecting: error))")
        }
        return response
    }

    /// A successful write on a fountain or a photo: a new fountain, a review, a photo, a
    /// comment, an incident, an edit. Favourites are under `/fonts` too but are not
    /// contributions: nobody else learns anything from them.
    static func isContribution(method: HTTPMethod, path: String) -> Bool {
        guard [.POST, .PUT, .PATCH, .DELETE].contains(method) else { return false }
        let parts = path.split(separator: "/")
        guard let first = parts.first, first == "fonts" || first == "images" else { return false }
        return !parts.contains("favorite")
    }

    /// The day in UTC, as `YYYY-MM-DD`: one boundary for every client.
    static func today(_ now: Date = .now) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let c = calendar.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }
}

/// What this process already wrote today, so a person browsing the map does not cost a
/// write per request: one per day and platform, and one more the first time they
/// contribute. Forgotten at midnight; after a restart the upsert simply repeats.
actor ClientActivitySeen {
    private var day = ""
    private var keys = Set<String>()

    func firstTime(day: String, platform: ClientInfo.Platform, userID: UUID, contributed: Bool) -> Bool {
        if day != self.day { self.day = day; keys.removeAll() }
        let base = "\(platform.rawValue)|\(userID)"
        // A contribution is news even if the person was seen browsing earlier today.
        if contributed {
            keys.insert(base)
            return keys.insert(base + "|c").inserted
        }
        return keys.insert(base).inserted
    }

    private var cleanedDay = ""

    /// True the first time it is asked on a new day.
    func startsDay(_ day: String) -> Bool {
        guard day != cleanedDay else { return false }
        cleanedDay = day
        return true
    }

    func forget(day: String, platform: ClientInfo.Platform, userID: UUID, contributed: Bool) {
        let base = "\(platform.rawValue)|\(userID)"
        keys.remove(contributed ? base + "|c" : base)
    }
}
