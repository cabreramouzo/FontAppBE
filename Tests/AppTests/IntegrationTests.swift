import Fluent
import Foundation
import SQLKit
import XCTVapor
@testable import App

// Tests de integración contra una BD real (fontapp_test). Cada test migra y revierte.
// Requiere Postgres corriendo y la base `fontapp_test` (owner `vapor`).
final class IntegrationTests: XCTestCase {

    private func withApp(_ test: (Application) async throws -> Void) async throws {
        setenv("DATABASE_NAME", "fontapp_test", 1)
        let app = try await Application.make(.testing)
        do {
            try await configure(app)
            try? await app.autoRevert() // limpia posibles restos de una corrida previa
            try await app.autoMigrate()
            // La caché de /activity es estática y no se va con la app: si no se vacía,
            // un caso se lleva la respuesta que dejó el anterior sobre otra BD.
            await ActivityController.cache.clear()
            await ZoneController.cache.clear()
            try await test(app)
            try await app.autoRevert()
        } catch {
            try? await app.autoRevert()
            try await app.asyncShutdown()
            throw error
        }
        try await app.asyncShutdown()
    }

    // MARK: - Helpers

    @discardableResult
    private func register(_ app: Application, name: String = "Test", username: String, password: String = "password123") async throws -> UUID {
        var id = UUID()
        try await app.test(.POST, "users", beforeRequest: { req in
            try req.content.encode(CreateUserDTO(name: name, username: username, email: "\(username)@example.com", password: password))
        }, afterResponse: { res in
            XCTAssertEqual(res.status, .created)
            id = try res.content.decode(UserResponse.self).id ?? id
        })
        return id
    }

    private func login(_ app: Application, username: String, password: String = "password123") async throws -> String {
        var token = ""
        try await app.test(.POST, "auth/login", beforeRequest: { req in
            req.headers.basicAuthorization = .init(username: username, password: password)
        }, afterResponse: { res in
            XCTAssertEqual(res.status, .ok)
            token = try res.content.decode(LoginResponse.self).token
        })
        return token
    }

    /// La fuente **tal como sale por la API**, que ya no es el modelo.
    ///
    /// `Font` tiene columnas que no se publican (`queued_offline`), así que decodificar
    /// el modelo desde una respuesta fallaba: faltaba un campo obligatorio. Es la señal
    /// correcta —el contrato de salida y la tabla son cosas distintas— y esto lo fija.
    struct FontJSON: Content {
        let id: UUID?
        let name: String
        let latitude: Double
        let longitude: Double
        let image: String?
    }

    private func createFont(_ app: Application, token: String, name: String, lat: Double, long: Double) async throws -> UUID {
        var id = UUID()
        try await app.test(.POST, "fonts", headers: bearer(token), beforeRequest: { req in
            try req.content.encode(CreateFontDTO(name: name, latitude: lat, longitude: long, image: nil, description: nil, source: nil, drinkable: nil))
        }, afterResponse: { res in
            XCTAssertEqual(res.status, .created)
            id = try res.content.decode(FontJSON.self).id ?? id
        })
        return id
    }

    private func bearer(_ token: String) -> HTTPHeaders { ["Authorization": "Bearer \(token)"] }

    /// GeoLocator de prueba: devuelve siempre una ubicación fija.
    private struct StubGeoLocator: GeoLocator {
        let location: GeoLocation
        func locate(ip: String?, on client: any Client) async -> GeoLocation? { location }
    }

    /// ImageStorage de prueba: no toca disco; `copy` devuelve una referencia nueva.
    private struct StubImageStorage: ImageStorage {
        func save(_ data: ByteBuffer, ext: String) async throws -> String { "/uploads/stub.\(ext)" }
        func delete(_ reference: String) async throws {}
        func copy(_ reference: String) async throws -> String { "/uploads/copy-\(UUID().uuidString).jpg" }
    }

    /// Promociona a admin directamente en BD (no hay endpoint para ello).
    private func makeAdmin(_ app: Application, userID: UUID) async throws {
        guard let u = try await User.find(userID, on: app.db) else { return XCTFail("usuario no encontrado") }
        u.role = .admin
        try await u.save(on: app.db)
    }

    private func setRole(_ app: Application, userID: UUID, role: UserRole) async throws {
        guard let u = try await User.find(userID, on: app.db) else { return XCTFail("usuario no encontrado") }
        u.role = role
        try await u.save(on: app.db)
    }

