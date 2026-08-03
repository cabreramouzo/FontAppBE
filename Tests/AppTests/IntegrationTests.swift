import Foundation
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

    private func createFont(_ app: Application, token: String, name: String, lat: Double, long: Double) async throws -> UUID {
        var id = UUID()
        try await app.test(.POST, "fonts", headers: bearer(token), beforeRequest: { req in
            try req.content.encode(CreateFontDTO(name: name, latitude: lat, longitude: long, image: nil, description: nil, source: nil, drinkable: nil))
        }, afterResponse: { res in
            XCTAssertEqual(res.status, .created)
            id = try res.content.decode(Font.self).id ?? id
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
        u.isAdmin = true
        try await u.save(on: app.db)
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
                try req.content.encode(UpdateUserDTO(name: "hack", username: "usera", email: "hack@example.com", password: nil, emailPublic: nil))
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
                XCTAssertEqual(try res.content.decode(Font.self).name, "Original")
            }
            try await app.test(.GET, "fonts/\(fontID)") { res in
                XCTAssertEqual(try res.content.decode(Font.self).name, "Original")
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

            // Un extraño no puede promover.
            try await register(app, username: "photostranger")
            let strangerTok = try await login(app, username: "photostranger")
            try await app.test(.POST, "fonts/\(fontID)/photo/from-comment/\(commentID)", headers: bearer(strangerTok)) { res in
                XCTAssertEqual(res.status, .forbidden)
            }

            // El creador sí; la imagen resultante es una copia (distinta de la de la reseña).
            struct FontOut: Content { let image: String? }
            try await app.test(.POST, "fonts/\(fontID)/photo/from-comment/\(commentID)", headers: bearer(ownerTok)) { res in
                XCTAssertEqual(res.status, .ok)
                let f = try res.content.decode(FontOut.self)
                XCTAssertNotNil(f.image)
                XCTAssertNotEqual(f.image, "/uploads/orig.jpg")
            }
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
                try req.content.encode(UpdateUserDTO(name: "Test", username: "priv", email: "priv@example.com", password: nil, emailPublic: true))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })
            try await app.test(.GET, "users/priv") { res in
                XCTAssertEqual(try res.content.decode(UserResponse.self).email, "priv@example.com") // ahora visible
            }
        }
    }

    // MARK: - Ubicación de registro (geo-IP) y estadística

    /// El GeoLocator configurado rellena país/región/ciudad al registrarse.
    func testSignupLocationStored() async throws {
        try await withApp { app in
            app.geoLocator = StubGeoLocator(location: GeoLocation(country: "Spain", region: "Galicia", city: "A Coruña"))
            let id = try await register(app, username: "galego")
            let u = try await User.find(id, on: app.db)
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
}
