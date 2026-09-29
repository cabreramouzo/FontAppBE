import Fluent
import XCTVapor
@testable import App

/// «Si esto no añade nada, cuéntalo como que sigue igual» (`confirmIfUnchanged`).
///
/// Los tres chips del globo del mapa solo sabían crear reseñas, así que decir «sale agua»
/// sobre una fuente que ya lo decía desde hacía una hora publicaba un parte repetido en
/// lugar de respaldar el que había — que es lo que significa el botón «sigue igual» de la
/// ficha. Se perdía justo la verificación ajena, que es lo que hace que una fuente llegue a
/// «confirmada».
///
/// **La decisión vive en el servidor a propósito.** Tomándola en el cliente habría que
/// repetirla en `sw.js` —que es un espejo de la bandeja de salida y no puede importar de
/// `src/`— y, peor, una cola que se vacía tres días después colgaría el «sigue igual» de un
/// parte que para entonces puede estar superado o borrado. Mandando la intención y
/// resolviéndola aquí, sin cobertura pasa exactamente lo mismo que con ella.
final class QuickConfirmTests: XCTestCase {
    private func withApp(_ test: (Application) async throws -> Void) async throws {
        setenv("DATABASE_NAME", "fontapp_test", 1)
        let app = try await Application.make(.testing)
        do {
            try await configure(app)
            try? await app.autoRevert()
            try await app.autoMigrate()
            try await test(app)
            try await app.autoRevert()
        } catch {
            try? await app.autoRevert()
            try await app.asyncShutdown()
            throw error
        }
        try await app.asyncShutdown()
    }

    private func usuario(_ app: Application, _ nombre: String) async throws -> (User, String) {
        let n = Int.random(in: 1...999_999)
        let u = User(name: nombre, username: "\(nombre)\(n)", email: "\(nombre)\(n)@x.test",
                     passwordHash: try Bcrypt.hash("password123"))
        try await u.save(on: app.db)
        var token = ""
        try await app.test(.POST, "auth/login", beforeRequest: { req in
            req.headers.basicAuthorization = .init(username: "\(nombre)\(n)", password: "password123")
        }, afterResponse: { res in token = try res.content.decode(LoginResponse.self).token })
        return (u, token)
    }

    private func fuente(_ app: Application) async throws -> Font {
        let f = Font(name: "Font del Roure", latitude: 41.75, longitude: 2.16)
        try await f.save(on: app.db)
        return f
    }

    /// Un parte de `autor` sobre `f`, con la antigüedad que haga falta.
    @discardableResult
    private func parte(_ app: Application, en f: Font, de autor: User, estado: String,
                       hace dias: Double = 0) async throws -> FontComment {
        let c = FontComment(fontID: try f.requireID(), userID: try autor.requireID(),
                            body: "", rating: nil, waterStatus: estado, image: nil)
        try await c.save(on: app.db)
        if dias > 0 {
            // Fluent pone `created_at` al guardar; se retrasa a mano para simular el paso
            // del tiempo, que es de lo que va el corte.
            c.createdAt = Date().addingTimeInterval(-dias * 86_400)
            try await c.save(on: app.db)
        }
        return c
    }

    private func bearer(_ t: String) -> HTTPHeaders { ["Authorization": "Bearer \(t)"] }

    private func partes(_ app: Application, de f: Font) async throws -> Int {
        try await FontComment.query(on: app.db).filter(\.$font.$id == f.requireID()).count()
    }

    /// El caso que motivó todo: alguien reseñó hace una hora y tú dices lo mismo.
    func testElMismoEstadoSobreUnParteRecienteAjenoConfirma() async throws {
        try await withApp { app in
            let (autora, _) = try await usuario(app, "autora")
            let (_, token) = try await usuario(app, "paseante")
            let f = try await fuente(app)
            let original = try await parte(app, en: f, de: autora, estado: "flowing")

            try await app.test(.POST, "fonts/\(f.requireID())/comments", headers: bearer(token),
                               beforeRequest: { req in
                try req.content.encode(CreateCommentDTO(body: nil, rating: nil, waterStatus: "flowing",
                                                        image: nil, confirmIfUnchanged: true))
            }, afterResponse: { res in
                // 200 y no 201: no se ha creado nada.
                XCTAssertEqual(res.status, .ok)
                let c = try res.content.decode(CommentResponse.self)
                XCTAssertTrue(c.confirmedInstead)
                XCTAssertEqual(c.id, original.id, "la respuesta es el parte respaldado, no uno nuevo")
                XCTAssertEqual(c.confirmations, 1)
            })
            let cuantos = try await partes(app, de: f)
            XCTAssertEqual(cuantos, 1, "no puede quedar un parte gemelo")
        }
    }

