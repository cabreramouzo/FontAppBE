import JWTKit
import Vapor

struct GoogleProfile: Sendable {
    let subject: String
    let email: String
    let name: String?
    let authoritativeEmail: Bool
}

protocol GoogleTokenVerifying: Sendable {
    func verify(_ credential: String, clientID: String, on client: Client) async throws -> GoogleProfile
}

/// Verifica firma y claims localmente con las claves públicas rotatorias de Google.
/// Solo las claves (datos públicos) se descargan; el token nunca se manda a un endpoint
/// de introspección o depuración.
final class LiveGoogleTokenVerifier: GoogleTokenVerifying, @unchecked Sendable {
    private let cache = GoogleJWKSCache()

    func verify(_ credential: String, clientID: String, on client: Client) async throws -> GoogleProfile {
        let json = try await cache.jwks(on: client)
        let keys = JWTKeyCollection()
        try await keys.add(jwksJSON: json)
        let token = try await keys.verify(credential, as: GoogleIdentityToken.self)
        try token.audience.verifyIntendedAudience(includes: clientID)
        guard token.emailVerified?.value == true,
              let email = token.email?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !email.isEmpty else {
            throw Abort(.unauthorized, reason: "Google no ha verificado el correo")
        }
        let authoritative = email.hasSuffix("@gmail.com") || token.hostedDomain != nil
        return GoogleProfile(subject: token.subject.value, email: email, name: token.name,
                             authoritativeEmail: authoritative)
    }
}

/// Las claves cambian periódicamente, no en cada login. Una caché breve evita que la
/// disponibilidad y latencia de Google formen parte de cada acceso sin retener tokens.
private actor GoogleJWKSCache {
    private var value: String?
    private var expiresAt = Date.distantPast

    func jwks(on client: Client) async throws -> String {
        if let value, expiresAt > Date() { return value }
        let response = try await client.get("https://www.googleapis.com/oauth2/v3/certs")
        guard response.status == .ok, let body = response.body,
              let json = body.getString(at: body.readerIndex, length: body.readableBytes) else {
            throw Abort(.serviceUnavailable, reason: "No se han podido obtener las claves públicas de Google")
        }
        value = json
        expiresAt = Date().addingTimeInterval(60 * 60)
        return json
    }
}

private struct GoogleVerifierKey: StorageKey { typealias Value = any GoogleTokenVerifying }
extension Application {
    var googleTokenVerifier: any GoogleTokenVerifying {
        get { storage[GoogleVerifierKey.self] ?? LiveGoogleTokenVerifier() }
        set { storage[GoogleVerifierKey.self] = newValue }
    }
}
