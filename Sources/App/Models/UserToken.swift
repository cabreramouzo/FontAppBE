import Fluent
import Vapor

/// Token de acceso Bearer respaldado en BD. Se emite en el login y se revoca en el logout.
final class UserToken: Model, @unchecked Sendable {
    static let schema = "user_tokens"

    @ID(key: .id) var id: UUID?
    @Field(key: "value") var value: String
    @Parent(key: "user_id") var user: User
    @OptionalField(key: "expires_at") var expiresAt: Date?

    init() {}

    init(id: UUID? = nil, value: String, userID: User.IDValue, expiresAt: Date? = nil) {
        self.id = id
        self.value = value
        self.$user.id = userID
        self.expiresAt = expiresAt
    }

    /// How long a session lasts **without being used**. Every use pushes the expiry back
    /// (see `RenewingTokenAuthenticator`), so someone who opens the app now and then never
    /// has to sign in again; only six months away ends the session.
    ///
    /// It was a fixed 30 days from the login, which signed everyone out once a month, the
    /// most active people included (changed 27/09/2026, for the native iOS app). Revocation
    /// does not depend on the expiry: logout and a password reset remove the token row
    /// right away.
    static let lifetime: TimeInterval = 60 * 60 * 24 * 180

    /// At most one write per token per day: a renewal younger than this is left alone.
    static let renewalStep: TimeInterval = 60 * 60 * 24

    /// Generates a random token for a user.
    static func generate(for user: User, ttl: TimeInterval = lifetime) throws -> UserToken {
        UserToken(
            value: [UInt8].random(count: 32).base64,
            userID: try user.requireID(),
            expiresAt: Date().addingTimeInterval(ttl)
        )
    }
}

extension UserToken {
    /// Whether using the token now should push its expiry back to `now + lifetime`.
    func needsRenewal(now: Date = Date()) -> Bool {
        guard let expiresAt else { return false }
        return expiresAt < now.addingTimeInterval(Self.lifetime - Self.renewalStep)
    }

    /// Shadows the protocol's `authenticator()`, so the thirty `UserToken.authenticator()`
    /// call sites get the renewing one without changing.
    static func authenticator() -> RenewingTokenAuthenticator {
        RenewingTokenAuthenticator()
    }
}

/// Fluent's token authenticator plus a sliding expiry. Same steps as
/// `ModelTokenAuthenticator` (look the token up, drop it if expired, log in token and
/// user), and a renewal when the token is used.
struct RenewingTokenAuthenticator: AsyncBearerAuthenticator {
    func authenticate(bearer: BearerAuthorization, for request: Request) async throws {
        guard let token = try await UserToken.query(on: request.db)
            .filter(\.$value == bearer.token)
            .with(\.$user)
            .first() else { return }
        guard token.isValid else {
            try await token.delete(on: request.db)
            return
        }
        if token.needsRenewal() {
            token.expiresAt = Date().addingTimeInterval(UserToken.lifetime)
            // A failed renewal must not fail the request: the token is still valid.
            try? await token.save(on: request.db)
        }
        request.auth.login(token)
        request.auth.login(token.user)
    }
}

extension UserToken: ModelTokenAuthenticatable {
    static let valueKey = \UserToken.$value
    static let userKey = \UserToken.$user

    var isValid: Bool {
        guard let expiresAt else { return true }
        return expiresAt > Date()
    }
}