    /// Decir otra cosa es un desacuerdo, y un desacuerdo tiene que quedar como parte propio
    /// o `confidenceOf` no puede ver la contradicción.
    func testDecirOtraCosaSigueSiendoUnParteNuevo() async throws {
        try await withApp { app in
            let (autora, _) = try await usuario(app, "autora")
            let (_, token) = try await usuario(app, "discrepante")
            let f = try await fuente(app)
            try await parte(app, en: f, de: autora, estado: "flowing")

            try await app.test(.POST, "fonts/\(f.requireID())/comments", headers: bearer(token),
                               beforeRequest: { req in
                try req.content.encode(CreateCommentDTO(body: nil, rating: nil, waterStatus: "dry",
                                                        image: nil, confirmIfUnchanged: true))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                XCTAssertFalse(try res.content.decode(CommentResponse.self).confirmedInstead)
            })
            let cuantos = try await partes(app, de: f)
            XCTAssertEqual(cuantos, 2)
        }
    }

    /// El corte, por sus dos lados. Sale de la curva de frescura y no de un número escrito:
    /// dentro del tramo plano repetir paga 5 gotas y confirmar 10; fuera, la curva sube y
    /// cambiar la reseña por una confirmación degradaría lo que más paga la app.
    func testElCorteSaleDeLaCurvaYNoDeUnNumeroEscrito() {
        let d = ContributionScore.quickConfirmDays
        XCTAssertEqual(ContributionScore.freshness(daysSincePrevious: d),
                       ContributionScore.freshness(daysSincePrevious: 0),
                       "el corte tiene que caer DENTRO del tramo plano de la curva")
        XCTAssertGreaterThan(ContributionScore.freshness(daysSincePrevious: d + 1),
                             ContributionScore.freshness(daysSincePrevious: d),
                             "y en el último día del tramo: al siguiente la curva ya sube")
        XCTAssertGreaterThan(ContributionScore.Kind.confirmation.base,
                             ContributionScore.freshness(daysSincePrevious: d),
                             "dentro del tramo, confirmar tiene que pagar más que repetir")
    }

    /// Una fuente olvidada no se cambia por una confirmación: ahí la reseña vale hasta 70.
    func testUnParteViejoNoSeConfirmaSeReseñaOtraVez() async throws {
        try await withApp { app in
            let (autora, _) = try await usuario(app, "autora")
            let (_, token) = try await usuario(app, "excursionista")
            let f = try await fuente(app)
            try await parte(app, en: f, de: autora, estado: "flowing",
                            hace: Double(ContributionScore.quickConfirmDays) + 1)

            try await app.test(.POST, "fonts/\(f.requireID())/comments", headers: bearer(token),
                               beforeRequest: { req in
                try req.content.encode(CreateCommentDTO(body: nil, rating: nil, waterStatus: "flowing",
                                                        image: nil, confirmIfUnchanged: true))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                XCTAssertFalse(try res.content.decode(CommentResponse.self).confirmedInstead)
            })
        }
    }

