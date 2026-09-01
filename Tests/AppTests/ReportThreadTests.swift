import Fluent
import XCTVapor
@testable import App

/// Responder a un comentario.
///
/// ## Lo que estos tests protegen de verdad
///
/// El hilo en sí es una columna. Lo caro es que **una respuesta es una fila de
/// `font_reports`**, y de esa tabla cuelgan las gotas, las novedades, el correo semanal,
/// los avisos a quien sigue la fuente, la cola de moderación y el recuento de averías
/// abiertas de un municipio. Los cuatro primeros ya filtran `isIncident`, así que lo que
/// mantiene a las respuestas fuera de todo eso es **que nunca puedan ser incidencia**.
///
/// Si esa regla se rompe no falla nada visible: se pagan 40 gotas por responder, la
/// portada se llena de conversación y a un ayuntamiento se le cuentan averías que no
/// existen. Por eso hay un test por cada puerta.
final class ReportThreadTests: XCTestCase {
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

    private func bearer(_ t: String) -> HTTPHeaders { ["Authorization": "Bearer \(t)"] }

    private func fuente(_ app: Application) async throws -> Font {
        let f = Font(name: "Font del Roure", latitude: 41.75, longitude: 2.16)
        try await f.save(on: app.db)
        return f
    }

    private func comentario(_ app: Application, en f: Font, de autor: User,
                            texto: String = "Está detrás del quiosco",
                            incidencia: Bool = false) async throws -> FontReport {
        let r = FontReport(fontID: try f.requireID(), userID: try autor.requireID(),
                           message: texto, isIncident: incidencia,
                           incidentKind: incidencia ? .broken : nil)
        try await r.save(on: app.db)
        return r
    }

    private func responde(_ app: Application, a padre: FontReport, en f: Font, token: String,
                          texto: String = "Gracias, la encontré",
                          comoIncidencia: Bool = false,
                          espera: (XCTHTTPResponse) throws -> Void) async throws {
        try await app.test(.POST, "fonts/\(f.requireID())/report", headers: bearer(token),
                           beforeRequest: { req in
            try req.content.encode(CreateReportDTO(message: texto,
                                                   isIncident: comoIncidencia ? true : nil,
                                                   incidentKind: comoIncidencia ? .broken : nil,
                                                   parentID: try padre.requireID(),
                                                   duplicateOf: nil))
        }, afterResponse: espera)
    }

    func testResponderCuelgaDelComentario() async throws {
        try await withApp { app in
            let (autor, _) = try await usuario(app, "autora")
            let (_, token) = try await usuario(app, "lectora")
            let f = try await fuente(app)
            let padre = try await comentario(app, en: f, de: autor)

            try await responde(app, a: padre, en: f, token: token) { res in
                XCTAssertEqual(res.status, .created)
                let dto = try res.content.decode(ReportResponse.self)
                XCTAssertEqual(dto.parentID, padre.id)
                XCTAssertFalse(dto.isIncident)
            }
        }
    }

    /// **La regla que sostiene todo lo demás.** Una respuesta no es incidencia ni aunque
    /// se pida: si lo fuera, entraría en las gotas, la portada, el correo semanal y el
    /// recuento de averías de un municipio.
    func testUnaRespuestaNuncaEsIncidencia() async throws {
        try await withApp { app in
            let (autor, _) = try await usuario(app, "autora")
            let (_, token) = try await usuario(app, "lectora")
            let f = try await fuente(app)
            let padre = try await comentario(app, en: f, de: autor)

            try await responde(app, a: padre, en: f, token: token, comoIncidencia: true) { res in
                XCTAssertEqual(res.status, .created)
                let dto = try res.content.decode(ReportResponse.self)
                XCTAssertFalse(dto.isIncident, "pedirlo no basta: una respuesta no puede serlo")
                XCTAssertNil(dto.incidentKind)
            }
        }
    }

    /// Y tampoco puede ascender después, que es la otra puerta.
    func testUnaRespuestaTampocoPuedeAscenderAIncidencia() async throws {
        try await withApp { app in
            let (autor, _) = try await usuario(app, "autora")
            let (_, token) = try await usuario(app, "lectora")
            let f = try await fuente(app)
            let padre = try await comentario(app, en: f, de: autor)
            var respuestaID: UUID?
            try await responde(app, a: padre, en: f, token: token) { res in
                respuestaID = try res.content.decode(ReportResponse.self).id
            }

            try await app.test(.PATCH, "fonts/\(f.requireID())/report/\(respuestaID!)/incident",
                               headers: bearer(token), beforeRequest: { req in
                try req.content.encode(FontReportController.SetIncidentDTO(isIncident: true, incidentKind: .broken))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
                XCTAssertTrue(res.body.string.contains("report.replyNotIncident"))
            })
        }
    }

