import Fluent
import Vapor
import WebAuthn

struct PasskeyController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let auth = routes.grouped("auth", "passkeys")
        auth.grouped(RateLimitMiddleware(scope: "passkey-login", max: 20, window: 5 * 60))
            .post("authentication", "options", use: authenticationOptions)
        auth.grouped(RateLimitMiddleware(scope: "passkey-login", max: 20, window: 5 * 60))
            .post("authentication", "verify", use: authenticate)

        let protected = auth.grouped(UserToken.authenticator(), User.guardMiddleware())
        protected.get(use: list)
        protected.post("registration", "options", use: registrationOptions)
        protected.post("registration", "verify", use: register)
        protected.delete(":id", use: remove)
    }

    private func manager(_ req: Request) throws -> WebAuthnManager {
        let production = req.application.environment == .production
        let rpID = Environment.get("PASSKEY_RP_ID") ?? (production ? "fontapp.net" : "localhost")
        let origin = Environment.get("PASSKEY_ORIGIN") ?? (production ? "https://fontapp.net" : "http://localhost:5173")
        return WebAuthnManager(configuration: .init(relyingPartyID: rpID, relyingPartyName: "FontApp", relyingPartyOrigin: origin))
    }

    @Sendable func registrationOptions(req: Request) async throws -> RegistrationOptionsResponse {
        try await pruneExpired(on: req.db)
        let user = try req.auth.require(User.self)
        let userID = try user.requireID()
        let existingIDs = try await PasskeyCredential.query(on: req.db)
            .filter(\.$user.$id == userID).all().map(\.credentialID)
        let options = try manager(req).beginRegistration(
            user: .init(id: Array(userID.uuidString.utf8), name: user.username, displayName: user.name),
            authenticatorSelection: .init(residentKey: .required, userVerification: .required)
        )
        let pending = PasskeyChallenge(challenge: options.challenge, purpose: "registration", userID: userID)
        try await pending.save(on: req.db)
        return RegistrationOptionsResponse(requestID: try pending.requireID(), publicKey: options,
                                           existingCredentialIDs: existingIDs)
    }

    @Sendable func register(req: Request) async throws -> PasskeySummary {
        let user = try req.auth.require(User.self)
        let dto = try req.content.decode(FinishRegistrationDTO.self)
        let pending = try await consume(dto.requestID, purpose: "registration", on: req)
        guard pending.$user.id == user.id else { throw Abort(.forbidden) }
        let result = try await manager(req).finishRegistration(
            challenge: [UInt8](pending.challenge), credentialCreationData: dto.credential,
            requireUserVerification: true,
            confirmCredentialIDNotRegisteredYet: { id in
                try await PasskeyCredential.query(on: req.db).filter(\.$credentialID == id).first() == nil
            }
        )
        let label = dto.label.trimmingCharacters(in: .whitespacesAndNewlines)
        // `Credential.id` de la librería se expone en base64 clásico, mientras que el
        // navegador siempre devuelve base64url. Persistimos la forma canónica del wire
        // para que el lookup posterior no dependa de `+`, `/` ni padding.
        let model = PasskeyCredential(credentialID: dto.credential.id.asString(), publicKey: Data(result.publicKey),
                                      signCount: result.signCount, label: String((label.isEmpty ? "Passkey" : label).prefix(80)),
                                      userID: try user.requireID())
        try await model.save(on: req.db)
        return PasskeySummary(model)
    }

    @Sendable func authenticationOptions(req: Request) async throws -> AuthenticationOptionsResponse {
        try await pruneExpired(on: req.db)
        let options = try manager(req).beginAuthentication(userVerification: .required)
        let pending = PasskeyChallenge(challenge: options.challenge, purpose: "authentication", userID: nil)
        try await pending.save(on: req.db)
        return AuthenticationOptionsResponse(requestID: try pending.requireID(), publicKey: options)
    }

    @Sendable func authenticate(req: Request) async throws -> LoginResponse {
        let dto = try req.content.decode(FinishAuthenticationDTO.self)
        let pending = try await consume(dto.requestID, purpose: "authentication", on: req)
        let credentialID = dto.credential.id.asString()
        guard let stored = try await PasskeyCredential.query(on: req.db)
            .filter(\.$credentialID == credentialID).with(\.$user).first(),
              stored.user.anonymizedAt == nil else { throw Abort(.unauthorized) }
        let verified = try manager(req).finishAuthentication(
            credential: dto.credential, expectedChallenge: [UInt8](pending.challenge),
            credentialPublicKey: [UInt8](stored.publicKey), credentialCurrentSignCount: UInt32(clamping: stored.signCount),
            requireUserVerification: true
        )
        stored.signCount = Int64(verified.newSignCount)
        stored.lastUsedAt = Date()
        try await stored.save(on: req.db)
        let token = try UserToken.generate(for: stored.user)
        try await token.save(on: req.db)
        return LoginResponse(token: token.value, expiresAt: token.expiresAt,
                             user: UserResponse(stored.user, includeEmail: true))
    }

    @Sendable func list(req: Request) async throws -> [PasskeySummary] {
        let user = try req.auth.require(User.self)
        return try await PasskeyCredential.query(on: req.db).filter(\.$user.$id == user.requireID())
            .sort(\.$createdAt, .descending).all().map(PasskeySummary.init)
    }

    @Sendable func remove(req: Request) async throws -> HTTPStatus {
        let user = try req.auth.require(User.self)
        guard let id = req.parameters.get("id", as: UUID.self),
              let key = try await PasskeyCredential.find(id, on: req.db), key.$user.id == user.id else {
            throw Abort(.notFound)
        }
        try await key.delete(on: req.db)
        return .noContent
    }

    private func consume(_ id: UUID, purpose: String, on req: Request) async throws -> PasskeyChallenge {
        guard let pending = try await PasskeyChallenge.find(id, on: req.db),
              pending.purpose == purpose, pending.expiresAt > Date() else { throw Abort(.unauthorized) }
        try await pending.delete(on: req.db)
        return pending
    }

    private func pruneExpired(on db: Database) async throws {
        try await PasskeyChallenge.query(on: db).filter(\.$expiresAt <= Date()).delete()
    }
}

struct RegistrationOptionsResponse: Content {
    let requestID: UUID
    let publicKey: PublicKeyCredentialCreationOptions
    /// El navegador usa esta lista como `excludeCredentials`: permite varias passkeys,
    /// pero no registrar por accidente exactamente la misma credencial otra vez.
    let existingCredentialIDs: [String]
}
struct AuthenticationOptionsResponse: Content { let requestID: UUID; let publicKey: PublicKeyCredentialRequestOptions }
struct FinishRegistrationDTO: Content { let requestID: UUID; let label: String; let credential: RegistrationCredential }
struct FinishAuthenticationDTO: Content { let requestID: UUID; let credential: AuthenticationCredential }
struct PasskeySummary: Content {
    let id: UUID?; let label: String; let createdAt: Date?; let lastUsedAt: Date?
    init(_ key: PasskeyCredential) { id = key.id; label = key.label; createdAt = key.createdAt; lastUsedAt = key.lastUsedAt }
}