    /// Tu propio parte no se confirma solo (confirmarlo tiene una espera de 24 h), y
    /// repetirlo dentro de ese día **no publica nada**: 409 `comment.alreadyReported`. Antes
    /// se publicaba una reseña gemela; pasó al dar el estado al crear la fuente y tocar el
    /// mismo chip justo después.
    func testTuPropioParteRecienteNoSeRepite() async throws {
        try await withApp { app in
            let (yo, token) = try await usuario(app, "vecina")
            let f = try await fuente(app)
            try await parte(app, en: f, de: yo, estado: "flowing")

            try await app.test(.POST, "fonts/\(f.requireID())/comments", headers: bearer(token),
                               beforeRequest: { req in
                try req.content.encode(CreateCommentDTO(body: nil, rating: nil, waterStatus: "flowing",
                                                        image: nil, confirmIfUnchanged: true))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .conflict)
                XCTAssertTrue(res.body.string.contains("comment.alreadyReported"))
            })
            let cuantos = try await partes(app, de: f)
            XCTAssertEqual(cuantos, 1, "no se guarda la gemela")
        }
    }

    /// La otra mitad: un **cambio** de estado se publica siempre, y pasado el día también
    /// el mismo (refresca la fecha, que entonces sí es información nueva). Con texto, igual.
    func testTuPropioParteSiCambiaOPasadoUnDiaOConTextoSePublica() async throws {
        try await withApp { app in
            let (yo, token) = try await usuario(app, "vecina")
            let f = try await fuente(app)
            try await parte(app, en: f, de: yo, estado: "flowing")

            func publica(_ estado: String, _ texto: String? = nil) async throws -> HTTPStatus {
                var status = HTTPStatus.ok
                try await app.test(.POST, "fonts/\(f.requireID())/comments", headers: bearer(token),
                                   beforeRequest: { req in
                    try req.content.encode(CreateCommentDTO(body: texto, rating: nil, waterStatus: estado,
                                                            image: nil, confirmIfUnchanged: true))
                }, afterResponse: { res in status = res.status })
                return status
            }
            let conTexto = try await publica("flowing", "sigue rajando fuerte")
            XCTAssertEqual(conTexto, .created)
            let cambio = try await publica("dry")
            XCTAssertEqual(cambio, .created)

            let g = try await fuente(app)
            try await parte(app, en: g, de: yo, estado: "flowing", hace: 1.5)
            try await app.test(.POST, "fonts/\(g.requireID())/comments", headers: bearer(token),
                               beforeRequest: { req in
                try req.content.encode(CreateCommentDTO(body: nil, rating: nil, waterStatus: "flowing",
                                                        image: nil, confirmIfUnchanged: true))
            }, afterResponse: { res in XCTAssertEqual(res.status, .created) })
        }
    }

    /// **Lo más caro que aporta alguien es lo que escribe**, y convertirlo en un pulgar lo
    /// tiraría. Con texto, nota o foto nunca se cambia por una confirmación.
    func testConTextoNoSeTraganLaReseña() async throws {
        try await withApp { app in
            let (autora, _) = try await usuario(app, "autora")
            let (_, token) = try await usuario(app, "detallista")
            let f = try await fuente(app)
            try await parte(app, en: f, de: autora, estado: "flowing")

            try await app.test(.POST, "fonts/\(f.requireID())/comments", headers: bearer(token),
                               beforeRequest: { req in
                try req.content.encode(CreateCommentDTO(body: "raja muy fría, la mejor de la vall",
                                                        rating: 5, waterStatus: "flowing",
                                                        image: nil, confirmIfUnchanged: true))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                let c = try res.content.decode(CommentResponse.self)
                XCTAssertFalse(c.confirmedInstead)
                XCTAssertEqual(c.body, "raja muy fría, la mejor de la vall")
                XCTAssertEqual(c.rating, 5)
            })
        }
    }

    /// Sin la intención no se cambia nada: un cliente viejo publica lo que siempre publicó.
    func testSinLaBanderaSeComportaComoSiempre() async throws {
        try await withApp { app in
            let (autora, _) = try await usuario(app, "autora")
            let (_, token) = try await usuario(app, "clienteviejo")
            let f = try await fuente(app)
            try await parte(app, en: f, de: autora, estado: "flowing")

            try await app.test(.POST, "fonts/\(f.requireID())/comments", headers: bearer(token),
                               beforeRequest: { req in
                try req.content.encode(CreateCommentDTO(body: nil, rating: nil, waterStatus: "flowing",
                                                        image: nil, confirmIfUnchanged: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                XCTAssertFalse(try res.content.decode(CommentResponse.self).confirmedInstead)
            })
            let cuantos = try await partes(app, de: f)
            XCTAssertEqual(cuantos, 2)
        }
    }

    /// Tocarlo dos veces no apila confirmaciones ni da error: el índice es (comentario,
    /// usuario) y volver a decirlo es decir lo mismo.
    func testConfirmarDosVecesEsIdempotente() async throws {
        try await withApp { app in
            let (autora, _) = try await usuario(app, "autora")
            let (_, token) = try await usuario(app, "insistente")
            let f = try await fuente(app)
            let original = try await parte(app, en: f, de: autora, estado: "flowing")

            for _ in 0..<2 {
                try await app.test(.POST, "fonts/\(f.requireID())/comments", headers: bearer(token),
                                   beforeRequest: { req in
                    try req.content.encode(CreateCommentDTO(body: nil, rating: nil, waterStatus: "flowing",
                                                            image: nil, confirmIfUnchanged: true))
                }, afterResponse: { res in
                    XCTAssertEqual(res.status, .ok)
                })
            }
            let confs = try await FontConfirmation.query(on: app.db)
                .filter(\.$comment.$id == original.requireID()).count()
            XCTAssertEqual(confs, 1)
        }
    }

    /// "Still the same" on your review reaches you through the bell: once per review while
    /// unread, by either path (the detail button and the map's quick chips).
    func testConfirmingSomeonesReviewTellsThemOnceWhileUnread() async throws {
        try await withApp { app in
            let (autora, _) = try await usuario(app, "autora")
            let (_, t1) = try await usuario(app, "primera")
            let (_, t2) = try await usuario(app, "segunda")
            let f = try await fuente(app)
            let original = try await parte(app, en: f, de: autora, estado: "flowing")

            try await app.test(.POST, "fonts/\(f.requireID())/comments/\(original.requireID())/confirm",
                               headers: bearer(t1), afterResponse: { res in XCTAssertEqual(res.status, .ok) })
            try await app.test(.POST, "fonts/\(f.requireID())/comments", headers: bearer(t2),
                               beforeRequest: { req in
                try req.content.encode(CreateCommentDTO(body: nil, rating: nil, waterStatus: "flowing",
                                                        image: nil, confirmIfUnchanged: true))
            }, afterResponse: { res in XCTAssertEqual(res.status, .ok) })

            let avisos = try await Notification.query(on: app.db)
                .filter(\.$user.$id == autora.requireID()).all()
            XCTAssertEqual(avisos.count, 1, "two confirmations of an unread review are one notice")
            XCTAssertEqual(avisos.first?.kind, .reviewConfirmed)
        }
    }
}
