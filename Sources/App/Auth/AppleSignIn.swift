import Crypto
import JWTKit
import Vapor

/// «Iniciar sesión con Apple», desde la app de iOS.
///
/// La app manda el identity token (un JWT firmado por Apple) y el authorization code.
/// El token se verifica aquí con las claves públicas de Apple, como el de Google. El code
/// solo sirve para conseguir un refresh token, y ese solo para una cosa: revocar el
/// acceso cuando se borra la cuenta, que Apple exige (App Review 5.1.1(v)).
///
/// ## Configuración
///
/// - `APPLE_CLIENT_ID`: el bundle id de la app. Opcional: por defecto `net.fontapp.FontApp`.
/// - `APPLE_SIGNIN_KEY_ID`, `APPLE_SIGNIN_KEY` (el `.p8`, PEM) y `APPLE_TEAM_ID` (o, si
///   falta, `APNS_TEAM_ID`): la clave con «Sign in with Apple» activado, para firmar el
///   client secret. Sin ellas se entra igual, pero borrar la cuenta no revoca el acceso
///   en Apple (se avisa en el log al arrancar).
struct AppleProfile: Sendable {
    let subject: String
    let email: String?
    /// Apple es autoridad sobre sus propios dominios y sobre el relay; para un correo de
    /// un tercero solo dice que se verificó alguna vez, como Google.
    let authoritativeEmail: Bool
}

protocol AppleSigningIn: Sendable {
    func verify(_ identityToken: String, clientID: String, on client: any Client) async throws -> AppleProfile
    /// El refresh token del code, o `nil` si no hay clave configurada o Apple lo rechaza.
    func refreshToken(for code: String, clientID: String, on client: any Client) async -> String?
    func revoke(_ refreshToken: String, clientID: String, on client: any Client) async
}

struct AppleIdentityToken: JWTPayload {
    let iss: IssuerClaim
    let aud: AudienceClaim
    let exp: ExpirationClaim
    let sub: SubjectClaim
    let email: String?
    let emailVerified: BoolOrString?

    enum CodingKeys: String, CodingKey { case iss, aud, exp, sub, email, emailVerified = "email_verified" }

    /// Apple manda `email_verified` a veces como `true` y a veces como `"true"`.
    struct BoolOrString: Codable, Sendable {
        let value: Bool
        init(from decoder: any Decoder) throws {
            let c = try decoder.singleValueContainer()
            value = (try? c.decode(Bool.self)) ?? ((try? c.decode(String.self)) == "true")
        }
        func encode(to encoder: any Encoder) throws {
            var c = encoder.singleValueContainer(); try c.encode(value)
        }
    }

    func verify(using algorithm: some JWTAlgorithm) async throws {
        guard iss.value == "https://appleid.apple.com" else { throw JWTError.claimVerificationFailure(failedClaim: iss, reason: "issuer") }
        try exp.verifyNotExpired()
    }
}

final class LiveAppleSignIn: AppleSigningIn, @unchecked Sendable {
    private let keys = AppleJWKSCache()
    private let secret: AppleClientSecret?

    init(environment: (String) -> String? = Environment.get) {
        secret = AppleClientSecret(keyID: environment("APPLE_SIGNIN_KEY_ID"),
                                   teamID: environment("APPLE_TEAM_ID") ?? environment("APNS_TEAM_ID"),
                                   key: environment("APPLE_SIGNIN_KEY"))
    }

    var canRevoke: Bool { secret != nil }

    func verify(_ identityToken: String, clientID: String, on client: any Client) async throws -> AppleProfile {
        let collection = JWTKeyCollection()
        try await collection.add(jwksJSON: try await keys.jwks(on: client))
        let token = try await collection.verify(identityToken, as: AppleIdentityToken.self)
        try token.aud.verifyIntendedAudience(includes: clientID)
        let email = token.emailVerified?.value == true
            ? token.email?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().nilIfEmpty : nil
        let appleDomains = ["icloud.com", "me.com", "mac.com", "privaterelay.appleid.com"]
        let authoritative = email.map { e in appleDomains.contains { e.hasSuffix("@\($0)") } } ?? false
        return AppleProfile(subject: token.sub.value, email: email, authoritativeEmail: authoritative)
    }

