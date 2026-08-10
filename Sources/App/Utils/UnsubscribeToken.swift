import Crypto
import Foundation
import Vapor

/// Enlace de baja del resumen semanal que funciona SIN iniciar sesión (el usuario lo
/// pulsa desde su correo, puede no tener sesión abierta, y obligarle a entrar para
/// dejar de recibir correo es justo lo que hace que la gente te marque como spam).
///
/// El token es un HMAC del id de usuario con una clave del servidor: no hay que guardar
/// nada en la BD, no caduca (el enlace vive en un correo antiguo para siempre) y no se
/// puede fabricar sin la clave, así que nadie puede dar de baja a otro. Solo sirve para
/// esto: no es una sesión ni da acceso a nada más.
enum UnsubscribeToken {
    /// Clave de firma. En producción **debe** venir de `APP_SECRET`; si falta, se deriva
    /// una por proceso, lo que invalida los enlaces al reiniciar (aceptable en dev,
    /// nunca en prod → lo avisamos al arrancar en `configure`).
    static func secret() -> String {
        Environment.get("APP_SECRET") ?? fallbackSecret
    }

    private static let fallbackSecret = UUID().uuidString

    static func make(userID: UUID) -> String {
        let key = SymmetricKey(data: Data(secret().utf8))
        let mac = HMAC<SHA256>.authenticationCode(for: Data(userID.uuidString.utf8), using: key)
        return Data(mac).base64URLEncoded()
    }

    /// Comparación en tiempo constante (la da `HMAC.isValidAuthenticationCode`).
    static func verify(_ token: String, userID: UUID) -> Bool {
        guard let provided = Data(base64URLEncoded: token) else { return false }
        let key = SymmetricKey(data: Data(secret().utf8))
        return HMAC<SHA256>.isValidAuthenticationCode(provided, authenticating: Data(userID.uuidString.utf8), using: key)
    }
}

// Base64 "URL-safe": el token viaja en una query string, y `+` y `/` se rompen ahí.
private extension Data {
    func base64URLEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    init?(base64URLEncoded s: String) {
        var b = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b.count % 4 != 0 { b += "=" }
        guard let d = Data(base64Encoded: b) else { return nil }
        self = d
    }
}
