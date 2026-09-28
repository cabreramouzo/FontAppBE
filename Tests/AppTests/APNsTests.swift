import Crypto
import Foundation
import XCTVapor
@testable import App

/// El token con el que el servidor se presenta a Apple.
final class APNsTests: XCTestCase {
    func testSinClaveNoHayPushDeIOSYNoEsUnError() {
        XCTAssertNil(APNs(keyID: nil, teamID: nil, key: nil, topic: nil))
        XCTAssertNil(APNs(keyID: "K", teamID: "T", key: "no es un pem", topic: "net.fontapp.FontApp"))
    }

    /// Fly guarda el `.p8` en una línea con `\n` escritos: se acepta así también.
    func testElPemEnUnaLineaTambienVale() throws {
        let pem = P256.Signing.PrivateKey().pemRepresentation.replacingOccurrences(of: "\n", with: "\\n")
        XCTAssertNotNil(APNs(keyID: "ABC123DEFG", teamID: "7V6773B2EX", key: pem, topic: "net.fontapp.FontApp"))
    }

    func testElTokenLlevaEquipoYClaveYSeReutiliza() throws {
        let apns = try XCTUnwrap(APNs(keyID: "ABC123DEFG", teamID: "7V6773B2EX",
                                      key: P256.Signing.PrivateKey().pemRepresentation, topic: "net.fontapp.FontApp"))
        let jwt = try XCTUnwrap(apns.bearer())
        let trozos = jwt.split(separator: ".")
        XCTAssertEqual(trozos.count, 3)
        let header = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(Data.fromBase64URL(String(trozos[0])))) as? [String: Any])
        let claims = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(Data.fromBase64URL(String(trozos[1])))) as? [String: Any])
        XCTAssertEqual(header["kid"] as? String, "ABC123DEFG")
        XCTAssertEqual(claims["iss"] as? String, "7V6773B2EX")
        XCTAssertEqual(try XCTUnwrap(Data.fromBase64URL(String(trozos[2]))).count, 64, "ES256 en crudo, no DER")
        // Apple rechaza a quien firma uno por envío.
        XCTAssertEqual(apns.bearer(), jwt)
    }
}