    func refreshToken(for code: String, clientID: String, on client: any Client) async -> String? {
        guard let secret = secret?.jwt(clientID: clientID) else { return nil }
        struct Answer: Decodable { let refresh_token: String? }
        do {
            let res = try await client.post("https://appleid.apple.com/auth/token") { req in
                try req.content.encode(["client_id": clientID, "client_secret": secret, "code": code,
                                        "grant_type": "authorization_code"], as: .urlEncodedForm)
            }
            guard res.status == .ok else { return nil }
            return try res.content.decode(Answer.self).refresh_token
        } catch {
            return nil
        }
    }

    func revoke(_ refreshToken: String, clientID: String, on client: any Client) async {
        guard let secret = secret?.jwt(clientID: clientID) else { return }
        _ = try? await client.post("https://appleid.apple.com/auth/revoke") { req in
            try req.content.encode(["client_id": clientID, "client_secret": secret, "token": refreshToken,
                                    "token_type_hint": "refresh_token"], as: .urlEncodedForm)
        }
    }
}

/// El client secret de Apple: un JWT ES256 corto firmado con la clave del equipo, igual
/// que el token de APNs (r||s en crudo, no DER).
struct AppleClientSecret: Sendable {
    let keyID: String
    let teamID: String
    private let key: P256.Signing.PrivateKey

    init?(keyID: String?, teamID: String?, key pem: String?) {
        guard let keyID, let teamID, let pem,
              let key = try? P256.Signing.PrivateKey(pemRepresentation: pem.replacingOccurrences(of: "\\n", with: "\n"))
        else { return nil }
        self.keyID = keyID
        self.teamID = teamID
        self.key = key
    }

    func jwt(clientID: String, now: Date = Date()) -> String? {
        let iat = Int(now.timeIntervalSince1970)
        let header = #"{"alg":"ES256","kid":"\#(keyID)"}"#
        let claims = #"{"iss":"\#(teamID)","iat":\#(iat),"exp":\#(iat + 300),"aud":"https://appleid.apple.com","sub":"\#(clientID)"}"#
        let signed = "\(Data(header.utf8).base64URL).\(Data(claims.utf8).base64URL)"
        guard let signature = try? key.signature(for: Data(signed.utf8)) else { return nil }
        return "\(signed).\(signature.rawRepresentation.base64URL)"
    }
}

/// Como con Google: las claves rotan de vez en cuando, no en cada acceso.
private actor AppleJWKSCache {
    private var value: String?
    private var expiresAt = Date.distantPast

    func jwks(on client: any Client) async throws -> String {
        if let value, expiresAt > Date() { return value }
        let response = try await client.get("https://appleid.apple.com/auth/keys")
        guard response.status == .ok, let body = response.body,
              let json = body.getString(at: body.readerIndex, length: body.readableBytes) else {
            throw Abort(.serviceUnavailable, reason: "No se han podido obtener las claves públicas de Apple")
        }
        value = json
        expiresAt = Date().addingTimeInterval(60 * 60)
        return json
    }
}

private struct AppleSignInKey: StorageKey { typealias Value = any AppleSigningIn }
extension Application {
    var appleSignIn: any AppleSigningIn {
        get { storage[AppleSignInKey.self] ?? LiveAppleSignIn() }
        set { storage[AppleSignInKey.self] = newValue }
    }

    /// El bundle id de la app: la audiencia que deben llevar sus identity tokens.
    var appleClientID: String { Environment.get("APPLE_CLIENT_ID") ?? APNs.defaultTopic }
}
