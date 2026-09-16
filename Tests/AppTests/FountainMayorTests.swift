import Fluent
import XCTVapor
@testable import App

/// El guardián de una fuente (`FountainMayor`): quien más la ha comprobado en 60 días.
///
/// Son todo casos límite que fallan en silencio —un umbral mal puesto corona a cualquiera,
/// una ventana mal medida deja el título congelado, y un opt-out ignorado publica un nombre
/// que el perfil pidió esconder—, así que cada uno tiene su test y los de romper están
/// verificados devolviendo el fallo.
final class FountainMayorTests: XCTestCase {
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

    private func usuario(_ app: Application, _ nombre: String, optOut: Bool = false) async throws -> User {
        let n = Int.random(in: 1...999_999)
        let u = User(name: nombre, username: "\(nombre)\(n)", email: "\(nombre)\(n)@x.test",
                     passwordHash: try Bcrypt.hash("password123"), gamificationOptOut: optOut)
        try await u.save(on: app.db)
        return u
    }

    private func fuente(_ app: Application) async throws -> Font {
        let f = Font(name: "Font del Roure", latitude: 41.75, longitude: 2.16)
        try await f.save(on: app.db)
        return f
    }

    /// Una comprobación de `user` sobre `font`, envejecida `dias` días.
    @discardableResult
    private func resena(_ app: Application, _ font: Font, de user: User, hace dias: Double = 0)
        async throws -> FontComment {
        let c = FontComment(fontID: try font.requireID(), userID: try user.requireID(),
                            body: "", rating: nil, waterStatus: "flowing", image: nil)
        try await c.save(on: app.db)
        if dias != 0 {
            c.createdAt = Date().addingTimeInterval(-dias * 86_400)
            try await c.save(on: app.db)
        }
        return c
    }

    /// Con una sola comprobación no hay guardián: eso ya lo cubre el relevo de
    /// `Guardianship`, y coronar por pasar una vez vacía la palabra.
    func testUnaSolaResenaNoDaGuardian() async throws {
        try await withApp { app in
            let a = try await usuario(app, "sola")
            let f = try await fuente(app)
            try await resena(app, f, de: a)
            let m = try await FountainMayor.of(fontID: try f.requireID(), on: app.db)
            XCTAssertNil(m)
        }
    }

    /// Con dos, sí, y es quien las hizo.
    func testDosResenasDanGuardian() async throws {
        try await withApp { app in
            let a = try await usuario(app, "activa")
            let f = try await fuente(app)
            try await resena(app, f, de: a, hace: 3)
            try await resena(app, f, de: a, hace: 1)
            let mo = try await FountainMayor.of(fontID: try f.requireID(), on: app.db)
            let m = try XCTUnwrap(mo)
            XCTAssertEqual(m.userID, try a.requireID())
            XCTAssertEqual(m.reviews, 2)
        }
    }

    /// Gana quien más comprueba, no quien llegó primero: es el título reconquistable.
    func testGanaQuienMasComprueba() async throws {
        try await withApp { app in
            let a = try await usuario(app, "primera")
            let b = try await usuario(app, "prolifica")
            let f = try await fuente(app)
            try await resena(app, f, de: a, hace: 10)
            try await resena(app, f, de: a, hace: 9)
            try await resena(app, f, de: b, hace: 3)
            try await resena(app, f, de: b, hace: 2)
            try await resena(app, f, de: b, hace: 1)
            let mo = try await FountainMayor.of(fontID: try f.requireID(), on: app.db)
            let m = try XCTUnwrap(mo)
            XCTAssertEqual(m.userID, try b.requireID())
            XCTAssertEqual(m.reviews, 3)
        }
    }

    /// La ventana es móvil: lo que cae fuera de los 60 días no cuenta. Sin esto el título
    /// lo ganaría para siempre quien reseñó mucho hace un año.
    func testFueraDeLaVentanaNoCuenta() async throws {
        try await withApp { app in
            let a = try await usuario(app, "veterana")
            let f = try await fuente(app)
            try await resena(app, f, de: a, hace: 100)
            try await resena(app, f, de: a, hace: 90)
            let m = try await FountainMayor.of(fontID: try f.requireID(), on: app.db)
            XCTAssertNil(m, "dos comprobaciones viejas no sostienen el título")
        }
    }

    /// El opt-out saca del título, como del ranking y del pulso. Las reseñas siguen siendo
    /// públicas; lo que no se concede es la distinción del sistema de puntos.
    func testOptOutNoPuedeSerGuardian() async throws {
        try await withApp { app in
            let a = try await usuario(app, "discreta", optOut: true)
            let f = try await fuente(app)
            try await resena(app, f, de: a, hace: 2)
            try await resena(app, f, de: a, hace: 1)
            let m = try await FountainMayor.of(fontID: try f.requireID(), on: app.db)
            XCTAssertNil(m)
        }
    }

