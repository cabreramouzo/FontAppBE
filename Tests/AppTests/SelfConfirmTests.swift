import Fluent
import XCTVapor
@testable import App

/// «Sigue igual» sobre tu propia reseña.
///
/// Estaba prohibido del todo para que nadie se diera la razón a sí mismo. La intención era
/// buena y la regla estaba mal puesta: no frenaba a quien quisiera hacer trampa —publicar
/// una reseña nueva cada día siempre se ha podido— y sí frenaba el caso normal, la fuente
/// de tu pueblo por la que pasas cada semana.
///
/// Lo que separan estos tests son las dos cosas que el código mezclaba: **corroboración**
/// (¿alguien más lo dice?) y **actualidad** (¿de cuándo es el dato?).
final class SelfConfirmTests: XCTestCase {
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

    private func fuenteConResena(_ app: Application, de user: User, hace dias: Double)
        async throws -> (Font, FontComment) {
        let f = Font(name: "Font del Roure", latitude: 41.75, longitude: 2.16)
        f.$creator.id = try user.requireID()
        try await f.save(on: app.db)
        let c = FontComment(fontID: try f.requireID(), userID: try user.requireID(),
                            body: "raja bien", rating: nil, waterStatus: "flowing", image: nil)
        try await c.save(on: app.db)
        // Fluent pone `created_at` al guardar; se retrasa a mano para simular el paso del
        // tiempo, que es de lo que va toda esta regla.
        c.createdAt = Date().addingTimeInterval(-dias * 86_400)
        try await c.save(on: app.db)
        return (f, c)
    }

    private func bearer(_ t: String) -> HTTPHeaders { ["Authorization": "Bearer \(t)"] }

    /// El caso reportado: reseñaste la fuente de tu pueblo, pasas trece días después y
    /// sigue igual. Antes no había forma de decirlo.
    func testPuedesDecirQueSigueIgualEnTuPropiaResenaVieja() async throws {
        try await withApp { app in
            let (user, token) = try await usuario(app, "vecina")
            let (f, c) = try await fuenteConResena(app, de: user, hace: 13)
            try await app.test(.POST, "fonts/\(f.requireID())/comments/\(c.requireID())/confirm",
                               headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .ok)
            }
        }
    }

    /// Pero no el mismo día: eso no sería haber vuelto a pasar.
    func testNoElMismoDia() async throws {
        try await withApp { app in
            let (user, token) = try await usuario(app, "impaciente")
            let (f, c) = try await fuenteConResena(app, de: user, hace: 0.2)
            try await app.test(.POST, "fonts/\(f.requireID())/comments/\(c.requireID())/confirm",
                               headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .forbidden)
                XCTAssertTrue(res.body.string.contains("confirm.tooSoon"))
            }
        }
    }

    /// **La mitad que importa**: confirmar la tuya NO te da la razón. La fuente no puede
    /// llegar a «confirmada» a base de repetirte, y de eso depende que la etiqueta
    /// signifique algo.
    func testLaPropiaNoCuentaComoRespaldo() async throws {
        try await withApp { app in
            let (user, token) = try await usuario(app, "sola")
            let (f, c) = try await fuenteConResena(app, de: user, hace: 13)
            try await app.test(.POST, "fonts/\(f.requireID())/comments/\(c.requireID())/confirm",
                               headers: bearer(token))

            let agg = try await FontCommentController.confirmations(
                for: [c], viewer: try user.requireID(), on: app.db)
            let mio = try XCTUnwrap(agg[try c.requireID()])
            XCTAssertEqual(mio.count, 0, "una confirmación propia no es respaldo de nadie")
            // ...pero sí dice que se ha vuelto a mirar hoy, que es lo que hace falta saber
            // antes de desviarse tres kilómetros.
            let lastAt = try XCTUnwrap(mio.lastAt)
            XCTAssertLessThan(abs(lastAt.timeIntervalSinceNow), 60)
        }
    }

    /// La de otra persona sí cuenta, como siempre.
    func testLaAjenaSigueContando() async throws {
        try await withApp { app in
            let (autora, _) = try await usuario(app, "autora")
            let (_, tokenOtro) = try await usuario(app, "otro")
            let (f, c) = try await fuenteConResena(app, de: autora, hace: 1)
            try await app.test(.POST, "fonts/\(f.requireID())/comments/\(c.requireID())/confirm",
                               headers: bearer(tokenOtro)) { res in
                XCTAssertEqual(res.status, .ok)
            }
            let agg = try await FontCommentController.confirmations(for: [c], viewer: nil, on: app.db)
            XCTAssertEqual(agg[try c.requireID()]?.count, 1)
        }
    }

    /// Y se puede repetir cada día que pases, refrescando la fecha en vez de acumular
    /// filas: «sigue igual» es un hecho de hoy, no una colección.
    func testSePuedeRepetirPasadoElDia() async throws {
        try await withApp { app in
            let (user, token) = try await usuario(app, "constante")
            let (f, c) = try await fuenteConResena(app, de: user, hace: 13)
            try await app.test(.POST, "fonts/\(f.requireID())/comments/\(c.requireID())/confirm",
                               headers: bearer(token))
            // Otra vez enseguida: todavía no.
            try await app.test(.POST, "fonts/\(f.requireID())/comments/\(c.requireID())/confirm",
                               headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }
            // Se envejece la confirmación y ya se puede repetir.
            let fila = try await FontConfirmation.query(on: app.db).first()
            let conf = try XCTUnwrap(fila)
            conf.createdAt = Date().addingTimeInterval(-2 * 86_400)
            try await conf.save(on: app.db)
            try await app.test(.POST, "fonts/\(f.requireID())/comments/\(c.requireID())/confirm",
                               headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .ok)
            }
            let n = try await FontConfirmation.query(on: app.db).count()
            XCTAssertEqual(n, 1, "se refresca la fila, no se acumulan")
        }
    }
}

/// Las preferencias de avisos del sistema.
///
/// La parte que hay que fijar es **qué apagan y qué no**: apagar los avisos del sistema no
/// puede llevarse por delante la campana, que es el registro de lo que ha pasado y no
/// interrumpe a nadie. Si se cruzara, alguien perdería avisos sin haberlo pedido.
extension SelfConfirmTests {
    func testLasPreferenciasNacenEncendidas() async throws {
        try await withApp { app in
            let (u, _) = try await usuario(app, "recien")
            XCTAssertTrue(u.pushFontUpdates)
            XCTAssertTrue(u.pushMentions)
            XCTAssertTrue(u.pushAdmin)
        }
    }

    /// Apagar el push NO apaga la campana. Es toda la regla.
    func testApagarElPushNoApagaLaCampana() async throws {
        try await withApp { app in
            let (autora, _) = try await usuario(app, "autoraa")
            let (seguidora, _) = try await usuario(app, "seguidora")
            seguidora.pushFontUpdates = false
            try await seguidora.save(on: app.db)

            let (f, _) = try await fuenteConResena(app, de: autora, hace: 1)
            let fontID = try f.requireID()
            try await FontFavorite(fontID: fontID, userID: try seguidora.requireID()).save(on: app.db)

            await FontWatchNotifier.notify(fontID: fontID, change: .review(status: "dry"),
                                           actorID: try autora.requireID(), on: app.db)

            let avisos = try await App.Notification.query(on: app.db)
                .filter(\.$user.$id == seguidora.requireID()).count()
            XCTAssertEqual(avisos, 1, "la campana no se apaga con el interruptor del push")
        }
    }
}