    /// Un solo nivel: responder a una respuesta obliga a plegar y a paginar, y esta caja
    /// lleva once comentarios en toda su historia.
    func testNoSePuedeResponderAUnaRespuesta() async throws {
        try await withApp { app in
            let (autor, _) = try await usuario(app, "autora")
            let (_, token) = try await usuario(app, "lectora")
            let f = try await fuente(app)
            let padre = try await comentario(app, en: f, de: autor)
            var respuestaID: UUID?
            try await responde(app, a: padre, en: f, token: token) { res in
                respuestaID = try res.content.decode(ReportResponse.self).id
            }
            let respuesta = try await FontReport.find(respuestaID, on: app.db)!

            try await responde(app, a: respuesta, en: f, token: token) { res in
                XCTAssertEqual(res.status, .badRequest)
                XCTAssertTrue(res.body.string.contains("report.nestedReply"))
            }
        }
    }

    /// No se puede colgar una respuesta de un comentario de **otra** fuente: quedaría un
    /// hilo repartido entre dos fichas.
    func testElPadreTieneQueSerDeLaMismaFuente() async throws {
        try await withApp { app in
            let (autor, _) = try await usuario(app, "autora")
            let (_, token) = try await usuario(app, "lectora")
            let f1 = try await fuente(app)
            let f2 = Font(name: "Otra font", latitude: 41.80, longitude: 2.20)
            try await f2.save(on: app.db)
            let padre = try await comentario(app, en: f1, de: autor)

            try await responde(app, a: padre, en: f2, token: token) { res in
                XCTAssertEqual(res.status, .notFound)
                XCTAssertTrue(res.body.string.contains("report.parentNotFound"))
            }
        }
    }

    /// **Borrar el padre no se lleva las respuestas.** Son palabras de otra persona, y esa
    /// es la misma regla que impide que borrar una fuente se lleve las reseñas ajenas. La
    /// respuesta se queda suelta: pierde el hilo, no el contenido.
    func testBorrarElPadreDejaLaRespuestaSuelta() async throws {
        try await withApp { app in
            let (autor, tokenAutor) = try await usuario(app, "autora")
            let (_, token) = try await usuario(app, "lectora")
            let f = try await fuente(app)
            let padre = try await comentario(app, en: f, de: autor)
            var respuestaID: UUID?
            try await responde(app, a: padre, en: f, token: token) { res in
                respuestaID = try res.content.decode(ReportResponse.self).id
            }

            try await app.test(.DELETE, "fonts/\(f.requireID())/report/\(padre.requireID())",
                               headers: bearer(tokenAutor)) { res in
                XCTAssertEqual(res.status, .noContent)
            }
            let respuesta = try await FontReport.find(respuestaID, on: app.db)
            XCTAssertNotNil(respuesta, "la respuesta es de otra persona y no se borra")
            XCTAssertNil(respuesta?.$parent.id, "se queda suelta, no apuntando a algo que ya no está")
        }
    }

    /// Responder avisa a quien escribió, por campana. El push va por la misma preferencia
    /// que las menciones: para quien lo recibe es la misma clase de aviso.
    func testResponderAvisaAQuienEscribio() async throws {
        try await withApp { app in
            let (autor, _) = try await usuario(app, "autora")
            let (lectora, token) = try await usuario(app, "lectora")
            let f = try await fuente(app)
            let padre = try await comentario(app, en: f, de: autor)

            try await responde(app, a: padre, en: f, token: token) { res in
                XCTAssertEqual(res.status, .created)
            }
            let avisos = try await Notification.query(on: app.db)
                .filter(\.$user.$id == autor.requireID()).all()
            XCTAssertEqual(avisos.count, 1)
            XCTAssertEqual(avisos.first?.kind, .commentReply)
            XCTAssertEqual(avisos.first?.actorName, lectora.username)
        }
    }

    /// Y **no dos veces**: si la respuesta ya menciona a esa persona, la mención ya avisa.
    func testSiLaRespuestaYaMencionaNoSeAvisaDosVeces() async throws {
        try await withApp { app in
            let (autor, _) = try await usuario(app, "autora")
            let (_, token) = try await usuario(app, "lectora")
            let f = try await fuente(app)
            let padre = try await comentario(app, en: f, de: autor)

            try await responde(app, a: padre, en: f, token: token,
                               texto: "@\(autor.username) gracias, la encontré") { res in
                XCTAssertEqual(res.status, .created)
            }
            // Se afirma lo que decide ESTE código —que no hay aviso de respuesta— y no que
            // llegue el de mención: `MentionNotifier` avisa **sin esperar**, así que
            // comprobarlo aquí sería una carrera con su propia tarea. Que la mención avisa
            // ya lo cubren sus tests.
            let respuestas = try await Notification.query(on: app.db)
                .filter(\.$user.$id == autor.requireID())
                .filter(\.$kind == .commentReply).count()
            XCTAssertEqual(respuestas, 0, "la mención ya avisa: no se avisa dos veces")
        }
    }

    /// Responderte a ti mismo no te avisa.
    func testResponderteATiMismoNoAvisa() async throws {
        try await withApp { app in
            let (autor, token) = try await usuario(app, "autora")
            let f = try await fuente(app)
            let padre = try await comentario(app, en: f, de: autor)

            try await responde(app, a: padre, en: f, token: token) { res in
                XCTAssertEqual(res.status, .created)
            }
            let n = try await Notification.query(on: app.db)
                .filter(\.$user.$id == autor.requireID()).count()
            XCTAssertEqual(n, 0)
        }
    }

