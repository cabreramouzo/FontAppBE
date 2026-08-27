import Crypto
import Vapor
import Foundation

/// VAPID: la firma con la que el servidor de push sabe que el aviso es nuestro.
///
/// Es un JWT ES256 corriente, así que se firma con `swift-crypto` directamente: el
/// `Authorization` que espera el navegador es `vapid t=<jwt>, k=<clave pública>`.
///
/// ## Las claves son configuración, no código
///
/// `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` (base64url) más `VAPID_SUBJECT` (un `mailto:`
/// para que el servidor de push sepa a quién quejarse). Se generan una vez con
/// `swift run App vapid-keys` y **no se pueden cambiar a la ligera**: la pública viaja
/// dentro de cada suscripción del navegador, así que cambiarla invalida todas las
/// suscripciones existentes de golpe y en silencio — la gente deja de recibir avisos y
/// nadie se entera.
struct Vapid: Sendable {
    let publicKey: Data
    let privateKey: P256.Signing.PrivateKey
    let subject: String

    /// `nil` si no está configurado. No es un error: sin claves, la app funciona igual y
    /// simplemente no hay push — como pasa con el correo en desarrollo.
    init?(publicKey: String?, privateKey: String?, subject: String?) {
        guard let pub = publicKey.flatMap(Data.fromBase64URL),
              let priv = privateKey.flatMap(Data.fromBase64URL),
              let key = try? P256.Signing.PrivateKey(rawRepresentation: priv)
        else { return nil }
        self.publicKey = pub
        self.privateKey = key
        // El RFC pide un `mailto:` o un `https:`; si no lo es, no se manda uno inventado.
        self.subject = subject ?? "mailto:hola@fontapp.net"
    }

    /// La cabecera `Authorization` para un endpoint concreto.
    ///
    /// El `aud` es **el origen del endpoint** y no el nuestro: es lo que impide que un
    /// token robado sirva para empujar avisos a través de otro servicio. Por eso se firma
    /// uno por destino y no uno global.
    func authorization(paraEndpoint endpoint: String, ahora: Date = Date()) -> String? {
        guard let url = URL(string: endpoint), let host = url.host,
              let scheme = url.scheme else { return nil }
        let aud = "\(scheme)://\(host)"
        // Doce horas: el RFC topa en 24 y firmar uno por envío no cuesta nada, pero un
        // plazo corto rompe si el reloj de la máquina va desviado.
        let exp = Int(ahora.addingTimeInterval(12 * 3600).timeIntervalSince1970)

        let header = #"{"typ":"JWT","alg":"ES256"}"#
        let payload = #"{"aud":"\#(aud)","exp":\#(exp),"sub":"\#(subject)"}"#
        let firmado = "\(Data(header.utf8).base64URL).\(Data(payload.utf8).base64URL)"
        guard let firma = try? privateKey.signature(for: Data(firmado.utf8)) else { return nil }
        // ES256 es r||s en crudo, NO el DER que devuelve `derRepresentation`. Con DER el
        // servidor de push responde 401 y el mensaje no dice cuál de las dos cosas falla.
        return "vapid t=\(firmado).\(firma.rawRepresentation.base64URL), k=\(publicKey.base64URL)"
    }
}

private struct VapidKey: StorageKey { typealias Value = Vapid }

extension Application {
    /// Las claves de VAPID, o `nil` si no están configuradas. Se leen una vez al arrancar.
    var vapid: Vapid? {
        get { storage[VapidKey.self] }
        set { storage[VapidKey.self] = newValue }
    }
}

extension Request {
    var vapid: Vapid? { application.vapid }
}