    /// Deja una reseña en una fuente y devuelve su id.
    private func addComment(_ app: Application, token: String, fontID: UUID, body: String) async throws -> UUID {
        var id = UUID()
        try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(token), beforeRequest: { req in
            try req.content.encode(CreateCommentDTO(body: body, rating: nil, waterStatus: nil, image: nil))
        }, afterResponse: { res in
            XCTAssertEqual(res.status, .created)
            id = try res.content.decode(CommentResponse.self).id ?? id
        })
        return id
    }

    // MARK: - Tests

    func testRegisterLoginMe() async throws {
        try await withApp { app in
            try await register(app, username: "ada")
            let token = try await login(app, username: "ada")
            try await app.test(.GET, "auth/me", headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(UserResponse.self).username, "ada")
            }
        }
    }

    func testDuplicateUsernameConflict() async throws {
        try await withApp { app in
            try await register(app, username: "bob")
            try await app.test(.POST, "users", beforeRequest: { req in
                try req.content.encode(CreateUserDTO(name: "Bob2", username: "bob", email: "bob2@example.com", password: "password123"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .conflict)
            })
        }
    }

    func testValidationRejectsShortPassword() async throws {
        try await withApp { app in
            try await app.test(.POST, "users", beforeRequest: { req in
                try req.content.encode(CreateUserDTO(name: "X", username: "xyz", email: "xyz@example.com", password: "123"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
            })
        }
    }

    func testFontWriteRequiresAuth() async throws {
        try await withApp { app in
            try await app.test(.POST, "fonts", beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "F", latitude: 40, longitude: -3, image: nil, description: nil, source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .unauthorized)
            })

            try await register(app, username: "creator")
            let token = try await login(app, username: "creator")
            _ = try await createFont(app, token: token, name: "F", lat: 40, long: -3)
        }
    }

    func testNearSortsByDistance() async throws {
        try await withApp { app in
            try await register(app, username: "geo")
            let token = try await login(app, username: "geo")
            _ = try await createFont(app, token: token, name: "Sol", lat: 40.4168, long: -3.7038)
            _ = try await createFont(app, token: token, name: "BCN", lat: 41.3874, long: 2.1686)

            try await app.test(.GET, "fonts/near?lat=40.4168&long=-3.7038&quantity=1") { res in
                XCTAssertEqual(res.status, .ok)
                let fonts = try res.content.decode([FontSummary].self)
                XCTAssertEqual(fonts.count, 1)
                XCTAssertEqual(fonts.first?.name, "Sol")
            }
        }
    }

    func testReportRecordsAuthor() async throws {
        try await withApp { app in
            try await register(app, username: "reporter")
            let token = try await login(app, username: "reporter")
            let fontID = try await createFont(app, token: token, name: "F", lat: 40, long: -3)

            try await app.test(.POST, "fonts/\(fontID)/report", headers: bearer(token), beforeRequest: { req in
                try req.content.encode(CreateReportDTO(message: "grifo roto"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                let report = try res.content.decode(ReportResponse.self)
                XCTAssertEqual(report.username, "reporter")
            })
        }
    }

    func testSelfOnlyForbidden() async throws {
        try await withApp { app in
            let aID = try await register(app, username: "usera")
            try await register(app, username: "userb")
            let tokenB = try await login(app, username: "userb")

            try await app.test(.PUT, "users/\(aID)", headers: bearer(tokenB), beforeRequest: { req in
                try req.content.encode(UpdateUserDTO(name: "hack", username: "usera", email: "hack@example.com", password: nil, emailPublic: nil, namePublic: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })
        }
    }

    // MARK: - Edición abierta (wiki), historial y revert

    /// Cualquier usuario autenticado puede corregir la info (nombre/descripción),
    /// pero la ubicación NO cambia si no es el creador ni admin.
    func testNonOwnerEditsInfoButNotLocation() async throws {
        try await withApp { app in
            try await register(app, username: "owner")
            let ownerTok = try await login(app, username: "owner")
            let fontID = try await createFont(app, token: ownerTok, name: "Font", lat: 40, long: -3)

            try await register(app, username: "stranger")
            let strangerTok = try await login(app, username: "stranger")

            // El extraño cambia el nombre/descr y ADEMÁS intenta mover el pin.
            try await app.test(.PUT, "fonts/\(fontID)", headers: bearer(strangerTok), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Font Vella", latitude: 0, longitude: 0, image: nil, description: "Històrica", source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                // Struct local: `Font.description` colisiona con CustomStringConvertible.
                struct FontOut: Content { let name: String; let description: String?; let latitude: Double; let longitude: Double }
                let f = try res.content.decode(FontOut.self)
                XCTAssertEqual(f.name, "Font Vella")          // info sí cambia
                XCTAssertEqual(f.description, "Històrica")
                XCTAssertEqual(f.latitude, 40, accuracy: 0.0001)   // ubicación NO cambia
                XCTAssertEqual(f.longitude, -3, accuracy: 0.0001)
            })
        }
    }

    /// Borrar una fuente ajena está prohibido para quien no es creador ni admin.
    func testNonOwnerCannotDeleteFont() async throws {
        try await withApp { app in
            try await register(app, username: "owner2")
            let ownerTok = try await login(app, username: "owner2")
            let fontID = try await createFont(app, token: ownerTok, name: "F", lat: 40, long: -3)

            try await register(app, username: "stranger2")
            let strangerTok = try await login(app, username: "stranger2")
            try await app.test(.DELETE, "fonts/\(fontID)", headers: bearer(strangerTok)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }
            // El creador sí puede.
            try await app.test(.DELETE, "fonts/\(fontID)", headers: bearer(ownerTok)) { res in
                XCTAssertEqual(res.status, .noContent)
            }
        }
    }

    /// Una edición de info deja registro; listar y revertir es solo para admins;
    /// el revert restaura el estado previo.
    func testEditHistoryLoggedAndRevertAdminOnly() async throws {
        try await withApp { app in
            try await register(app, username: "owner3")
            let ownerTok = try await login(app, username: "owner3")
            let fontID = try await createFont(app, token: ownerTok, name: "Original", lat: 40, long: -3)

            try await register(app, username: "editor3")
            let editorTok = try await login(app, username: "editor3")
            try await app.test(.PUT, "fonts/\(fontID)", headers: bearer(editorTok), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Cambiado", latitude: 40, longitude: -3, image: nil, description: nil, source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })

            // Un no-admin no puede listar el historial.
            try await app.test(.GET, "fonts/edits", headers: bearer(editorTok)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }

            // Promocionamos a un admin.
            let adminID = try await register(app, username: "admin3")
            try await makeAdmin(app, userID: adminID)
            let adminTok = try await login(app, username: "admin3")

            var editID = UUID()
            try await app.test(.GET, "fonts/edits", headers: bearer(adminTok)) { res in
                XCTAssertEqual(res.status, .ok)
                let edits = try res.content.decode([FontEditResponse].self)
                XCTAssertEqual(edits.count, 1)
                XCTAssertEqual(edits.first?.before.name, "Original")
                XCTAssertEqual(edits.first?.after.name, "Cambiado")
                XCTAssertEqual(edits.first?.editorName, "editor3")
                editID = try XCTUnwrap(edits.first?.id)
            }

            // Un no-admin no puede revertir.
            try await app.test(.POST, "fonts/edits/\(editID)/revert", headers: bearer(editorTok)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }

            // El admin revierte y la fuente vuelve a su nombre original.
            try await app.test(.POST, "fonts/edits/\(editID)/revert", headers: bearer(adminTok)) { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(FontJSON.self).name, "Original")
            }
            try await app.test(.GET, "fonts/\(fontID)") { res in
                XCTAssertEqual(try res.content.decode(FontJSON.self).name, "Original")
            }
        }
    }

    /// El perfil público se resuelve tanto por username como por UUID.
    func testUserLookupByUsernameOrID() async throws {
        try await withApp { app in
            let id = try await register(app, username: "publicuser")
            try await app.test(.GET, "users/publicuser") { res in
                XCTAssertEqual(res.status, .ok)
                let u = try res.content.decode(UserResponse.self)
                XCTAssertEqual(u.username, "publicuser")
                XCTAssertNil(u.email) // el perfil público nunca expone el email
            }
            try await app.test(.GET, "users/\(id)") { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(UserResponse.self).username, "publicuser")
            }
            try await app.test(.GET, "users/noexiste") { res in
                XCTAssertEqual(res.status, .notFound)
            }
        }
    }

    /// Promover la foto de una reseña a foto principal: solo creador/admin, y la
    /// referencia resultante es una copia independiente (no la misma de la reseña).
    func testPromoteCommentPhotoToMain() async throws {
        try await withApp { app in
            app.imageStorage = StubImageStorage()
            try await register(app, username: "photoowner")
            let ownerTok = try await login(app, username: "photoowner")
            let fontID = try await createFont(app, token: ownerTok, name: "F", lat: 40, long: -3)

            struct NewComment: Content { let body: String; let image: String? }
            var commentID = UUID()
            try await app.test(.POST, "fonts/\(fontID)/comments", headers: bearer(ownerTok), beforeRequest: { req in
                try req.content.encode(NewComment(body: "con foto", image: "/uploads/orig.jpg"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                commentID = try XCTUnwrap(res.content.decode(CommentResponse.self).id)
            })

            // La fuente aún no tiene foto: un extraño SÍ puede poner la primera. Casi
            // ninguna fuente importada tiene creador, así que si solo pudiera él, esas
            // fichas no tendrían foto nunca. La imagen resultante es una copia
            // independiente (distinta de la de la reseña).
            struct FontOut: Content { let image: String? }
            try await register(app, username: "photostranger")
            let strangerTok = try await login(app, username: "photostranger")
            var primera: String?
            try await app.test(.POST, "fonts/\(fontID)/photo/from-comment/\(commentID)", headers: bearer(strangerTok)) { res in
                XCTAssertEqual(res.status, .ok)
                let f = try res.content.decode(FontOut.self)
                XCTAssertNotNil(f.image)
                XCTAssertNotEqual(f.image, "/uploads/orig.jpg")
                primera = f.image
            }

            // Pero SUSTITUIR la que ya hay sigue siendo cosa del creador o de un admin.
            try await app.test(.POST, "fonts/\(fontID)/photo/from-comment/\(commentID)", headers: bearer(strangerTok)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }

            // El creador sí puede cambiarla, y vuelve a copiarse.
            try await app.test(.POST, "fonts/\(fontID)/photo/from-comment/\(commentID)", headers: bearer(ownerTok)) { res in
                XCTAssertEqual(res.status, .ok)
                let f = try res.content.decode(FontOut.self)
                XCTAssertNotNil(f.image)
                XCTAssertNotEqual(f.image, primera)
            }
        }
    }

    /// La PRIMERA foto la puede poner cualquiera; sustituirla, no.
    ///
    /// Importa porque la mayoría de fuentes vienen importadas (ACA, OSM) y no tienen
    /// creador: con la regla "solo el creador" no habría a quién pedírsela.
    func testAnyoneCanAddTheFirstPhoto() async throws {
        try await withApp { app in
            try await register(app, username: "fotoowner2")
            let ownerTok = try await login(app, username: "fotoowner2")
            let fontID = try await createFont(app, token: ownerTok, name: "Sense foto", lat: 41, long: 2)

            try await register(app, username: "fotoextrany")
            let otroTok = try await login(app, username: "fotoextrany")

            struct FontOut: Content { let image: String?; let latitude: Double }
            // Pone la primera foto (y de paso intenta mover el pin, que no debe colar).
            try await app.test(.PUT, "fonts/\(fontID)", headers: bearer(otroTok), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Sense foto", latitude: 0, longitude: 0, image: "/uploads/primera.jpg", description: nil, source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let f = try res.content.decode(FontOut.self)
                XCTAssertEqual(f.image, "/uploads/primera.jpg")
                XCTAssertEqual(f.latitude, 41, "un extraño no puede mover la fuente")
            })

            // Ya hay foto: otro intento no la sustituye.
            try await app.test(.PUT, "fonts/\(fontID)", headers: bearer(otroTok), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Sense foto", latitude: 41, longitude: 2, image: "/uploads/otra.jpg", description: nil, source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(FontOut.self).image, "/uploads/primera.jpg")
            })
        }
    }

    /// El email solo aparece en el perfil público si el usuario lo activa.
    func testEmailPrivacyToggle() async throws {
        try await withApp { app in
            let id = try await register(app, username: "priv")
            try await app.test(.GET, "users/priv") { res in
                XCTAssertNil(try res.content.decode(UserResponse.self).email) // oculto por defecto
            }
            let tok = try await login(app, username: "priv")
            try await app.test(.PUT, "users/\(id)", headers: bearer(tok), beforeRequest: { req in
                try req.content.encode(UpdateUserDTO(name: "Test", username: "priv", email: "priv@example.com", password: nil, emailPublic: true, namePublic: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })
            try await app.test(.GET, "users/priv") { res in
                XCTAssertEqual(try res.content.decode(UserResponse.self).email, "priv@example.com") // ahora visible
            }
        }
    }

    /// Qué campos publica una fuente. Fija el contrato en las dos direcciones.
    ///
    /// Hacia fuera: `queued_offline` es un dato interno de gamificación —lo afirma el
    /// cliente y solo sirve para contar una insignia— y no tiene por qué viajar en cada
    /// `GET /fonts`. Fluent serializa el modelo entero, así que sin este test la próxima
    /// columna se cuela igual y nadie se entera.
    ///
    /// Hacia dentro: `creator` tiene que seguir saliendo como `{"id": null}` y no como
    /// `{}` en las fuentes importadas, que son la mayoría. Un opcional omitido llega al
    /// navegador como `undefined`, y ese ya nos ha roto dos pantallas.
    func testFontJSONHidesInternalColumns() async throws {
        try await withApp { app in
            _ = try await register(app, username: "shape")
            let tok = try await login(app, username: "shape")
            _ = try await createFont(app, token: tok, name: "Con dueño", lat: 41, long: 2)

            // Una importada: sin creador, que es el caso donde el `null` importa.
            try await Font(name: "Importada", latitude: 41.5, longitude: 2.5).create(on: app.db)

            try await app.test(.GET, "fonts") { res in
                XCTAssertEqual(res.status, .ok)
                let json = try JSONSerialization.jsonObject(with: Data(buffer: res.body)) as? [String: Any]
                let items = json?["items"] as? [[String: Any]] ?? []
                XCTAssertFalse(items.isEmpty)
                for f in items {
                    XCTAssertNil(f["queuedOffline"], "columna interna publicada en /fonts")
                    let creator = f["creator"] as? [String: Any]
                    XCTAssertNotNil(creator, "creator debe salir siempre, aunque sea sin id")
                    XCTAssertTrue(creator?.keys.contains("id") == true,
                                  "creator sin la clave `id`: en el cliente eso es `undefined`, no `null`")
                }
            }
        }
    }

    /// "Borrar" la cuenta la anonimiza: las fuentes se conservan, los datos
    /// personales se eliminan y el login deja de funcionar.
    func testDeleteAccountAnonymizes() async throws {
        try await withApp { app in
            let id = try await register(app, username: "quitter")
            let tok = try await login(app, username: "quitter")
            let fontID = try await createFont(app, token: tok, name: "Su fuente", lat: 41, long: -2)

            try await app.test(.DELETE, "users/\(id)", headers: bearer(tok)) { res in
                XCTAssertEqual(res.status, .noContent)
            }

            // La fuente sigue existiendo.
            struct FontOut: Content { let id: UUID }
            try await app.test(.GET, "fonts/\(fontID)") { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(FontOut.self).id, fontID)
            }

            // El perfil queda anonimizado: sin el nombre real ni el email.
            try await app.test(.GET, "users/\(id)") { res in
                XCTAssertEqual(res.status, .ok)
                let u = try res.content.decode(UserResponse.self)
                XCTAssertTrue(u.anonymized)
                XCTAssertNil(u.email)
                XCTAssertNotEqual(u.name, "quitter")
            }

            // El login ya no funciona.
            try await app.test(.POST, "auth/login", beforeRequest: { req in
                req.headers.basicAuthorization = .init(username: "quitter", password: "password123")
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .unauthorized)
            })
        }
    }

    // MARK: - Ubicación de registro (geo-IP) y estadística

    /// El GeoLocator configurado rellena país/región/ciudad al registrarse.
    func testSignupLocationStored() async throws {
        try await withApp { app in
            app.geoLocator = StubGeoLocator(location: GeoLocation(country: "Spain", region: "Galicia", city: "A Coruña"))
            let id = try await register(app, username: "galego")
            // El geo-IP ya no bloquea el registro: se resuelve en segundo plano, así
            // que aquí esperamos a que aterrice en vez de leerlo de inmediato.
            var u = try await User.find(id, on: app.db)
            for _ in 0..<50 where u?.signupRegion == nil {
                try await Task.sleep(nanoseconds: 100_000_000)
                u = try await User.find(id, on: app.db)
            }
            XCTAssertEqual(u?.signupRegion, "Galicia")
            XCTAssertEqual(u?.signupCountry, "Spain")
            XCTAssertEqual(u?.signupCity, "A Coruña")
        }
    }

    /// La estadística por región es solo para admins y agrupa correctamente.
    func testRegionStatsAdminOnly() async throws {
        try await withApp { app in
            app.geoLocator = StubGeoLocator(location: GeoLocation(country: "Spain", region: "Extremadura", city: "Cáceres"))
            try await register(app, username: "ex1")
            try await register(app, username: "ex2")

            let normalTok = try await login(app, username: "ex1")
            try await app.test(.GET, "users/stats/regions", headers: bearer(normalTok)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }

            let adminID = try await register(app, username: "statsadmin")
            try await makeAdmin(app, userID: adminID)
            let adminTok = try await login(app, username: "statsadmin")
            try await app.test(.GET, "users/stats/regions", headers: bearer(adminTok)) { res in
                XCTAssertEqual(res.status, .ok)
                let rows = try res.content.decode([RegionCount].self)
                let extremadura = rows.first { $0.region == "Extremadura" }
                XCTAssertEqual(extremadura?.count, 3) // ex1, ex2 y el propio admin
            }
        }
    }

    /// Guardar/quitar favorito: toggle idempotente, recuento y aparición en /me/favorites.
    func testFavoriteToggleAndList() async throws {
        try await withApp { app in
            try await register(app, username: "faver")
            let token = try await login(app, username: "faver")
            let fontID = try await createFont(app, token: token, name: "Font", lat: 40, long: -3)

            // Sin token: recuento 0 y favorited=false.
            try await app.test(.GET, "fonts/\(fontID)/favorite") { res in
                XCTAssertEqual(res.status, .ok)
                let s = try res.content.decode(FavoriteStatus.self)
                XCTAssertFalse(s.favorited)
                XCTAssertEqual(s.count, 0)
            }

            // Guardar (dos veces: idempotente, sigue en 1).
            for _ in 0..<2 {
                try await app.test(.POST, "fonts/\(fontID)/favorite", headers: bearer(token)) { res in
                    XCTAssertEqual(res.status, .ok)
                    let s = try res.content.decode(FavoriteStatus.self)
                    XCTAssertTrue(s.favorited)
                    XCTAssertEqual(s.count, 1)
                }
            }

            // Aparece en la lista del usuario.
            try await app.test(.GET, "auth/me/favorites", headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .ok)
                let fonts = try res.content.decode([FontJSON].self)
                XCTAssertEqual(fonts.map { $0.id }, [fontID])
            }

            // Quitar: vuelve a 0 y desaparece de la lista.
            try await app.test(.DELETE, "fonts/\(fontID)/favorite", headers: bearer(token)) { res in
                XCTAssertEqual(res.status, .ok)
                let s = try res.content.decode(FavoriteStatus.self)
                XCTAssertFalse(s.favorited)
                XCTAssertEqual(s.count, 0)
            }
            try await app.test(.GET, "auth/me/favorites", headers: bearer(token)) { res in
                let fonts = try res.content.decode([FontJSON].self)
                XCTAssertTrue(fonts.isEmpty)
            }
        }
    }

    /// Un moderador puede borrar la reseña de otro; un usuario normal, no.
    func testModeratorCanDeleteOthersComment() async throws {
        try await withApp { app in
            let authorID = try await register(app, username: "author")
            let authorTok = try await login(app, username: "author")
            let fontID = try await createFont(app, token: authorTok, name: "F", lat: 40, long: -3)
            let commentID = try await addComment(app, token: authorTok, fontID: fontID, body: "hola")
            _ = authorID

            // Usuario normal ajeno: 403.
            try await register(app, username: "rando")
            let randoTok = try await login(app, username: "rando")
            try await app.test(.DELETE, "fonts/\(fontID)/comments/\(commentID)", headers: bearer(randoTok)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }

            // Moderador: 204.
            let modID = try await register(app, username: "mod")
            try await setRole(app, userID: modID, role: .moderator)
            let modTok = try await login(app, username: "mod")
            try await app.test(.DELETE, "fonts/\(fontID)/comments/\(commentID)", headers: bearer(modTok)) { res in
                XCTAssertEqual(res.status, .noContent)
            }
        }
    }

    /// Solo el owner asigna roles; no puede crear otro owner ni cambiar el suyo.
    func testOnlyOwnerCanSetRole() async throws {
        try await withApp { app in
            let ownerID = try await register(app, username: "owner")
            try await setRole(app, userID: ownerID, role: .owner)
            let ownerTok = try await login(app, username: "owner")
            let targetID = try await register(app, username: "target")

            // Un admin (no owner) no puede asignar roles.
            let adminID = try await register(app, username: "adm")
            try await setRole(app, userID: adminID, role: .admin)
            let adminTok = try await login(app, username: "adm")
            try await app.test(.PUT, "users/\(targetID)/role", headers: bearer(adminTok), beforeRequest: { req in
                try req.content.encode(SetRoleDTO(role: "moderator"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })

            // El owner sí: promueve a moderador (además, por USERNAME, no por id).
            try await app.test(.PUT, "users/target/role", headers: bearer(ownerTok), beforeRequest: { req in
                try req.content.encode(SetRoleDTO(role: "moderator"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(UserResponse.self).role, "moderator")
            })

            // No puede asignar el rol owner desde la web.
            try await app.test(.PUT, "users/\(targetID)/role", headers: bearer(ownerTok), beforeRequest: { req in
                try req.content.encode(SetRoleDTO(role: "owner"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
            })

            // No puede cambiar su propio rol.
            try await app.test(.PUT, "users/\(ownerID)/role", headers: bearer(ownerTok), beforeRequest: { req in
                try req.content.encode(SetRoleDTO(role: "admin"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
            })
        }
    }

    /// El listado completo de usuarios es solo del owner, paginado y con búsqueda.
    func testAdminUsersListOwnerOnly() async throws {
        try await withApp { app in
            let ownerID = try await register(app, username: "owner")
            try await setRole(app, userID: ownerID, role: .owner)
            let ownerTok = try await login(app, username: "owner")
            try await register(app, username: "alice")
            try await register(app, username: "bob")

            try await app.test(.GET, "users/admin", headers: bearer(ownerTok), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let page = try res.content.decode(Page<AdminUser>.self)
                XCTAssertEqual(page.metadata.total, 3)
            })
            try await app.test(.GET, "users/admin?search=alic", headers: bearer(ownerTok), afterResponse: { res in
                let page = try res.content.decode(Page<AdminUser>.self)
                XCTAssertEqual(page.items.map { $0.username }, ["alice"])
            })
            // Un usuario normal (no owner): 403.
            let aliceTok = try await login(app, username: "alice")
            try await app.test(.GET, "users/admin", headers: bearer(aliceTok), afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })
        }
    }

    /// Triaje de ediciones: aceptar (✓) marca revisada y la saca de la cola pendiente.
    func testEditReviewInboxFlow() async throws {
        try await withApp { app in
            _ = try await register(app, username: "creator")
            let creatorTok = try await login(app, username: "creator")
            let fontID = try await createFont(app, token: creatorTok, name: "Original", lat: 40, long: -3)

            // Una edición de info (cambia el nombre) crea un FontEdit pendiente.
            try await app.test(.PUT, "fonts/\(fontID)", headers: bearer(creatorTok), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Nuevo", latitude: 40, longitude: -3, image: nil, description: nil, source: nil, drinkable: nil))
            }, afterResponse: { res in XCTAssertEqual(res.status, .ok) })

            let adminID = try await register(app, username: "adm")
            try await setRole(app, userID: adminID, role: .admin)
            let adminTok = try await login(app, username: "adm")

            // Cola pendiente: 1.
            var editID = UUID()
            try await app.test(.GET, "fonts/edits?unreviewed=true", headers: bearer(adminTok), afterResponse: { res in
                let edits = try res.content.decode([FontEditResponse].self)
                XCTAssertEqual(edits.count, 1)
                editID = try XCTUnwrap(edits.first?.id)
                XCTAssertNil(edits.first?.reviewedAt)
            })

            // Aceptar (✓).
            try await app.test(.POST, "fonts/edits/\(editID)/review", headers: bearer(adminTok)) { res in
                XCTAssertEqual(res.status, .noContent)
            }

            // Ya no está en la cola…
            try await app.test(.GET, "fonts/edits?unreviewed=true", headers: bearer(adminTok), afterResponse: { res in
                XCTAssertEqual(try res.content.decode([FontEditResponse].self).count, 0)
            })
            // …pero sí en el historial completo, marcada como revisada.
            try await app.test(.GET, "fonts/edits", headers: bearer(adminTok), afterResponse: { res in
                let all = try res.content.decode([FontEditResponse].self)
                XCTAssertEqual(all.count, 1)
                XCTAssertNotNil(all.first?.reviewedAt)
            })
        }
    }

    /// Guardar favorito requiere sesión.
    func testFavoriteRequiresAuth() async throws {
        try await withApp { app in
            try await register(app, username: "anon-fav")
            let token = try await login(app, username: "anon-fav")
            let fontID = try await createFont(app, token: token, name: "F", lat: 40, long: -3)
            try await app.test(.POST, "fonts/\(fontID)/favorite") { res in
                XCTAssertEqual(res.status, .unauthorized)
            }
        }
    }

    /// El resumen semanal recoge la actividad AJENA en tus fuentes (y no la tuya),
    /// y una fuente nueva de otro cerca cuenta como novedad.
    func testWeeklyDigestCollectsOthersActivity() async throws {
        try await withApp { app in
            try await register(app, username: "digest-owner")
            try await register(app, username: "digest-other")
            let owner = try await login(app, username: "digest-owner")
            let other = try await login(app, username: "digest-other")

            let fontID = try await createFont(app, token: owner, name: "Font meva", lat: 41.8, long: 2.1)
            _ = try await addComment(app, token: other, fontID: fontID, body: "Rajava bé")
            _ = try await addComment(app, token: owner, fontID: fontID, body: "La meva pròpia")
            _ = try await createFont(app, token: other, name: "Font nova a prop", lat: 41.81, long: 2.11)

            guard let user = try await User.query(on: app.db).filter(\.$username == "digest-owner").first() else {
                return XCTFail("usuari no trobat")
            }
            let digest = try await WeeklyDigest.build(for: user, since: Date().addingTimeInterval(-7 * 86_400), on: app.db)
            XCTAssertTrue(digest.isWorthSending)
            // Solo la reseña del OTRO, nunca la propia.
            XCTAssertEqual(digest.activity.count, 1)
            XCTAssertEqual(digest.activity.first?.author, "digest-other")
            XCTAssertEqual(digest.fontsAdded, 1)
            XCTAssertEqual(digest.nearby.map(\.name), ["Font nova a prop"])
        }
    }

    /// Sin actividad ajena no se envía nada (un resumen vacío solo enseña a ignorarlo).
    func testWeeklyDigestSkipsQuietWeek() async throws {
        try await withApp { app in
            try await register(app, username: "digest-quiet")
            let token = try await login(app, username: "digest-quiet")
            _ = try await createFont(app, token: token, name: "Font solitària", lat: 10, long: 10)
            guard let user = try await User.query(on: app.db).filter(\.$username == "digest-quiet").first() else {
                return XCTFail("usuari no trobat")
            }
            let digest = try await WeeklyDigest.build(for: user, since: Date().addingTimeInterval(-7 * 86_400), on: app.db)
            XCTAssertFalse(digest.isWorthSending)
        }
    }

    /// La baja desde el correo funciona sin sesión, pero solo con el token firmado
    /// correcto: uno inventado (o el de otro usuario) no da de baja a nadie.
    func testUnsubscribeNeedsValidToken() async throws {
        try await withApp { app in
            let userID = try await register(app, username: "digest-unsub")

            try await app.test(.POST, "users/unsubscribe", beforeRequest: { req in
                try req.content.encode(UnsubscribeDTO(user: userID.uuidString, token: "inventat"))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
            })

            try await app.test(.POST, "users/unsubscribe", beforeRequest: { req in
                try req.content.encode(UnsubscribeDTO(user: userID.uuidString, token: UnsubscribeToken.make(userID: userID)))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })
            let user = try await User.find(userID, on: app.db)
            XCTAssertEqual(user?.weeklyDigest, false)
        }
    }

    /// El envío manual del resumen es la acción de mayor alcance de la app
    /// (escribe a todos los usuarios): solo el propietario, ni siquiera un admin.
    func testWeeklyDigestSendIsOwnerOnly() async throws {
        try await withApp { app in
            let adminID = try await register(app, username: "digest-admin")
            try await setRole(app, userID: adminID, role: .admin)
            let adminTok = try await login(app, username: "digest-admin")

            try await app.test(.GET, "admin/weekly-digest", headers: bearer(adminTok), afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })
            try await app.test(.POST, "admin/weekly-digest", headers: bearer(adminTok), afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })
            try await app.test(.GET, "admin/weekly-digest", afterResponse: { res in
                XCTAssertEqual(res.status, .unauthorized)
            })

            // El propietario sí puede, y la vista previa no envía nada.
            let bossID = try await register(app, username: "digest-boss")
            try await setRole(app, userID: bossID, role: .owner)
            let ownerTok = try await login(app, username: "digest-boss")
            try await app.test(.GET, "admin/weekly-digest", headers: bearer(ownerTok), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                XCTAssertFalse(try res.content.decode(WeeklyDigestSender.Result.self).sent)
            })
        }
    }

    /// El contador de altas del distintivo: solo admins, y entiende la fecha que manda
    /// el navegador (`toISOString()`, con milisegundos).
    func testNewUsersCount() async throws {
        try await withApp { app in
            let adminID = try await register(app, username: "count-admin")
            try await setRole(app, userID: adminID, role: .admin)
            let adminTok = try await login(app, username: "count-admin")

            // Un usuario normal no ve la estadística.
            try await register(app, username: "count-plain")
            let plainTok = try await login(app, username: "count-plain")
            try await app.test(.GET, "users/stats/new", headers: bearer(plainTok), afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })

            // Marca de tiempo con milisegundos, como la que manda el navegador.
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let now = f.string(from: Date())

            try await app.test(.GET, "users/stats/new?since=\(now)", headers: bearer(adminTok), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                // Nadie s'ha registrat després d'aquest instant.
                XCTAssertEqual(try res.content.decode(NewUsersCount.self).count, 0)
            })

            try await register(app, username: "count-new-one")
            try await register(app, username: "count-new-two")

            try await app.test(.GET, "users/stats/new?since=\(now)", headers: bearer(adminTok), afterResponse: { res in
                XCTAssertEqual(try res.content.decode(NewUsersCount.self).count, 2)
            })
        }
    }

    /// El código del cartel (`?p=…`) se guarda con el alta, y entra saneado a la BD:
    /// lo escribe quien quiera en la URL, así que nada de HTML ni cadenas kilométricas.
    func testSignupSourceIsStoredAndCleaned() async throws {
        try await withApp { app in
            try await app.test(.POST, "users", beforeRequest: { req in
                var dto = CreateUserDTO(name: "Cartell", username: "src-user", email: "src@example.com", password: "password123")
                dto.source = "  CASTELLCIR/<script>x</script> "
                try req.content.encode(dto)
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
            })
            let user = try await User.query(on: app.db).filter(\.$username == "src-user").first()
            XCTAssertEqual(user?.signupSource, "castellcirscriptxscript")

            // Sin código: queda nulo, no cadena vacía.
            try await register(app, username: "src-none")
            let plain = try await User.query(on: app.db).filter(\.$username == "src-none").first()
            XCTAssertNil(plain?.signupSource)

            // Tope de longitud.
            XCTAssertEqual(UserController.cleanSource(String(repeating: "a", count: 100))?.count, 40)
            XCTAssertNil(UserController.cleanSource("///"))
        }
    }

    /// La actividad reciente mezcla los movimientos, más nuevos primero, y es de
    /// LECTURA PÚBLICA — salvo las ediciones, que solo ven los administradores.
    func testActivityFeed() async throws {
        try await withApp { app in
            let adminID = try await register(app, username: "act-admin")
            try await setRole(app, userID: adminID, role: .admin)
            let adminTok = try await login(app, username: "act-admin")

            try await register(app, username: "act-user")
            let userTok = try await login(app, username: "act-user")

            let fontID = try await createFont(app, token: userTok, name: "Font activitat", lat: 41.8, long: 2.1)
            _ = try await addComment(app, token: userTok, fontID: fontID, body: "Raja bé")

            // Sin sesión: se ve igual. Lo que hay aquí ya está en la ficha de la fuente.
            try await app.test(.GET, "activity?limit=10", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let items = try res.content.decode([ActivityItem].self)
                XCTAssertTrue(items.contains { $0.kind == .fontAdded && $0.fontName == "Font activitat" })
                XCTAssertTrue(items.contains { $0.kind == .review && $0.author == "act-user" })
                // Lo más nuevo, arriba.
                XCTAssertEqual(items.first?.createdAt, items.map(\.createdAt).max())
            })

            // Una edición: el historial es de moderación, así que no sale en público.
            try await app.test(.PUT, "fonts/\(fontID)", headers: bearer(userTok), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Font activitat", latitude: 41.8, longitude: 2.1, image: nil, description: "Editada", source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })

            try await app.test(.GET, "activity?limit=20", afterResponse: { res in
                XCTAssertFalse(try res.content.decode([ActivityItem].self).contains { $0.kind == .edit },
                               "el público no debe ver quién editó qué")
            })
            try await app.test(.GET, "activity?limit=20", headers: bearer(adminTok), afterResponse: { res in
                XCTAssertTrue(try res.content.decode([ActivityItem].self).contains { $0.kind == .edit })
            })

            // Filtro por zona: la fuente no tiene región, así que no sale.
            try await app.test(.GET, "activity?region=Barcelona", afterResponse: { res in
                XCTAssertEqual(try res.content.decode([ActivityItem].self).count, 0)
            })

            // Cercanía: dentro del radio sale; a mil kilómetros, no.
            try await app.test(.GET, "activity?lat=41.8&long=2.1&km=5", afterResponse: { res in
                XCTAssertTrue(try res.content.decode([ActivityItem].self).contains { $0.fontName == "Font activitat" })
            })
            try await app.test(.GET, "activity?lat=28.1&long=-15.4&km=5", afterResponse: { res in
                XCTAssertEqual(try res.content.decode([ActivityItem].self).count, 0)
            })
        }
    }

    /// Dos movimientos de la misma fuente no salen pegados mientras haya con qué
    /// separarlos.
    ///
    /// Crear una fuente y reseñarla acto seguido produce dos eventos con la misma hora,
    /// que ordenados por fecha quedan uno junto al otro y parecen un duplicado.
    func testActivityDoesNotStackSameFountain() async throws {
        try await withApp { app in
            try await register(app, username: "sep-user")
            let token = try await login(app, username: "sep-user")

            for n in 1...4 {
                let id = try await createFont(app, token: token, name: "Font sep \(n)", lat: 41.8, long: 2.1)
                _ = try await addComment(app, token: token, fontID: id, body: "Ressenya \(n)")
            }

            try await app.test(.GET, "activity?limit=20", afterResponse: { res in
                let items = try res.content.decode([ActivityItem].self)
                XCTAssertEqual(items.count, 8)
                // Arriba, que es lo que se ve, nunca hay repetición seguida.
                let cabeza = items.prefix(6)
                for (a, b) in zip(cabeza, cabeza.dropFirst()) {
                    XCTAssertNotEqual(a.fontID, b.fontID, "dos movimientos seguidos de la misma fuente")
                }
            })
        }
    }

    /// El reparto deshace las repeticiones seguidas y no pierde ni inventa nada.
    ///
    /// Puede quedar una al final: cuando ya solo restan movimientos de la misma fuente
    /// no hay nada que intercalar. Es el residuo, no un fallo — y el final de la lista
    /// es justo donde menos se mira.
    func testActivitySpreadSeparatesWhenItCan() throws {
        let a = UUID(), b = UUID(), c = UUID()
        let ahora = Date()
        // Llegan agrupados de dos en dos, que es justo el caso que se da en la vida real.
        let orden = [a, a, b, b, c, c]
        let items = orden.enumerated().map { i, id in
            ActivityItem(kind: .review, fontID: id, fontName: "F", region: nil, author: nil,
                         waterStatus: nil, text: nil, image: nil,
                         createdAt: ahora.addingTimeInterval(-Double(i)))
        }
        let salida = ActivityController.separaRepetidas(items)
        XCTAssertEqual(salida.count, items.count)
        XCTAssertEqual(Set(salida.map(\.createdAt)), Set(items.map(\.createdAt)), "no se pierde ni se duplica nada")
        let antes = zip(items, items.dropFirst()).filter { $0.fontID == $1.fontID }.count
        let despues = zip(salida, salida.dropFirst()).filter { $0.fontID == $1.fontID }.count
        XCTAssertEqual(antes, 3, "de entrada venían en parejas")
        XCTAssertLessThanOrEqual(despues, 1, "solo puede quedar el residuo del final")
        // Y ese residuo, si lo hay, está al final: en la cabeza no queda ninguna.
        let cabeza = salida.dropLast(2)
        XCTAssertEqual(zip(cabeza, cabeza.dropFirst()).filter { $0.fontID == $1.fontID }.count, 0)
    }

    /// Caso límite: si solo quedan movimientos de una misma fuente, no hay nada que meter
    /// entre medias y se devuelven tal cual. Documentado porque es el límite del método.
    func testActivitySpreadKeepsEverything() throws {
        let id = UUID()
        let ahora = Date()
        let items = (0..<3).map { i in
            ActivityItem(kind: .review, fontID: id, fontName: "F", region: nil, author: nil,
                         waterStatus: nil, text: nil, image: nil,
                         createdAt: ahora.addingTimeInterval(-Double(i)))
        }
        let salida = ActivityController.separaRepetidas(items)
        XCTAssertEqual(salida.map(\.createdAt), items.map(\.createdAt))
    }

    /// Una fuente nueva hereda país/región de la fuente clasificada más cercana, y no
    /// se inventa nada si en la zona no hay ninguna.
    func testNewFontInheritsZoneFromNearest() async throws {
        try await withApp { app in
            try await register(app, username: "zone-user")
            let token = try await login(app, username: "zone-user")

            // Vecina ya clasificada, a ~1 km.
            let neighbourID = try await createFont(app, token: token, name: "Veïna", lat: 41.800, long: 2.100)
            guard let neighbour = try await Font.find(neighbourID, on: app.db) else { return XCTFail("no trobada") }
            neighbour.country = "Spain"
            neighbour.region = "Barcelona"
            try await neighbour.save(on: app.db)

            let newID = try await createFont(app, token: token, name: "Nova a prop", lat: 41.809, long: 2.100)
            var created = try await Font.find(newID, on: app.db)
            for _ in 0..<50 where created?.region == nil {
                try await Task.sleep(nanoseconds: 100_000_000)
                created = try await Font.find(newID, on: app.db)
            }
            XCTAssertEqual(created?.region, "Barcelona")
            XCTAssertEqual(created?.country, "Spain")

            // Lejos de todo: sin vecina clasificada, se queda sin zona (no se inventa).
            let farID = try await createFont(app, token: token, name: "Lluny", lat: -33.9, long: 151.2)
            try await Task.sleep(nanoseconds: 500_000_000)
            let far = try await Font.find(farID, on: app.db)
            XCTAssertNil(far?.region)
        }
    }

    /// El tamaño de página que pide el cliente va acotado: `?per=100000` devolvía
    /// catorce megas por una petición anónima.
    func testPageSizeIsCapped() async throws {
        try await withApp { app in
            try await register(app, username: "pager")
            let token = try await login(app, username: "pager")
            for i in 0..<12 {
                _ = try await createFont(app, token: token, name: "Font \(i)", lat: 41.0 + Double(i) / 1000, long: 2.0)
            }
            try await app.test(.GET, "fonts?per=100000", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let page = try res.content.decode(Page<FontJSON>.self)
                XCTAssertLessThanOrEqual(page.metadata.per, SafePage.maxPer)
            })
            // Y una búsqueda con comodines busca el carácter literal, no todo.
            try await app.test(.GET, "fonts?search=%25", afterResponse: { res in
                XCTAssertEqual(try res.content.decode(Page<FontJSON>.self).metadata.total, 0)
            })
        }
    }

    // MARK: - Misiones (fase 4)

    /// La ruta ciega propone fuentes **sin foto** y ordenadas por distancia, no por lo que
    /// valen: una lista donde la primera parada está a 300 m y la segunda a 3 km no la
    /// hace nadie.
    func testBlindRouteListsPhotolessFountainsByDistance() async throws {
        try await withApp { app in
            _ = try await register(app, username: "rutero")
            let token = try await login(app, username: "rutero")

            // Tres cerca (una con foto) y una lejos, para comprobar los dos filtros.
            let lejana = try await createFont(app, token: token, name: "Lluny", lat: 42.5, long: 2.0975)
            let cerca1 = try await createFont(app, token: token, name: "A 100 m", lat: 41.8116, long: 2.0975)
            let cerca2 = try await createFont(app, token: token, name: "A 1 km", lat: 41.8197, long: 2.0975)
            let conFoto = try await createFont(app, token: token, name: "Ja té foto", lat: 41.8125, long: 2.0975)
            if let f = try await Font.find(conFoto, on: app.db) {
                f.image = "/uploads/ya-tiene.jpg"
                try await f.save(on: app.db)
            }

            try await app.test(.GET, "missions?lat=41.8107&long=2.0975&km=4", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let m = try res.content.decode(MissionController.Response.self)
                let ids = m.photoless.map { $0.id }
                XCTAssertTrue(ids.contains(cerca1))
                XCTAssertTrue(ids.contains(cerca2))
                XCTAssertFalse(ids.contains(conFoto), "si ya tiene foto, no es una parada de la ruta ciega")
                XCTAssertFalse(ids.contains(lejana), "fuera del radio")
                XCTAssertEqual(m.photoless.map { $0.distanceKm }, m.photoless.map { $0.distanceKm }.sorted(),
                               "las paradas van por distancia")
            })
        }
    }

    /// La ronda de comprobación son fuentes que **sí tienen foto** pero que nadie mira
    /// desde hace medio año. No se solapan con la ruta ciega: repetir la misma parada en
    /// dos rutas hace que ninguna de las dos parezca seria.
    func testCheckupRoundPicksForgottenFountainsAndDoesNotRepeatTheBlindRoute() async throws {
        try await withApp { app in
            let userID = try await register(app, username: "rondador")
            let token = try await login(app, username: "rondador")
            let olvidada = try await createFont(app, token: token, name: "Oblidada", lat: 41.8116, long: 2.0975)
            _ = try await createFont(app, token: token, name: "Sense foto", lat: 41.8120, long: 2.0975)

            if let f = try await Font.find(olvidada, on: app.db) {
                f.image = "/uploads/vieja.jpg"
                try await f.save(on: app.db)
            }
            // Una reseña de hace un año. `createdAt` lo pone Fluent, así que se reescribe
            // a mano: es la única forma de tener historia antigua en un test.
            let vieja = FontComment(fontID: olvidada, userID: userID, body: "Rajava")
            try await vieja.save(on: app.db)
            vieja.createdAt = Date().addingTimeInterval(-365 * 86_400)
            try await vieja.save(on: app.db)

            try await app.test(.GET, "missions?lat=41.8107&long=2.0975&km=4", afterResponse: { res in
                let m = try res.content.decode(MissionController.Response.self)
                XCTAssertTrue(m.stale.contains { $0.id == olvidada }, "un año sin visitas es una ronda")
                XCTAssertFalse(m.photoless.contains { $0.id == olvidada }, "ya tiene foto: no va en la ruta ciega")
                let repetidas = Set(m.stale.map { $0.id }).intersection(m.photoless.map { $0.id })
                XCTAssertTrue(repetidas.isEmpty, "una parada no puede salir en las dos rutas")
            })
        }
    }

    // MARK: - Gamificación (fase 2: registro y liquidación)

    /// Lo esencial del registro: se puede volver a pasar cuantas veces haga falta sin
    /// duplicar nada. Sin esto no se podría recalcular el histórico al tocar el baremo,
    /// que es justo para lo que existe.
    func testLedgerSyncIsIdempotent() async throws {
        try await withApp { app in
            _ = try await register(app, username: "ledger1")
            let token = try await login(app, username: "ledger1")
            let fontID = try await createFont(app, token: token, name: "Font del Registre", lat: 41.8, long: 2.1)
            _ = try await addComment(app, token: token, fontID: fontID, body: "Raja bé")

            let primera = try await ContributionLedger.sync(on: app.db)
            XCTAssertGreaterThan(primera.inserted, 0)
            let total = try await ContributionEvent.query(on: app.db).count()

            let segunda = try await ContributionLedger.sync(on: app.db)
            XCTAssertEqual(segunda.inserted, 0, "la segunda pasada no puede registrar nada nuevo")
            XCTAssertEqual(segunda.alreadyKnown, primera.inserted)
            let despues = try await ContributionEvent.query(on: app.db).count()
            XCTAssertEqual(despues, total, "el número de filas no puede crecer al re-sincronizar")
        }
    }

    /// La ventana de 72 h: nada se cobra al instante. Es la pieza antifraude central —
    /// evita el grueso del problema sin tener que detectar nada.
    func testNothingSettlesBeforeSeventyTwoHours() async throws {
        try await withApp { app in
            _ = try await register(app, username: "ledger2")
            let token = try await login(app, username: "ledger2")
            let fontID = try await createFont(app, token: token, name: "Font Nova", lat: 41.81, long: 2.11)
            _ = try await addComment(app, token: token, fontID: fontID, body: "Hi ha aigua")

            // Ahora mismo: todo pendiente, marcador a cero.
            let r = try await ContributionLedger.sync(on: app.db)
            XCTAssertEqual(r.settled, 0, "recién aportado no puede estar liquidado")
            let uid = try await User.query(on: app.db).filter(\.$username == "ledger2").first()!.requireID()
            var t = try await ContributionLedger.totals(for: uid, on: app.db)
            XCTAssertEqual(t.settled, 0)
            XCTAssertGreaterThan(t.pending, 0, "las gotas en camino sí se ven")

            // Tres días después: cobra.
            let despues = Date().addingTimeInterval(ContributionLedger.settlementWindow + 60)
            let r2 = try await ContributionLedger.sync(on: app.db, now: despues)
            XCTAssertGreaterThan(r2.settled, 0)
            t = try await ContributionLedger.totals(for: uid, on: app.db)
            XCTAssertGreaterThan(t.settled, 0)
            XCTAssertEqual(t.pending, 0)
        }
    }

    /// Borrar la reseña dentro de la ventana anula la aportación: la fila se queda como
    /// rastro, pero en estado `void` y sin sumar.
    func testDeletingTheContributionVoidsItInsteadOfPaying() async throws {
        try await withApp { app in
            _ = try await register(app, username: "ledger3")
            let token = try await login(app, username: "ledger3")
            let fontID = try await createFont(app, token: token, name: "Font Efímera", lat: 41.82, long: 2.12)
            let commentID = try await addComment(app, token: token, fontID: fontID, body: "Raja")

            _ = try await ContributionLedger.sync(on: app.db)
            let antes = try await ContributionEvent.query(on: app.db)
                .filter(\.$source == "comment").count()
            XCTAssertGreaterThan(antes, 0)

            try await app.test(.DELETE, "fonts/\(fontID)/comments/\(commentID)", headers: bearer(token),
                               afterResponse: { res in XCTAssertEqual(res.status, .noContent) })

            // Aunque hayan pasado los tres días, no cobra: ya no existe.
            let despues = Date().addingTimeInterval(ContributionLedger.settlementWindow + 60)
            _ = try await ContributionLedger.sync(on: app.db, now: despues)

            let delComentario = try await ContributionEvent.query(on: app.db)
                .filter(\.$source == "comment").all()
            XCTAssertTrue(delComentario.allSatisfy { $0.status == .void },
                          "la reseña borrada no puede quedar liquidada")
            XCTAssertTrue(delComentario.allSatisfy { $0.voidReason != nil }, "y debe decir por qué")

            let uid = try await User.query(on: app.db).filter(\.$username == "ledger3").first()!.requireID()
            let eventos = try await ContributionEvent.query(on: app.db)
                .filter(\.$user.$id == uid).filter(\.$status == .settled).all()
            XCTAssertFalse(eventos.contains { $0.source == "comment" })
        }
    }

    /// El marcador del perfil solo cuenta lo liquidado. Lo pendiente se enseña aparte:
    /// «120 gotas en camino» explica la espera; 120 gotas que luego desaparecen destruyen
    /// la confianza.
    func testProfileCountsOnlySettledGotes() async throws {
        try await withApp { app in
            _ = try await register(app, username: "perfil1")
            let token = try await login(app, username: "perfil1")
            let fontID = try await createFont(app, token: token, name: "Font del Perfil", lat: 41.84, long: 2.14)
            _ = try await addComment(app, token: token, fontID: fontID, body: "Raja")
            _ = try await ContributionLedger.sync(on: app.db)

            // Recién aportado: todo en camino, nada cobrado.
            try await app.test(.GET, "gamification/me", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let p = try res.content.decode(ContributionLedger.Profile.self)
                XCTAssertEqual(p.gotes, 0)
                XCTAssertGreaterThan(p.pending, 0)
                XCTAssertTrue(p.provisional, "sin GAMIFICATION_EPOCH todo es provisional")
            })

            // Pasados los tres días, lo mismo pero ya cobrado.
            _ = try await ContributionLedger.sync(
                on: app.db, now: Date().addingTimeInterval(ContributionLedger.settlementWindow + 60))
            try await app.test(.GET, "gamification/me", headers: bearer(token), afterResponse: { res in
                let p = try res.content.decode(ContributionLedger.Profile.self)
                XCTAssertGreaterThan(p.gotes, 0)
                XCTAssertEqual(p.pending, 0)
                XCTAssertEqual(p.impact.fontsYouPutOnTheMap, 1)
                XCTAssertEqual(p.impact.fontsYouKeepFresh, 1, "su reseña es la última de esa fuente")
            })
        }
    }

    /// Solo las peticiones que salen de la bandeja offline llevan la marca. Tiene que
    /// persistir en el contenido y alimentar la insignia incluso después de resincronizar.
    func testQueuedOfflineHeaderFeedsOfflineBadge() async throws {
        try await withApp { app in
            let userID = try await register(app, username: "offlinebadge")
            let token = try await login(app, username: "offlinebadge")
            var headers = bearer(token)
            headers.add(name: "X-FontApp-Queued-Offline", value: "1")

            var fontID = UUID()
            try await app.test(.POST, "fonts", headers: headers, beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Font sense senyal", latitude: 41.9,
                                                     longitude: 2.2, image: nil, description: nil,
                                                     source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .created)
                fontID = try res.content.decode(FontJSON.self).id ?? fontID
            })
            try await app.test(.POST, "fonts/\(fontID)/comments", headers: headers, beforeRequest: { req in
                try req.content.encode(CreateCommentDTO(body: "Raja", rating: nil,
                                                        waterStatus: nil, image: nil))
            }, afterResponse: { res in XCTAssertEqual(res.status, .created) })

            let storedFont = try await Font.find(fontID, on: app.db)
            let storedComment = try await FontComment.query(on: app.db)
                .filter(\.$font.$id == fontID).first()
            XCTAssertTrue(storedFont?.queuedOffline == true)
            XCTAssertTrue(storedComment?.queuedOffline == true)

            _ = try await ContributionLedger.sync(on: app.db)
            _ = try await ContributionLedger.sync(
                on: app.db, now: Date().addingTimeInterval(ContributionLedger.settlementWindow + 60))
            let profile = try await ContributionLedger.profile(for: userID, on: app.db)
            XCTAssertEqual(profile.collection.first { $0.family == "offline" }?.progress, 2)
        }
    }

    /// Apagar la gamificación devuelve 204, no un error: no es que falle, es que no hay
    /// nada que enseñar. Y las aportaciones se siguen contando por debajo.
    func testOptingOutHidesTheScoreButKeepsCounting() async throws {
        try await withApp { app in
            let userID = try await register(app, username: "perfil2")
            let token = try await login(app, username: "perfil2")
            let fontID = try await createFont(app, token: token, name: "Font Discreta", lat: 41.85, long: 2.15)
            _ = try await addComment(app, token: token, fontID: fontID, body: "Bona")
            _ = try await ContributionLedger.sync(on: app.db)

            try await app.test(.PUT, "users/\(userID)", headers: bearer(token), beforeRequest: { req in
                struct Patch: Content {
                    let name: String, username: String, email: String, gamificationOptOut: Bool
                }
                try req.content.encode(Patch(name: "Perfil", username: "perfil2",
                                             email: "perfil2@example.com", gamificationOptOut: true))
            }, afterResponse: { res in XCTAssertEqual(res.status, .ok) })

            try await app.test(.GET, "gamification/me", headers: bearer(token), afterResponse: { res in
                XCTAssertEqual(res.status, .noContent)
            })

            // Pero las aportaciones siguen registradas: apagar el marcador no borra nada.
            let eventos = try await ContributionEvent.query(on: app.db)
                .filter(\.$user.$id == userID).count()
            XCTAssertGreaterThan(eventos, 0)
        }
    }

    /// Las gotas quedan congeladas con el valor del día en que se registraron. Si mañana
    /// se sube el baremo, el marcador de quien ya aportó no cambia de golpe.
    func testSettledGotesAreFrozenAgainstBaremoChanges() async throws {
        try await withApp { app in
            _ = try await register(app, username: "ledger4")
            let token = try await login(app, username: "ledger4")
            let fontID = try await createFont(app, token: token, name: "Font Congelada", lat: 41.83, long: 2.13)
            _ = try await addComment(app, token: token, fontID: fontID, body: "Bona")

            _ = try await ContributionLedger.sync(on: app.db)
            let original = try await ContributionEvent.query(on: app.db).all().map { $0.gotes }.reduce(0, +)

            // Re-sincronizar no reescribe lo ya registrado, pase lo que pase con el cálculo.
            _ = try await ContributionLedger.sync(on: app.db)
            let despues = try await ContributionEvent.query(on: app.db).all().map { $0.gotes }.reduce(0, +)
            XCTAssertEqual(original, despues)
        }
    }

    // MARK: - Capacidades por nivel (fase 6)

    /// Deja a un usuario con gotas suficientes y repartidas en días distintos, sin
    /// pasar por el baremo: aquí lo que se prueba son las **puertas**, no el cálculo.
    private func grantGotes(_ userID: UUID, _ gotes: Int, days: Int, on db: any Database,
                            status: ContributionEvent.Status = .settled,
                            voidReason: String? = nil) async throws {
        for i in 0..<days {
            let cuando = Date().addingTimeInterval(-Double(i + 1) * 86_400)
            let e = ContributionEvent()
            e.$user.id = userID
            e.source = "font"
            e.subjectID = UUID()
            e.detail = "test-\(i)"
            e.kind = ContributionScore.Kind.fontCreated.rawValue
            e.base = gotes / days
            e.multiplier = 1
            e.gotes = gotes / days
            e.status = status
            e.voidReason = voidReason
            e.occurredAt = cuando
            e.settlesAt = cuando
            e.settledAt = cuando
            try await e.save(on: db)
        }
    }

    /// El interruptor por defecto está **apagado**, y sin él ningún nivel abre nada.
    /// Es la propiedad que hace que desplegar la fase 6 no cambie nada por sí solo.
    func testCapabilitiesAreOffUntilExplicitlyEnabled() async throws {
        try await withApp { app in
            let id = try await register(app, username: "nivelazo")
            try await grantGotes(id, 100_000, days: 40, on: app.db)
            let user = try await User.find(id, on: app.db)!

            unsetenv("GAMIFICATION_CAPABILITIES")
            unsetenv("GAMIFICATION_EPOCH")
            var grant = try await Capabilities.of(user, on: app.db)
            XCTAssertTrue(grant.capabilities.isEmpty, "Apagado por defecto, ni con 100.000 gotas.")
            XCTAssertEqual(grant.blockedBy, ["disabled"])

            // Encendido pero con puntos provisionales: tampoco. Conceder escritura sobre
            // puntos que `--rescore` puede reescribir da permisos que desaparecen solos.
            setenv("GAMIFICATION_CAPABILITIES", "true", 1)
            grant = try await Capabilities.of(user, on: app.db)
            XCTAssertTrue(grant.capabilities.isEmpty)
            XCTAssertEqual(grant.blockedBy, ["provisional"])
            unsetenv("GAMIFICATION_CAPABILITIES")
        }
    }

    /// Con los dos interruptores puestos, las gotas solas no bastan: hacen falta días
    /// distintos. Si no, el camino a «mover el pin de cualquiera» es una tarde intensa.
    func testCapabilityNeedsDaysAndNotJustGotes() async throws {
        try await withApp { app in
            setenv("GAMIFICATION_CAPABILITIES", "true", 1)
            setenv("GAMIFICATION_EPOCH", "2020-01-01", 1)
            defer { unsetenv("GAMIFICATION_CAPABILITIES"); unsetenv("GAMIFICATION_EPOCH") }

            let prisa = try await register(app, username: "conprisa")
            try await grantGotes(prisa, 50_000, days: 2, on: app.db)
            let rapido = try await Capabilities.of(try await User.find(prisa, on: app.db)!, on: app.db)
            XCTAssertTrue(rapido.capabilities.isEmpty)
            XCTAssertEqual(rapido.blockedBy, ["activeDays"])

            let constante = try await register(app, username: "constante")
            try await grantGotes(constante, 5_000, days: 20, on: app.db)
            let lento = try await Capabilities.of(try await User.find(constante, on: app.db)!, on: app.db)
            XCTAssertTrue(lento.capabilities.contains(.relocateAnyFont))
        }
    }

    /// Una anulación reciente por mala conducta cierra las puertas; pasarse del techo
    /// diario NO, porque eso es haber aportado mucho, no haber hecho nada malo.
    func testRecentMisconductClosesTheDoorButHittingTheDailyCapDoesNot() async throws {
        try await withApp { app in
            setenv("GAMIFICATION_CAPABILITIES", "true", 1)
            setenv("GAMIFICATION_EPOCH", "2020-01-01", 1)
            defer { unsetenv("GAMIFICATION_CAPABILITIES"); unsetenv("GAMIFICATION_EPOCH") }

            let sancionada = try await register(app, username: "denunciada")
            try await grantGotes(sancionada, 5_000, days: 20, on: app.db)
            try await grantGotes(sancionada, 10, days: 1, on: app.db, status: .void,
                                 voidReason: "contenido denunciado durante la ventana de liquidación")
            let mala = try await Capabilities.of(try await User.find(sancionada, on: app.db)!, on: app.db)
            XCTAssertEqual(mala.blockedBy, ["recentlyVoided"])

            let generosa = try await register(app, username: "generosa")
            try await grantGotes(generosa, 5_000, days: 20, on: app.db)
            try await grantGotes(generosa, 10, days: 1, on: app.db, status: .void,
                                 voidReason: "por encima del techo de 4000 gotas de ese día")
            let buena = try await Capabilities.of(try await User.find(generosa, on: app.db)!, on: app.db)
            XCTAssertTrue(buena.capabilities.contains(.relocateAnyFont),
                          "Pasarse del techo diario no es mala conducta.")
        }
    }

    /// La puerta de verdad: reubicar una fuente ajena por HTTP. Y lo que NO se abre —
    /// sustituir la foto y borrar siguen siendo del creador o de un admin.
    func testLevelLetsYouRelocateSomeoneElsesFountainButNotDeleteOrReplaceItsPhoto() async throws {
        try await withApp { app in
            setenv("GAMIFICATION_CAPABILITIES", "true", 1)
            setenv("GAMIFICATION_EPOCH", "2020-01-01", 1)
            defer { unsetenv("GAMIFICATION_CAPABILITIES"); unsetenv("GAMIFICATION_EPOCH") }

            _ = try await register(app, username: "duena")
            let tokenD = try await login(app, username: "duena")
            let fontID = try await createFont(app, token: tokenD, name: "Font aliena", lat: 41.5, long: 2.0)
            let f = try await Font.find(fontID, on: app.db)!
            f.image = "/uploads/original.jpg"
            try await f.save(on: app.db)

            let veterana = try await register(app, username: "veterana")
            let tokenV = try await login(app, username: "veterana")
            try await grantGotes(veterana, 5_000, days: 20, on: app.db)

            try await app.test(.PUT, "fonts/\(fontID)", headers: bearer(tokenV), beforeRequest: { req in
                try req.content.encode(CreateFontDTO(name: "Font aliena", latitude: 41.6, longitude: 2.1,
                                                     image: "/uploads/suplantada.jpg", description: nil,
                                                     source: nil, drinkable: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })

            let despues = try await Font.find(fontID, on: app.db)!
            XCTAssertEqual(despues.latitude, 41.6, accuracy: 0.0001, "El nivel abre mover el pin.")
            XCTAssertEqual(despues.image, "/uploads/original.jpg",
                           "Pero NO sustituir la foto: eso invita a la guerra de ediciones.")

            // Y borrar sigue cerrado.
            try await app.test(.DELETE, "fonts/\(fontID)", headers: bearer(tokenV), afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden, "Borrar no se abre por nivel: no se deshace.")
            })

            // El movimiento queda registrado y por tanto es reversible desde el panel.
            let ediciones = try await FontEdit.query(on: app.db).filter(\.$font.$id == fontID).all()
            XCTAssertEqual(ediciones.count, 1)
            XCTAssertEqual(ediciones.first?.before.latitude ?? 0, 41.5, accuracy: 0.0001)
        }
    }

    /// Quien apaga la gamificación no recibe poderes por un contador que ha pedido no
    /// tener. Y un admin los tiene por su rol, con el sistema apagado o encendido.
    func testOptedOutGetsNoPowersAndAdminsDoNotNeedThem() async throws {
        try await withApp { app in
            let id = try await register(app, username: "apagada")
            try await grantGotes(id, 50_000, days: 30, on: app.db)
            let u = try await User.find(id, on: app.db)!
            u.gamificationOptOut = true
            try await u.save(on: app.db)

            setenv("GAMIFICATION_CAPABILITIES", "true", 1)
            setenv("GAMIFICATION_EPOCH", "2020-01-01", 1)
            defer { unsetenv("GAMIFICATION_CAPABILITIES"); unsetenv("GAMIFICATION_EPOCH") }

            let grant = try await Capabilities.of(u, on: app.db)
            XCTAssertEqual(grant.blockedBy, ["optedOut"])

            let adminID = try await register(app, username: "jefa")
            let admin = try await User.find(adminID, on: app.db)!
            admin.role = .admin
            try await admin.save(on: app.db)
            unsetenv("GAMIFICATION_CAPABILITIES")
            let suyas = try await Capabilities.of(admin, on: app.db)
            XCTAssertTrue(suyas.capabilities.contains(.relocateAnyFont),
                          "El admin ya lo puede por rol; el nivel no le quita nada.")
        }
    }

    /// Los nuevos retos se reconstruyen desde el historial liquidado: una secuencia seca
    /// → incidencia → vuelve a manar, tres fuentes el mismo día y una confirmación ajena.
    /// Este caso evita que el catálogo pueda crecer mientras todos los contadores reales
    /// se quedan accidentalmente en cero.
    func testContextualBadgesProgressFromSettledHistory() async throws {
        try await withApp { app in
            let ownerID = try await register(app, username: "badgeowner")
            let explorerID = try await register(app, username: "badgeexplorer")
            let ownerToken = try await login(app, username: "badgeowner")
            let explorerToken = try await login(app, username: "badgeexplorer")

            let oldFontID = try await createFont(app, token: ownerToken, name: "Antiga", lat: 41, long: 2)
            let secondID = try await createFont(app, token: ownerToken, name: "Segona", lat: 42, long: 1)
            let thirdID = try await createFont(app, token: ownerToken, name: "Tercera", lat: 43, long: 0)
            let countries = [(oldFontID, "España"), (secondID, "Francia"), (thirdID, "Portugal")]
            for (id, country) in countries {
                let f = try await Font.find(id, on: app.db)!
                f.country = country
                f.region = country
                try await f.save(on: app.db)
            }

            let now = Date()
            let dryAt = now.addingTimeInterval(-400 * 86_400)
            let reportAt = now.addingTimeInterval(-10 * 86_400)
            let routeAt = now.addingTimeInterval(-5 * 86_400)

            let dry = FontComment(fontID: oldFontID, userID: ownerID, body: "Seca", waterStatus: "dry")
            try await dry.save(on: app.db)
            let report = FontReport(fontID: oldFontID, userID: explorerID, message: "Continua seca")
            try await report.save(on: app.db)
            let recovered = FontComment(fontID: oldFontID, userID: explorerID,
                                        body: "Torna a rajar", waterStatus: "flowing")
            try await recovered.save(on: app.db)
            let second = FontComment(fontID: secondID, userID: explorerID,
                                     body: "Comprovada", waterStatus: "flowing")
            try await second.save(on: app.db)
            let third = FontComment(fontID: thirdID, userID: explorerID,
                                    body: "Comprovada", waterStatus: "flowing")
            try await third.save(on: app.db)
            let confirmation = FontConfirmation(commentID: try dry.requireID(), userID: explorerID)
            try await confirmation.save(on: app.db)

            guard let sql = app.db as? SQLDatabase else { return XCTFail("Postgres requerido") }
            try await sql.raw("UPDATE font_comments SET created_at = \(bind: dryAt) WHERE id = \(bind: dry.requireID())").run()
            for id in [try recovered.requireID(), try second.requireID(), try third.requireID()] {
                try await sql.raw("UPDATE font_comments SET created_at = \(bind: routeAt) WHERE id = \(bind: id)").run()
            }
            try await sql.raw("UPDATE font_reports SET created_at = \(bind: reportAt) WHERE id = \(bind: report.requireID())").run()
            try await sql.raw("UPDATE font_confirmations SET created_at = \(bind: routeAt) WHERE id = \(bind: confirmation.requireID())").run()

            _ = try await ContributionLedger.sync(on: app.db, now: now)
            let profile = try await ContributionLedger.profile(for: explorerID, on: app.db, now: now)
            func slot(_ family: String) -> ContributionScore.BadgeSlot? {
                profile.collection.first { $0.family == family }
            }

            XCTAssertEqual(slot("waterRecovered")?.progress, 1)
            XCTAssertEqual(slot("waterRecovered")?.tier, "bronze")
            XCTAssertEqual(slot("routes")?.progress, 1)
            XCTAssertEqual(slot("verifier")?.progress, 1)
            XCTAssertEqual(slot("international")?.progress, 3)
            XCTAssertEqual(slot("international")?.tier, "bronze")
            XCTAssertEqual(slot("reunion")?.progress, 1)
            XCTAssertEqual(slot("incidentResolved")?.progress, 1)
            XCTAssertEqual(slot("guardianLocal")?.progress, 3)
        }
    }

    // MARK: - Zonas (fase 5)

    /// Las barras cuentan fuentes de la zona, no reseñas: una fuente muy comentada no
    /// puede inflar la cobertura de su comarca. Es el fallo clásico de un `JOIN` mal
    /// agrupado y aquí se mediría como «esta comarca tiene 12 fuentes» teniendo 3.
    func testZoneCoverageCountsFountainsAndNotReviews() async throws {
        try await withApp { app in
            _ = try await register(app, username: "zona1")
            let token = try await login(app, username: "zona1")

            let conFoto = try await createFont(app, token: token, name: "Amb foto", lat: 41.80, long: 2.10)
            let sinFoto = try await createFont(app, token: token, name: "Sense foto", lat: 41.81, long: 2.11)
            let fuera = try await createFont(app, token: token, name: "Fora de zona", lat: 40.00, long: 1.00)

            // Las tres primeras en la misma región; la de fuera, en otra.
            for id in [conFoto, sinFoto] {
                let f = try await Font.find(id, on: app.db)!
                f.region = "Osona"
                f.country = "España"
                if id == conFoto { f.image = "/uploads/x.jpg" }
                try await f.save(on: app.db)
            }
            let otra = try await Font.find(fuera, on: app.db)!
            otra.region = "Segrià"
            try await otra.save(on: app.db)

            // Cuatro reseñas sobre la MISMA fuente: no debe contar como cuatro fuentes.
            for i in 0..<4 { _ = try await addComment(app, token: token, fontID: conFoto, body: "Ressenya \(i)") }

            try await app.test(.GET, "zones", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let out = try res.content.decode(ZoneController.CoverageResponse.self)
                let osona = out.zones.first { $0.region == "Osona" }
                XCTAssertEqual(osona?.fonts, 2, "Cuatro reseñas sobre una fuente no son cuatro fuentes.")
                XCTAssertEqual(osona?.withPhoto, 1)
                XCTAssertEqual(osona?.photoPct, 50)
                // Solo la reseñada cuenta como comprobada, aunque lo esté cuatro veces.
                XCTAssertEqual(osona?.checkedRecently, 1)
                XCTAssertEqual(out.zones.first { $0.region == "Segrià" }?.fonts, 1)
            })
        }
    }

    /// Quien apaga la gamificación desaparece de la tabla del mes pero **sigue contando
    /// en las barras de la zona**. El interruptor dice que oculta puntos y tablas; si
    /// apagarlo te dejara igualmente en una tabla pública, estaría mintiendo. Las barras
    /// son del territorio y no de nadie, así que ahí no aplica.
    func testOptingOutHidesYouFromTheRankingButNotFromTheZoneBars() async throws {
        try await withApp { app in
            let discreta = try await register(app, username: "discreta")
            _ = try await register(app, username: "visible")
            let tokenD = try await login(app, username: "discreta")
            let tokenV = try await login(app, username: "visible")

            let fontD = try await createFont(app, token: tokenD, name: "Font discreta", lat: 41.90, long: 2.20)
            let fontV = try await createFont(app, token: tokenV, name: "Font visible", lat: 41.91, long: 2.21)
            for id in [fontD, fontV] {
                let f = try await Font.find(id, on: app.db)!
                f.region = "Bages"
                try await f.save(on: app.db)
            }
            _ = try await ContributionLedger.sync(on: app.db, now: Date().addingTimeInterval(96 * 3_600))

            // Antes de apagarlo, las dos salen.
            try await app.test(.GET, "zones/ranking?region=Bages", afterResponse: { res in
                let r = try res.content.decode(ZoneStats.Ranking.self)
                XCTAssertEqual(Set(r.rows.map(\.username)), ["discreta", "visible"])
            })

            let u = try await User.find(discreta, on: app.db)!
            u.gamificationOptOut = true
            try await u.save(on: app.db)
            await ZoneController.cache.clear()

            try await app.test(.GET, "zones/ranking?region=Bages", afterResponse: { res in
                let r = try res.content.decode(ZoneStats.Ranking.self)
                XCTAssertEqual(r.rows.map(\.username), ["visible"], "El opt-out tiene que sacarte de la tabla.")
            })
            try await app.test(.GET, "zones", afterResponse: { res in
                let out = try res.content.decode(ZoneController.CoverageResponse.self)
                XCTAssertEqual(out.zones.first { $0.region == "Bages" }?.fonts, 2,
                               "Las barras son del territorio: el opt-out no descuenta la fuente.")
            })
        }
    }

    /// El ranking es MENSUAL: lo del mes pasado no se arrastra. Un ranking histórico lo
    /// gana para siempre quien llegó primero y a partir de ahí nadie más juega.
    func testRankingOnlyCountsTheMonthAsked() async throws {
        try await withApp { app in
            _ = try await register(app, username: "mensual")
            let token = try await login(app, username: "mensual")
            let fontID = try await createFont(app, token: token, name: "Font del mes", lat: 41.70, long: 2.05)
            let f = try await Font.find(fontID, on: app.db)!
            f.region = "Anoia"
            try await f.save(on: app.db)
            _ = try await ContributionLedger.sync(on: app.db, now: Date().addingTimeInterval(96 * 3_600))

            // Un mes en el que no hubo nada sale vacío, no con lo de este mes.
            try await app.test(.GET, "zones/ranking?region=Anoia&month=2001-01", afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let r = try res.content.decode(ZoneStats.Ranking.self)
                XCTAssertEqual(r.month, "2001-01")
                XCTAssertTrue(r.rows.isEmpty)
            })
            // Y un mes ilegible es un error, no el mes en curso servido en silencio.
            try await app.test(.GET, "zones/ranking?region=Anoia&month=agosto", afterResponse: { res in
                XCTAssertEqual(res.status, .badRequest)
            })
        }
    }
}