    /// La cola de moderación es de comentarios de primer nivel: existe para clasificar qué
    /// es incidencia, y una respuesta nunca puede serlo.
    func testLaColaDeModeracionNoSeLlenaDeRespuestas() async throws {
        try await withApp { app in
            let (admin, tokenAdmin) = try await usuario(app, "jefa")
            admin.role = .admin
            try await admin.save(on: app.db)
            let (_, token) = try await usuario(app, "lectora")
            let f = try await fuente(app)
            let padre = try await comentario(app, en: f, de: admin)
            try await responde(app, a: padre, en: f, token: token) { res in
                XCTAssertEqual(res.status, .created)
            }

            try await app.test(.GET, "admin/reports", headers: bearer(tokenAdmin)) { res in
                XCTAssertEqual(res.status, .ok)
                let lista = try res.content.decode([FontReportController.AdminReport].self)
                XCTAssertEqual(lista.count, 1, "solo el comentario, no su respuesta")
            }
        }
    }

    /// Señalar un duplicado es un comentario, **nunca** una incidencia: de esa marca
    /// cuelgan las gotas, las novedades, el correo semanal, los avisos urgentes y el
    /// recuento de averías abiertas de un municipio. Un duplicado no es una fuente rota,
    /// y colarlo ahí le enseñaría a un ayuntamiento averías que no existen.
    func testSenalarDuplicadoNuncaEsIncidencia() async throws {
        try await withApp { app in
            let (_, token) = try await usuario(app, "vecina")
            let buena = try await fuente(app)
            let mala = try await fuente(app)

            var reportID: UUID?
            // Se piden LAS DOS cosas a propósito: aunque el cliente marque incidencia,
            // señalar un duplicado gana y la fila queda inerte.
            try await app.test(.POST, "fonts/\(try mala.requireID())/report", headers: bearer(token),
                               beforeRequest: { req in
                try req.content.encode(CreateReportDTO(message: "És la mateixa que la del costat",
                                                       isIncident: true, incidentKind: .broken,
                                                       parentID: nil, duplicateOf: try buena.requireID()))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                let r = try res.content.decode(ReportResponse.self)
                XCTAssertFalse(r.isIncident, "Un duplicado no es una avería.")
                XCTAssertNil(r.incidentKind)
                XCTAssertEqual(r.duplicateOf, try buena.requireID())
                reportID = r.id
            })
            XCTAssertNotNil(reportID)

            // Y llega a la cola, que es lo que faltaba: sin esto la sugerencia se quedaba
            // en la ficha esperando a que alguien pasara por allí a leerla.
            let (mod, suyo) = try await usuario(app, "moderadup")
            mod.role = .moderator
            try await mod.save(on: app.db)
            try await app.test(.GET, "fonts/moderation/duplicates", headers: bearer(suyo)) { res in
                XCTAssertEqual(res.status, .ok)
                let filas = try res.content.decode([DuplicateSuggestion].self)
                let fila = try XCTUnwrap(filas.first { $0.fontID == (try? mala.requireID()) })
                XCTAssertEqual(fila.otherID, try buena.requireID())
            }

            // Al marcarla de verdad la cola se vacía sola: no hay estado nuevo que
            // mantener, se mira `fonts.duplicate_of`.
            mala.$duplicateOf.id = try buena.requireID()
            try await mala.save(on: app.db)
            try await app.test(.GET, "fonts/moderation/duplicates", headers: bearer(suyo)) { res in
                let filas = try res.content.decode([DuplicateSuggestion].self)
                XCTAssertFalse(filas.contains { $0.fontID == (try? mala.requireID()) })
            }
        }
    }

    /// Señalarse a sí misma no dice nada, y apuntar a una que ya es duplicada deja una
    /// cadena que nadie sabe seguir. Es la misma guarda que ya tiene `markDuplicate`.
    func testSenalarDuplicadoRechazaSiMismaYCadenas() async throws {
        try await withApp { app in
            let (_, token) = try await usuario(app, "cadena")
            let a = try await fuente(app)
            let b = try await fuente(app)
            let c = try await fuente(app)
            b.$duplicateOf.id = try a.requireID()
            try await b.save(on: app.db)

            try await app.test(.POST, "fonts/\(try a.requireID())/report", headers: bearer(token),
                               beforeRequest: { req in
                try req.content.encode(CreateReportDTO(message: "sóc jo mateixa", isIncident: nil,
                                                       incidentKind: nil, parentID: nil,
                                                       duplicateOf: try a.requireID()))
            }, afterResponse: { res in XCTAssertEqual(res.status, .badRequest) })

            try await app.test(.POST, "fonts/\(try c.requireID())/report", headers: bearer(token),
                               beforeRequest: { req in
                try req.content.encode(CreateReportDTO(message: "és com la b", isIncident: nil,
                                                       incidentKind: nil, parentID: nil,
                                                       duplicateOf: try b.requireID()))
            }, afterResponse: { res in XCTAssertEqual(res.status, .badRequest) })
        }
    }
}
