import Crypto
import Foundation
import XCTest
@testable import App

/// El cifrado del Web Push (RFC 8291 + 8188).
///
/// Se prueba **descifrando lo que ciframos con la clave privada del navegador**, que es
/// exactamente lo que hace un móvil al recibirlo. Sin esto, la única forma de saber si
/// funciona sería mandar un push a un teléfono y mirar — y cuando falla no dice por qué:
/// el navegador descarta el mensaje en silencio y en el servidor todo parece correcto.
final class WebPushTests: XCTestCase {
    /// Un navegador de mentira: su par de claves y su secreto de autenticación.
    private func navegador() -> (P256.KeyAgreement.PrivateKey, Data, WebPush.Subscriber) {
        let priv = P256.KeyAgreement.PrivateKey()
        let auth = Data((0..<16).map { _ in UInt8.random(in: .min ... .max) })
        return (priv, auth, .init(p256dh: priv.publicKey.x963Representation, auth: auth))
    }

    func testElNavegadorPuedeDescifrarLoQueCiframos() throws {
        let (priv, auth, sub) = navegador()
        let mensaje = Data(#"{"code":"review:dry","font":"Font del Saüc"}"#.utf8)
        let cuerpo = try WebPush.cifra(mensaje, para: sub)
        XCTAssertEqual(try WebPush.descifra(cuerpo, con: priv, auth: auth), mensaje)
    }

    /// Los acentos y las eñes son el pan de esta app: siete idiomas y topónimos.
    func testSobreviveElUTF8() throws {
        let (priv, auth, sub) = navegador()
        let mensaje = Data("Montanyà · s'ha assecat — «avís»".utf8)
        XCTAssertEqual(try WebPush.descifra(try WebPush.cifra(mensaje, para: sub),
                                            con: priv, auth: auth), mensaje)
    }

    /// La clave efímera va **en claro** dentro del cuerpo, y tiene que ser nueva cada vez.
    /// Reutilizarla con la misma sal repetiría el nonce del AES-GCM, que es la forma
    /// clásica de romper GCM del todo.
    func testCadaEnvioLlevaClaveYSalNuevas() throws {
        let (_, _, sub) = navegador()
        let m = Data("hola".utf8)
        let a = try WebPush.cifra(m, para: sub)
        let b = try WebPush.cifra(m, para: sub)
        XCTAssertNotEqual(a.prefix(16), b.prefix(16), "la sal se está repitiendo")
        XCTAssertNotEqual(a.subdata(in: 21..<86), b.subdata(in: 21..<86),
                          "la clave efímera se está repitiendo")
    }

    /// El navegador necesita leer la cabecera para derivar la clave: si la forma no es
    /// exacta, no descifra nada y no dice por qué.
    func testLaCabeceraTieneLaFormaDelRFC() throws {
        let (_, _, sub) = navegador()
        let cuerpo = try WebPush.cifra(Data("x".utf8), para: sub)
        XCTAssertEqual(cuerpo.count > 86, true)
        // salt(16) | rs(4) | idlen(1) | clave(65)
        XCTAssertEqual(Array(cuerpo[16..<20]), [0x00, 0x00, 0x10, 0x00], "rs debe ser 4096")
        XCTAssertEqual(cuerpo[20], 65, "la clave P-256 sin comprimir mide 65 bytes")
        XCTAssertEqual(cuerpo[21], 0x04, "una clave x9.63 sin comprimir empieza por 0x04")
    }

    /// Otra suscripción no puede leer el aviso de nadie. Es lo que ata el mensaje a un
    /// destinatario, y si se rompiera no daría ningún error visible.
    func testOtroNavegadorNoLoDescifra() throws {
        let (_, _, sub) = navegador()
        let (otroPriv, otroAuth, _) = navegador()
        let cuerpo = try WebPush.cifra(Data("secreto".utf8), para: sub)
        XCTAssertThrowsError(try WebPush.descifra(cuerpo, con: otroPriv, auth: otroAuth))
    }

    func testUnaClaveQueNoEsUnaClaveNoRevienta() {
        let sub = WebPush.Subscriber(p256dh: Data([1, 2, 3]), auth: Data(count: 16))
        XCTAssertThrowsError(try WebPush.cifra(Data("x".utf8), para: sub))
    }

    func testBase64URLVaYVuelve() throws {
        let d = Data((0..<64).map { _ in UInt8.random(in: .min ... .max) })
        XCTAssertEqual(Data.fromBase64URL(d.base64URL), d)
        XCTAssertFalse(d.base64URL.contains("="), "base64url no lleva relleno")
        // Lo que pegaría alguien a mano desde una consola:
        XCTAssertEqual(Data.fromBase64URL(d.base64EncodedString()), d)
    }
}
