import Fluent
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
                try req.content.encode(UpdateUserDTO(name: "Test", username: "priv", email: "priv@example.com", password: nil, emailPublic: true, namePublic: nil))
            }, afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
            })
            try await app.test(.GET, "users/priv") { res in
                XCTAssertEqual(try res.content.decode(UserResponse.self).email, "priv@example.com") // ahora visible
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
                let fonts = try res.content.decode([Font].self)
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
                let fonts = try res.content.decode([Font].self)
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

    /// La actividad reciente mezcla los cuatro tipos de movimiento, más nuevos primero,
    /// y es solo para admins.
    func testActivityFeed() async throws {
        try await withApp { app in
            let adminID = try await register(app, username: "act-admin")
            try await setRole(app, userID: adminID, role: .admin)
            let adminTok = try await login(app, username: "act-admin")

            try await register(app, username: "act-user")
            let userTok = try await login(app, username: "act-user")
            try await app.test(.GET, "activity", headers: bearer(userTok), afterResponse: { res in
                XCTAssertEqual(res.status, .forbidden)
            })
            try await app.test(.GET, "activity", afterResponse: { res in
                XCTAssertEqual(res.status, .unauthorized)
            })

            let fontID = try await createFont(app, token: userTok, name: "Font activitat", lat: 41.8, long: 2.1)
            _ = try await addComment(app, token: userTok, fontID: fontID, body: "Raja bé")

            try await app.test(.GET, "activity?limit=10", headers: bearer(adminTok), afterResponse: { res in
                XCTAssertEqual(res.status, .ok)
                let items = try res.content.decode([ActivityItem].self)
                XCTAssertTrue(items.contains { $0.kind == .fontAdded && $0.fontName == "Font activitat" })
                XCTAssertTrue(items.contains { $0.kind == .review && $0.author == "act-user" })
                // Orden: del más reciente al más antiguo.
                XCTAssertEqual(items.map(\.createdAt), items.map(\.createdAt).sorted(by: >))
            })

            // Filtro por zona: la fuente no tiene región, así que no sale.
            try await app.test(.GET, "activity?region=Barcelona", headers: bearer(adminTok), afterResponse: { res in
                XCTAssertEqual(try res.content.decode([ActivityItem].self).count, 0)
            })
        }
    }
}
