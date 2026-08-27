import Crypto
import Foundation

/// El protocolo Web Push, escrito a mano y sin dependencias nuevas.
///
/// ## Por qué a mano
///
/// Son dos RFC pequeños y muy cerrados —**8291** (cómo se cifra el mensaje) y **8188**
/// (el formato `aes128gcm`)— más un JWT de los de siempre. Todo lo que hace falta ya está
/// en el proyecto: `swift-crypto` trae P-256, HKDF y AES-GCM, y JWTKit firma el ES256 de
/// VAPID. Meter una dependencia sin mantenimiento conocido para ~120 líneas de
/// criptografía estándar sería peor negocio.
///
/// ## Lo que NO se puede hacer, y por qué esto tiene que cifrar
///
/// Un push «vacío» (sin cuerpo) no necesita cifrado y sería mucho más simple: el service
/// worker se despierta y pide los avisos al servidor. Pero **no puede**: el token de sesión
/// vive en `localStorage` y un service worker no lo ve, y si la app está cerrada tampoco
/// hay ninguna pestaña a la que preguntárselo. Así que o el texto viaja dentro del push, o
/// no hay texto. Y el texto es justo lo que hace que un aviso sirva de algo.
///
/// ## La forma del cuerpo (RFC 8188)
///
///     salt(16) | rs(4, big endian) | idlen(1) | clave pública efímera(65) | cifrado
///
/// El navegador necesita la clave efímera para poder derivar la misma clave que nosotros,
/// así que va **en claro** dentro del propio cuerpo. Lo secreto es el acuerdo ECDH.
enum WebPush {
    /// Lo que el navegador nos dio al suscribirse. Las dos claves llegan en base64url.
    struct Subscriber {
        /// Clave pública del navegador (P-256 sin comprimir, 65 bytes).
        let p256dh: Data
        /// El secreto de autenticación (16 bytes). Es la sal del primer HKDF.
        let auth: Data
    }

    enum Fallo: Error {
        case claveInvalida
        case demasiadoLargo
    }

    /// El tope del RFC para un solo registro. En la práctica los navegadores aceptan
    /// bastante menos, así que los textos van cortos de todas formas.
    static let maxPayload = 3800

    /// Cifra `mensaje` para `quien`, devolviendo el cuerpo listo para enviar.
    ///
    /// `efimera` se puede fijar desde un test para que el resultado sea reproducible; en
    /// producción se genera una por envío, que es lo que exige el RFC.
    static func cifra(
        _ mensaje: Data,
        para quien: Subscriber,
        efimera: P256.KeyAgreement.PrivateKey = .init(),
        salt: Data = Data((0..<16).map { _ in UInt8.random(in: .min ... .max) })
    ) throws -> Data {
        guard mensaje.count <= maxPayload else { throw Fallo.demasiadoLargo }
        guard let ua = try? P256.KeyAgreement.PublicKey(x963Representation: quien.p256dh) else {
            throw Fallo.claveInvalida
        }
        let asPub = efimera.publicKey.x963Representation
        let compartido = try efimera.sharedSecretFromKeyAgreement(with: ua)

        // Primer HKDF: mezcla el acuerdo ECDH con el secreto de autenticación. El `info`
        // incluye **las dos claves públicas**, y ese es el detalle que ata el mensaje a
        // esta suscripción concreta: con otra clave del navegador no se descifra.
        var info = Data("WebPush: info\0".utf8)
        info.append(quien.p256dh)
        info.append(asPub)
        let ikm = compartido.hkdfDerivedSymmetricKey(
            using: SHA256.self, salt: quien.auth, sharedInfo: info, outputByteCount: 32)

        // Segundo y tercero: de ahí salen la clave y el nonce del AES-GCM. La sal es la
        // misma que viaja en la cabecera del cuerpo, o el navegador no podría repetirlo.
        let cek = HKDF<SHA256>.deriveKey(
            inputKeyMaterial: ikm, salt: salt,
            info: Data("Content-Encoding: aes128gcm\0".utf8), outputByteCount: 16)
        let nonce = HKDF<SHA256>.deriveKey(
            inputKeyMaterial: ikm, salt: salt,
            info: Data("Content-Encoding: nonce\0".utf8), outputByteCount: 12)

        // El 0x02 es el delimitador de «último registro» del RFC 8188. Sin él, el
        // navegador descifra bien y **descarta el mensaje**, que es de los fallos más
        // desagradables: todo parece correcto y no llega nada.
        var claro = mensaje
        claro.append(0x02)
        let sellado = try AES.GCM.seal(
            claro, using: SymmetricKey(data: cek),
            nonce: try AES.GCM.Nonce(data: nonce.withUnsafeBytes { Data($0) }))

        var cuerpo = Data()
        cuerpo.append(salt)
        cuerpo.append(contentsOf: withUnsafeBytes(of: UInt32(4096).bigEndian) { Array($0) })
        cuerpo.append(UInt8(asPub.count))
        cuerpo.append(asPub)
        cuerpo.append(sellado.ciphertext)
        cuerpo.append(sellado.tag)
        return cuerpo
    }

    /// Descifra un cuerpo. **Solo existe para los tests**: es lo que hace el navegador, y
    /// sin ella la única forma de comprobar el cifrado sería mandarlo a un móvil y mirar.
    static func descifra(_ cuerpo: Data, con privada: P256.KeyAgreement.PrivateKey,
                         auth: Data) throws -> Data {
        let salt = cuerpo.prefix(16)
        let idlen = Int(cuerpo[cuerpo.startIndex + 20])
        let asPub = cuerpo.subdata(in: (cuerpo.startIndex + 21)..<(cuerpo.startIndex + 21 + idlen))
        let resto = cuerpo.suffix(from: cuerpo.startIndex + 21 + idlen)

        let compartido = try privada.sharedSecretFromKeyAgreement(
            with: try P256.KeyAgreement.PublicKey(x963Representation: asPub))
        var info = Data("WebPush: info\0".utf8)
        info.append(privada.publicKey.x963Representation)
        info.append(asPub)
        let ikm = compartido.hkdfDerivedSymmetricKey(
            using: SHA256.self, salt: auth, sharedInfo: info, outputByteCount: 32)
        let cek = HKDF<SHA256>.deriveKey(inputKeyMaterial: ikm, salt: salt,
                                         info: Data("Content-Encoding: aes128gcm\0".utf8),
                                         outputByteCount: 16)
        let nonce = HKDF<SHA256>.deriveKey(inputKeyMaterial: ikm, salt: salt,
                                           info: Data("Content-Encoding: nonce\0".utf8),
                                           outputByteCount: 12)
        let caja = try AES.GCM.SealedBox(
            nonce: try AES.GCM.Nonce(data: nonce.withUnsafeBytes { Data($0) }),
            ciphertext: resto.dropLast(16), tag: resto.suffix(16))
        let claro = try AES.GCM.open(caja, using: SymmetricKey(data: cek))
        return claro.dropLast()   // el delimitador 0x02
    }
}

extension Data {
    /// base64url sin relleno: es lo que usan VAPID y las claves de la suscripción.
    var base64URL: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// Lee base64url **y también base64 normal**: los navegadores mandan la primera, pero
    /// quien pruebe con `curl` a mano casi siempre pega la segunda.
    static func fromBase64URL(_ s: String) -> Data? {
        var t = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while t.count % 4 != 0 { t += "=" }
        return Data(base64Encoded: t)
    }
}
