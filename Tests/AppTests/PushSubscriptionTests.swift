import Crypto
import Foundation
import XCTVapor
@testable import App

/// VAPID y el texto de los avisos. Lo que no es criptografía pero falla igual de callado.
final class PushSubscriptionTests: XCTestCase {
    private func claves() -> (String, String) {
        let k = P256.Signing.PrivateKey()
        return (k.publicKey.x963Representation.base64URL, k.rawRepresentation.base64URL)
    }

    func testSinClavesNoHayPushYNoEsUnError() {
        XCTAssertNil(Vapid(publicKey: nil, privateKey: nil, subject: nil))
        XCTAssertNil(Vapid(publicKey: "no-es-una-clave", privateKey: "tampoco", subject: nil))
    }

    /// El `aud` es **el origen del endpoint** y no el nuestro: es lo que impide que un
    /// token capturado sirva para empujar avisos por otro servicio.
    func testElTokenVaFirmadoParaElDestinoConcreto() throws {
        let (pub, priv) = claves()
        let vapid = try XCTUnwrap(Vapid(publicKey: pub, privateKey: priv, subject: "mailto:a@b.c"))
        let cabecera = try XCTUnwrap(vapid.authorization(paraEndpoint: "https://fcm.googleapis.com/fcm/send/xyz"))

        XCTAssertTrue(cabecera.hasPrefix("vapid t="))
        XCTAssertTrue(cabecera.contains(", k=\(pub)"), "la clave pública viaja en la cabecera")

        let jwt = String(cabecera.dropFirst("vapid t=".count).split(separator: ",")[0])
        let trozos = jwt.split(separator: ".")
        XCTAssertEqual(trozos.count, 3)
        let payload = try XCTUnwrap(Data.fromBase64URL(String(trozos[1])))
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: payload) as? [String: Any])
        XCTAssertEqual(json["aud"] as? String, "https://fcm.googleapis.com",
                       "el aud es el ORIGEN del endpoint, sin la ruta")
        XCTAssertEqual(json["sub"] as? String, "mailto:a@b.c")

        // ES256 es r||s en crudo: 64 bytes. Con el DER que devuelve `derRepresentation`
        // el servicio de push responde 401 y no dice cuál de las dos cosas está mal.
        let firma = try XCTUnwrap(Data.fromBase64URL(String(trozos[2])))
        XCTAssertEqual(firma.count, 64)
    }

    func testUnEndpointQueNoEsUnaURLNoRevienta() throws {
        let (pub, priv) = claves()
        let vapid = try XCTUnwrap(Vapid(publicKey: pub, privateKey: priv, subject: nil))
        XCTAssertNil(vapid.authorization(paraEndpoint: "no es una url"))
    }

    /// Tres de cada cuatro fuentes NO tienen topónimo: este caso es el normal, no el raro.
    /// Sin esto llegaría una notificación titulada «null» o en blanco.
    func testUnaFuenteSinNombreSeNombraEnTuIdioma() {
        XCTAssertEqual(PushCopy.nombre(nil, lang: "es"), "una fuente sin nombre")
        XCTAssertEqual(PushCopy.nombre("   ", lang: "fr"), "une fontaine sans nom")
        XCTAssertEqual(PushCopy.nombre("Font del Saüc", lang: "es"), "Font del Saüc")
        XCTAssertEqual(PushCopy.nombre(nil, lang: nil), "una font sense nom", "por defecto, catalán")
    }

    /// El servidor pone las palabras aquí —al revés que en la campana— porque un push lo
    /// pinta el sistema, fuera de la app. Se usa `users.lang`, como en los correos.
    func testElTextoVaEnElIdiomaDeQuienLoRecibe() {
        let (_, es) = PushCopy.fontUpdate(code: "review:dry", fontName: "Font Vella", lang: "es")
        let (_, en) = PushCopy.fontUpdate(code: "review:dry", fontName: "Font Vella", lang: "en")
        XCTAssertNotEqual(es, en)
        XCTAssertTrue(es.contains("no sale agua"))
        XCTAssertTrue(en.contains("no water"))
    }

    /// El título es el nombre de la fuente: es lo único que se lee seguro en la pantalla
    /// de bloqueo, donde el cuerpo se corta.
    func testElTituloEsLaFuente() {
        let (titulo, _) = PushCopy.fontUpdate(code: "report", fontName: "Font del Ferro", lang: "ca")
        XCTAssertEqual(titulo, "Font del Ferro")
    }

    /// «Sale agua» y «no sale agua» son la diferencia entre desviarte tres kilómetros o
    /// no. Si se cruzaran, el aviso mentiría y nadie lo notaría desde el servidor.
    func testDistingueElAguaDeLaSequia() {
        for seco in ["review:dry", "review:broken", "review:gone"] {
            XCTAssertTrue(PushCopy.fontUpdate(code: seco, fontName: "x", lang: "es").1.contains("no sale"),
                          "\(seco) debería decir que no sale agua")
        }
        for agua in ["review:flowing", "review:trickle"] {
            XCTAssertTrue(PushCopy.fontUpdate(code: agua, fontName: "x", lang: "es").1.contains("sale agua"),
                          "\(agua) debería decir que sale agua")
            XCTAssertFalse(PushCopy.fontUpdate(code: agua, fontName: "x", lang: "es").1.contains("no sale"))
        }
    }

    /// Los avisos viejos tienen que sobrevivir a un servidor nuevo: un código que no
    /// conozcamos cae en el genérico en vez de llegar en blanco.
    func testUnCodigoDesconocidoNoDejaElAvisoVacio() {
        let (_, cuerpo) = PushCopy.fontUpdate(code: "inventado:2030", fontName: "x", lang: "es")
        XCTAssertEqual(cuerpo, "Ha cambiado algo")
    }

    /// Las claves llegan en base64url desde el navegador; una suscripción con claves de
    /// otro tamaño no puede descifrar nada y no debe llegar a la base de datos.
    func testUnaSuscripcionConClavesRotasSeDetecta() {
        let buena = PushSubscription(userID: UUID(),
                                     endpoint: "https://x/y",
                                     p256dh: Data(P256.KeyAgreement.PrivateKey().publicKey.x963Representation).base64URL,
                                     auth: Data(count: 16).base64URL)
        XCTAssertNotNil(buena.suscriptor)

        let corta = PushSubscription(userID: UUID(), endpoint: "https://x/y",
                                     p256dh: Data(count: 10).base64URL, auth: Data(count: 16).base64URL)
        XCTAssertNil(corta.suscriptor, "una clave de 10 bytes no es una clave P-256")

        let sinAuth = PushSubscription(userID: UUID(), endpoint: "https://x/y",
                                       p256dh: Data(P256.KeyAgreement.PrivateKey().publicKey.x963Representation).base64URL,
                                       auth: Data(count: 8).base64URL)
        XCTAssertNil(sinAuth.suscriptor, "el secreto de autenticación son 16 bytes")
    }
}
