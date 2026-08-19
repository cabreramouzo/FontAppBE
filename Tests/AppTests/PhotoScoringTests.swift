@testable import App
import Fluent
import XCTVapor

/// Lo que paga una foto, contado sobre la base de verdad.
///
/// Estos tests existen por un fallo que **no rompía nada visible**: una foto que llegaba
/// dentro de una reseña dejaba dos rastros —la reseña con imagen y la edición que la
/// asciende a portada— y el baremo cobraba las dos, «primera foto» *más* «foto
/// sustituida». Quince gotas de más a todo el que hiciera lo más normal del mundo. No lo
/// habría cazado ningún test de los que había: los de arriba comprueban que la foto queda
/// puesta, y quedaba puesta.
///
/// Se puntúa con `ContributionScore.compute`, que lee la base entera. En el test la base
/// solo tiene lo que pone cada caso, así que se puede afirmar el número exacto.
final class PhotoScoringTests: XCTestCase {
    private func withApp(_ test: (Application) async throws -> Void) async throws {
        setenv("DATABASE_NAME", "fontapp_test", 1)
        let app = try await Application.make(.testing)
        do {
            try await configure(app)
            try? await app.autoRevert()
            try await app.autoMigrate()
            app.imageStorage = StubStorage()
            try await test(app)
            try await app.autoRevert()
        } catch {
            try? await app.autoRevert()
            try await app.asyncShutdown()
            throw error
        }
        try await app.asyncShutdown()
    }

    private struct StubStorage: ImageStorage {
        func save(_ data: ByteBuffer, ext: String) async throws -> String { "/uploads/stub.\(ext)" }
        func delete(_ reference: String) async throws {}
        func copy(_ reference: String) async throws -> String { "/uploads/copia-\(UUID().uuidString).jpg" }
    }

    private func bearer(_ token: String) -> HTTPHeaders { ["Authorization": "Bearer \(token)"] }

    private func usuario(_ app: Application, _ username: String) async throws -> String {
        try await app.test(.POST, "users") { req in
            try req.content.encode(CreateUserDTO(name: username, username: username,
                                                 email: "\(username)@example.com", password: "password123"))
        } afterResponse: { res in XCTAssertEqual(res.status, .created) }
        var token = ""
        try await app.test(.POST, "auth/login", beforeRequest: { req in
            req.headers.basicAuthorization = .init(username: username, password: "password123")
        }, afterResponse: { res in token = try res.content.decode(LoginResponse.self).token })
        return token
    }

    private struct FontOut: Content { let id: UUID? }
    private func fuente(_ app: Application, _ token: String, _ nombre: String,
                        lat: Double = 41.0, long: Double = 2.0) async throws -> UUID {
        var id = UUID()
        try await app.test(.POST, "fonts", headers: bearer(token), beforeRequest: { req in
            try req.content.encode(CreateFontDTO(name: nombre, latitude: lat, longitude: long,
                                                 image: nil, description: nil, source: nil, drinkable: nil))
        }, afterResponse: { res in
            XCTAssertEqual(res.status, .created)
            id = try XCTUnwrap(res.content.decode(FontOut.self).id)
        })
        return id
    }

    private struct PhotoDTO: Content { let image: String }
    private struct NewComment: Content { let body: String; let waterStatus: String?; let image: String? }

    /// Las aportaciones de foto sobre una fuente, en orden, **con a quién se le pagan**.
    ///
    /// El nombre importa tanto como el tipo: si la edición que pone la foto se queda sin
    /// firmar, el baremo no se calla —tiene una regla de reserva que se la atribuye al
    /// creador de la fuente—. Mirando solo el tipo, ese caso pasa el test y la foto se le
    /// paga a quien no fue.
    private func fotosDe(_ app: Application, _ fontID: UUID) async throws -> [(ContributionScore.Kind, String)] {
        let informe = try await ContributionScore.compute(on: app.db)
        let nombres = Dictionary(uniqueKeysWithValues: informe.users.map { ($0.userID, $0.username) })
        return informe.contributions
            .filter { $0.fontID == fontID && ($0.kind == .firstPhoto || $0.kind == .photoReplaced) }
            .sorted { $0.at < $1.at }
            .map { ($0.kind, nombres[$0.userID] ?? "?") }
    }

    private func iguales(_ a: [(ContributionScore.Kind, String)],
                         _ b: [(ContributionScore.Kind, String)]) -> Bool {
        a.count == b.count && zip(a, b).allSatisfy { $0.0 == $1.0 && $0.1 == $1.1 }
    }

