import Crypto
import Foundation
import Vapor

/// APNs: los avisos de la app de iOS.
///
/// Web Push llega al navegador; la app nativa no tiene navegador y recibe los avisos del
/// servicio de Apple. El **texto es el mismo** (`PushCopy`, en el idioma de la cuenta) y
/// las **reglas de cuándo avisar también**: esto es solo otro cable, no otra política.
///
/// ## Configuración, no código
///
/// Se autentica con la clave `.p8` de la cuenta de desarrollador (token-based auth), que
/// sirve para todas las apps del equipo y no caduca, al revés que los certificados:
///
/// - `APNS_KEY_ID`: el identificador de la clave (10 caracteres).
/// - `APNS_TEAM_ID`: el del equipo.
/// - `APNS_KEY`: el contenido del `.p8` (PEM). En Fly, un secreto: nunca en el repo.
/// - `APNS_TOPIC`: el bundle id de la app. Opcional: por defecto `net.fontapp.FontApp`.
///   No es un secreto, y faltar solo él dejaba el push de iOS apagado sin decir nada.
///
/// Sin ellas no hay push de iOS y no es un error, igual que sin VAPID.
///
/// ## Sandbox y producción
///
/// Un iPhone con la app instalada desde Xcode tiene un token de **sandbox**; desde
/// TestFlight o la App Store, de producción. Los dos servidores de Apple no se entienden
/// entre sí (un token de sandbox en producción da `BadDeviceToken`), así que la app dice
/// cuál es el suyo al registrarse y se guarda con el aparato.
struct APNs: Sendable {
    let keyID: String
    let teamID: String
    let topic: String
    private let key: P256.Signing.PrivateKey
    private let token = TokenCache()

    static let defaultTopic = "net.fontapp.FontApp"

    init?(keyID: String?, teamID: String?, key pem: String?, topic: String?) {
        let topic = topic ?? Self.defaultTopic
        guard let keyID, let teamID, let pem,
              let key = try? P256.Signing.PrivateKey(pemRepresentation: pem.replacingOccurrences(of: "\\n", with: "\n"))
        else { return nil }
        self.keyID = keyID
        self.teamID = teamID
        self.topic = topic
        self.key = key
    }

    /// Apple pide renovar el token entre 20 y 60 minutos, y rechaza (`TooManyProviderTokenUpdates`)
    /// a quien firma uno por envío. Se guarda 40 minutos.
    final class TokenCache: @unchecked Sendable {
        private let lock = NSLock()
        private var value: (jwt: String, at: Date)?

        func get(_ make: () -> String?) -> String? {
            lock.lock(); defer { lock.unlock() }
            if let value, Date().timeIntervalSince(value.at) < 40 * 60 { return value.jwt }
            guard let jwt = make() else { return nil }
            value = (jwt, Date())
            return jwt
        }
    }

    func bearer() -> String? {
        token.get {
            let header = #"{"alg":"ES256","kid":"\#(keyID)"}"#
            let claims = #"{"iss":"\#(teamID)","iat":\#(Int(Date().timeIntervalSince1970))}"#
            let firmado = "\(Data(header.utf8).base64URL).\(Data(claims.utf8).base64URL)"
            // Como en VAPID: ES256 es r||s en crudo, no DER.
            guard let firma = try? key.signature(for: Data(firmado.utf8)) else { return nil }
            return "\(firmado).\(firma.rawRepresentation.base64URL)"
        }
    }

    enum Resultado { case enviado, tokenMuerto, fallo(Int) }

    /// Manda un aviso a un aparato. `url` es la ruta de la web (`/fonts/<id>`): la app
    /// la abre igual que un enlace universal.
    func send(_ aviso: PushSender.Aviso, to device: ApnsDevice, client: any Client) async throws -> Resultado {
        guard let bearer = bearer() else { return .fallo(0) }
        let host = device.sandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com"
        struct Alert: Encodable { let title: String; let body: String }
        struct Aps: Encodable {
            let alert: Alert
            let sound = "default"
            let threadID: String
            enum CodingKeys: String, CodingKey { case alert, sound, threadID = "thread-id" }
        }
        struct Payload: Encodable { let aps: Aps; let url: String }
        let payload = Payload(aps: Aps(alert: Alert(title: aviso.title, body: aviso.body), threadID: aviso.tag),
                              url: aviso.url)

        let res = try await client.post(URI(string: "https://\(host)/3/device/\(device.token)")) { req in
            req.headers.replaceOrAdd(name: .authorization, value: "bearer \(bearer)")
            req.headers.replaceOrAdd(name: "apns-topic", value: topic)
            req.headers.replaceOrAdd(name: "apns-push-type", value: "alert")
            // Como el TTL de Web Push: pasado un día, la noticia ya no lo es.
            req.headers.replaceOrAdd(name: "apns-expiration", value: String(Int(Date().timeIntervalSince1970) + 86_400))
            req.headers.replaceOrAdd(name: "apns-priority", value: "5")
            // Mismo papel que el `tag` de Web Push: el aviso nuevo sustituye al anterior.
            req.headers.replaceOrAdd(name: "apns-collapse-id", value: String(aviso.tag.prefix(64)))
            try req.content.encode(payload, as: .json)
        }
        switch res.status.code {
        case 200: return .enviado
        // 410 Unregistered: desinstalada o permiso quitado. 400 BadDeviceToken: token de
        // otro entorno o corrupto. Las dos cosas no se arreglan reintentando.
        case 410: return .tokenMuerto
        case 400 where (res.body.map { String(buffer: $0) } ?? "").contains("BadDeviceToken"): return .tokenMuerto
        default: return .fallo(Int(res.status.code))
        }
    }
}

private struct APNsKey: StorageKey { typealias Value = APNs }

extension Application {
    /// APNs, o `nil` si no está configurado. Se lee una vez al arrancar.
    var apns: APNs? {
        get { storage[APNsKey.self] }
        set { storage[APNsKey.self] = newValue }
    }
}