    /// El destronamiento avisa al guardián anterior, y solo por la campana.
    func testDestronamientoAvisaAlAnterior() async throws {
        try await withApp { app in
            let a = try await usuario(app, "reina")
            let b = try await usuario(app, "aspirante")
            let f = try await fuente(app)
            let fontID = try f.requireID()
            // A manda: dos comprobaciones, las más antiguas.
            try await resena(app, f, de: a, hace: 10)
            try await resena(app, f, de: a, hace: 9)
            // B empata a dos —A gana el desempate por antigüedad— y luego la supera.
            try await resena(app, f, de: b, hace: 3)
            try await resena(app, f, de: b, hace: 2)
            let ultima = try await resena(app, f, de: b, hace: 0)

            await FountainMayor.notifyIfDethroned(
                fontID: fontID, newComment: try ultima.requireID(),
                reviewerID: try b.requireID(), on: app.db)

            let avisos = try await App.Notification.query(on: app.db)
                .filter(\.$user.$id == a.requireID()).all()
            XCTAssertEqual(avisos.count, 1)
            let aviso = try XCTUnwrap(avisos.first)
            XCTAssertEqual(aviso.kind, .mayorTaken)
            XCTAssertEqual(aviso.$actor.id, try b.requireID())
        }
    }

    /// El recuento del perfil: cuenta las fuentes que guardas y solo esas.
    func testCountForCuentaSoloLasQueGuardas() async throws {
        try await withApp { app in
            let a = try await usuario(app, "guardiana")
            let b = try await usuario(app, "otra")
            // Dos fuentes donde A manda.
            let f1 = try await fuente(app)
            try await resena(app, f1, de: a, hace: 4); try await resena(app, f1, de: a, hace: 1)
            let f2 = try await fuente(app)
            try await resena(app, f2, de: a, hace: 3); try await resena(app, f2, de: a, hace: 2)
            // Una donde manda B (A solo pasó una vez): no cuenta para A.
            let f3 = try await fuente(app)
            try await resena(app, f3, de: b, hace: 3); try await resena(app, f3, de: b, hace: 2)
            try await resena(app, f3, de: a, hace: 1)

            let n = try await FountainMayor.countFor(try a.requireID(), on: app.db)
            XCTAssertEqual(n, 2, "solo las dos que guarda, no la que lidera otra persona")
        }
    }

    /// Una fuente escondida no cuenta en el recuento, aunque su ficha aún enseñe guardián.
    func testCountForIgnoraEscondidas() async throws {
        try await withApp { app in
            let a = try await usuario(app, "guarda")
            let f = try await fuente(app)
            try await resena(app, f, de: a, hace: 2); try await resena(app, f, de: a, hace: 1)
            let antes = try await FountainMayor.countFor(try a.requireID(), on: app.db)
            XCTAssertEqual(antes, 1)
            // Se retira del mapa: deja de contar.
            f.retiredAt = Date()
            try await f.save(on: app.db)
            let despues = try await FountainMayor.countFor(try a.requireID(), on: app.db)
            XCTAssertEqual(despues, 0)
        }
    }

    /// Y no avisa a nadie si no ha cambiado de manos: aguantar el puesto no es una noticia.
    func testSinDestronamientoNoAvisa() async throws {
        try await withApp { app in
            let a = try await usuario(app, "titular")
            let f = try await fuente(app)
            let fontID = try f.requireID()
            try await resena(app, f, de: a, hace: 5)
            let ultima = try await resena(app, f, de: a, hace: 0)
            await FountainMayor.notifyIfDethroned(
                fontID: fontID, newComment: try ultima.requireID(),
                reviewerID: try a.requireID(), on: app.db)
            let n = try await App.Notification.query(on: app.db).count()
            XCTAssertEqual(n, 0)
        }
    }

    /// El cableado de verdad: `GET /fonts/:id` expone el guardián. Es una ruta pública, así
    /// que se prueba sin token, y sin guardián el campo llega como `null` (no ausente).
    func testFichaExponeElGuardian() async throws {
        struct Detalle: Content { struct M: Content { let username: String; let reviews: Int }; let mayor: M? }
        try await withApp { app in
            let a = try await usuario(app, "guardaficha")
            let f = try await fuente(app)
            // Sin guardián todavía: una sola comprobación.
            try await resena(app, f, de: a, hace: 1)
            try await app.test(.GET, "fonts/\(try f.requireID())") { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertNil(try res.content.decode(Detalle.self).mayor)
            }
            // La segunda lo corona.
            try await resena(app, f, de: a, hace: 0)
            try await app.test(.GET, "fonts/\(try f.requireID())") { res in
                let m = try XCTUnwrap(try res.content.decode(Detalle.self).mayor)
                XCTAssertEqual(m.username, a.username)
                XCTAssertEqual(m.reviews, 2)
            }
        }
    }
}