    /// Subir la foto por la ruta directa paga «primera foto». Es la mitad que se puede
    /// romper sin enterarse: la aportación se deduce de la edición que cambia `image`, así
    /// que basta con dejar de firmar esa edición para que deje de pagarse.
    func testDirectPhotoUploadPaysFirstPhotoToWhoeverTookIt() async throws {
        try await withApp { app in
            // La sube alguien que NO creó la fuente, que es el caso para el que existe
            // todo esto: casi ninguna fuente importada tiene creador. Y de paso es el
            // único montaje en el que se nota si la aportación se atribuye mal.
            let dueña = try await usuario(app, "duenya")
            let fotografa = try await usuario(app, "fotografa")
            let id = try await fuente(app, dueña, "Sin foto")
            try await app.test(.PUT, "fonts/\(id)/photo", headers: bearer(fotografa), beforeRequest: { req in
                try req.content.encode(PhotoDTO(image: "/uploads/a.jpg"))
            }, afterResponse: { res in XCTAssertEqual(res.status, .ok) })

            let fotos = try await fotosDe(app, id)
            XCTAssertTrue(iguales(fotos, [(.firstPhoto, "fotografa")]), "\(fotos)")
        }
    }

    /// **El fallo, fijado.** La foto de una reseña se cobra UNA vez, aunque deje dos
    /// rastros. Si alguien vuelve a firmar la edición de `CoverPhoto`, esto sale en rojo.
    func testReviewPhotoIsPaidOnceEvenThoughItLeavesTwoTrails() async throws {
        try await withApp { app in
            let tok = try await usuario(app, "resenyadora")
            let id = try await fuente(app, tok, "Sin foto")
            try await app.test(.POST, "fonts/\(id)/comments", headers: bearer(tok), beforeRequest: { req in
                try req.content.encode(NewComment(body: "raja", waterStatus: "flowing", image: "/uploads/b.jpg"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                XCTAssertTrue(try res.content.decode(CommentResponse.self).coverAdopted)
            })

            // Exactamente una, y la buena: `[.firstPhoto, .photoReplaced]` es el fallo que
            // hubo, y `[.photoReplaced]` sería el otro extremo —que la edición se colara
            // delante y le robara el puesto a quien hizo la foto.
            let fotos = try await fotosDe(app, id)
            XCTAssertTrue(iguales(fotos, [(.firstPhoto, "resenyadora")]), "\(fotos)")
        }
    }

    /// Y la contraria, para que arreglar lo de arriba no se lleve por delante lo legítimo:
    /// sustituir una foto por otra **sí** es una aportación aparte.
    func testReplacingAPhotoIsStillPaidSeparately() async throws {
        try await withApp { app in
            let tok = try await usuario(app, "duenya")
            let id = try await fuente(app, tok, "Con foto")
            for ref in ["/uploads/1.jpg", "/uploads/2.jpg"] {
                try await app.test(.PUT, "fonts/\(id)/photo", headers: bearer(tok), beforeRequest: { req in
                    try req.content.encode(PhotoDTO(image: ref))
                }, afterResponse: { res in XCTAssertEqual(res.status, .ok) })
            }

            let fotos = try await fotosDe(app, id)
            XCTAssertTrue(iguales(fotos, [(.firstPhoto, "duenya"), (.photoReplaced, "duenya")]), "\(fotos)")
        }
    }

    /// Y lo que ve el usuario al final: la insignia. Cinco primeras fotos por la ruta
    /// directa tienen que dar «Primera luz» en bronce. Es el umbral publicado
    /// (`firstLight`, [5, 25, 100]), y esto lo ata a la ruta nueva.
    func testFivePhotosEarnFirstLightBronze() async throws {
        try await withApp { app in
            let tok = try await usuario(app, "coleccionista")
            for i in 0..<5 {
                let id = try await fuente(app, tok, "Fuente \(i)", lat: 41.0 + Double(i) / 100, long: 2.0)
                try await app.test(.PUT, "fonts/\(id)/photo", headers: bearer(tok), beforeRequest: { req in
                    try req.content.encode(PhotoDTO(image: "/uploads/\(i).jpg"))
                }, afterResponse: { res in XCTAssertEqual(res.status, .ok) })
            }

            let informe = try await ContributionScore.compute(on: app.db)
            let yo = try XCTUnwrap(informe.users.first { $0.username == "coleccionista" })
            let luz = yo.badges.first { $0.key == "firstLight" }
            XCTAssertEqual(luz?.tier, .bronze)
        }
    }
}
