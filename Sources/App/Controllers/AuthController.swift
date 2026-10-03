import Fluent
import Vapor

// Autenticación por token Bearer respaldado en BD.
// Flujo: POST /auth/login (Basic user:pass) -> token; luego `Authorization: Bearer <token>`.
struct AuthController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let auth = routes.grouped("auth")

        // Rate-limit anti fuerza bruta en los endpoints sensibles (por IP).
        let loginThrottle = RateLimitMiddleware(scope: "login", max: 10, window: 5 * 60)   // 10 / 5 min
        let resetThrottle = RateLimitMiddleware(scope: "reset", max: 5, window: 15 * 60)   // 5 / 15 min

        // Login con Basic auth, con rate-limit ANTES de autenticar. El identificador
        // puede ser el nombre de usuario O el email (ver UserCredentialsAuthenticator).
        auth.grouped(loginThrottle).grouped(UserCredentialsAuthenticator()).post("login", use: login)
        auth.grouped(RateLimitMiddleware(scope: "google-login", max: 10, window: 5 * 60))
            .post("google", use: google)
        auth.grouped(RateLimitMiddleware(scope: "apple-login", max: 10, window: 5 * 60))
            .post("apple", use: apple)

        // Recuperación de contraseña (público, con rate-limit para evitar spam/enumeración).
        auth.grouped(resetThrottle).post("forgot-password", use: forgotPassword)
        auth.grouped(resetThrottle).post("reset-password", use: resetPassword)

        // Rutas que requieren un token válido.
        let tokenProtected = auth.grouped(UserToken.authenticator(), User.guardMiddleware())
        tokenProtected.get("me", use: me)
        tokenProtected.get("me", "fonts", use: myFonts)
        tokenProtected.get("me", "comments", use: myComments)
        tokenProtected.get("me", "favorites", use: myFavorites)
        tokenProtected.post("logout", use: logout)
    }

    /// POST /auth/login — valida credenciales y emite un token.
    @Sendable func login(req: Request) async throws -> LoginResponse {
        let user = try req.auth.require(User.self)
        let token = try UserToken.generate(for: user)
        try await token.save(on: req.db)
        return LoginResponse(token: token.value, expiresAt: token.expiresAt, user: UserResponse(user, includeEmail: true))
    }

    /// POST /auth/google — verifica el ID token y emite la sesión normal de FontApp.
    @Sendable func google(req: Request) async throws -> LoginResponse {
        // El cliente web y el de la app de iOS: cada uno firma sus tokens con su propio ID.
        let clientIDs = ["GOOGLE_CLIENT_ID", "GOOGLE_IOS_CLIENT_ID"]
            .compactMap { Environment.get($0) }.filter { !$0.isEmpty }
        guard !clientIDs.isEmpty else {
            throw Abort(.serviceUnavailable, reason: "El acceso con Google no está configurado")
        }
        let dto = try req.content.decode(GoogleLoginDTO.self)
        let profile: GoogleProfile
        do {
            profile = try await req.application.googleTokenVerifier.verify(dto.credential, clientIDs: clientIDs, on: req.client)
        } catch let error as AbortError {
            throw error
        } catch {
            req.logger.warning("Google ID token rechazado: \(error)")
            throw AppError(.unauthorized, "auth.googleInvalid", "La identificación de Google no es válida")
        }

        let (user, isNewUser) = try await signIn(
            provider: "google", subject: profile.subject, email: profile.email,
            authoritativeEmail: profile.authoritativeEmail, name: profile.name,
            usernameSeed: profile.email.split(separator: "@", maxSplits: 1).first.map(String.init) ?? "google",
            lang: dto.lang, source: dto.source, on: req)
        let token = try UserToken.generate(for: user)
        try await token.save(on: req.db)
        return LoginResponse(token: token.value, expiresAt: token.expiresAt,
                             user: UserResponse(user, includeEmail: true), isNewUser: isNewUser)
    }

    /// POST /auth/apple — «Iniciar sesión con Apple» desde la app de iOS (ver `AppleSignIn`).
    /// Mismas reglas que Google: la identidad estable es `sub`, y un correo solo enlaza con
    /// una cuenta existente cuando Apple es autoridad sobre él.
    @Sendable func apple(req: Request) async throws -> LoginResponse {
        let dto = try req.content.decode(AppleLoginDTO.self)
        let apple = req.application.appleSignIn
        let clientID = req.application.appleClientID
        let profile: AppleProfile
        do {
            profile = try await apple.verify(dto.identityToken, clientID: clientID, on: req.client)
        } catch let error as AbortError {
            throw error
        } catch {
            req.logger.warning("Apple identity token rechazado: \(error)")
            throw AppError(.unauthorized, "auth.appleInvalid", "La identificación de Apple no es válida")
        }
        // Apple solo da el nombre la primera vez, y a la app, no en el token.
        let name = dto.name?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        let (user, isNewUser) = try await signIn(
            provider: "apple", subject: profile.subject, email: profile.email,
            authoritativeEmail: profile.authoritativeEmail, name: name,
            usernameSeed: name ?? "apple", lang: dto.lang, source: dto.source, on: req)

        if let code = dto.authorizationCode,
           let refresh = await apple.refreshToken(for: code, clientID: clientID, on: req.client),
           let identity = try await AuthIdentity.query(on: req.db)
               .filter(\.$provider == "apple").filter(\.$subject == profile.subject).first() {
            identity.refreshToken = refresh
            try await identity.save(on: req.db)
        }

        let token = try UserToken.generate(for: user)
        try await token.save(on: req.db)
        return LoginResponse(token: token.value, expiresAt: token.expiresAt,
                             user: UserResponse(user, includeEmail: true), isNewUser: isNewUser)
    }

    /// La cuenta de una identidad externa: la ya enlazada, la del mismo correo si el
    /// proveedor es autoridad sobre él, o una nueva.
    private func signIn(provider: String, subject: String, email: String?, authoritativeEmail: Bool,
                        name: String?, usernameSeed: String, lang: String?, source: String?,
                        on req: Request) async throws -> (User, Bool) {
        if let identity = try await AuthIdentity.query(on: req.db)
            .filter(\.$provider == provider).filter(\.$subject == subject)
            .with(\.$user).first() {
            guard identity.user.anonymizedAt == nil else { throw Abort(.unauthorized) }
            return (identity.user, false)
        }
        guard let email else {
            // Sin correo no hay cuenta nueva: no se podría recuperar ni avisar.
            throw AppError(.unauthorized, "auth.\(provider)NoEmail", "El proveedor no ha compartido un correo verificado")
        }
        if let existing = try await User.query(on: req.db).filter(\.$email == email).first() {
            // El proveedor solo es autoridad sobre sus propios dominios. Con el correo de
            // un tercero, el email no basta para apropiarse de una cuenta FontApp ya existente.
            guard authoritativeEmail else {
                throw AppError(.conflict, "auth.\(provider)LinkRequired",
                               "Este correo ya tiene cuenta. Entra con tu contraseña para vincular \(provider == "apple" ? "Apple" : "Google")")
            }
            guard existing.anonymizedAt == nil else { throw Abort(.unauthorized) }
            try await AuthIdentity(provider: provider, subject: subject,
                                   userID: existing.requireID()).save(on: req.db)
            return (existing, false)
        }
        let username = try await availableUsername(seed: usernameSeed, fallback: provider, on: req.db)
        let created = User(name: name?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? username,
                           username: username, email: email,
                           passwordHash: try req.password.hash([UInt8].random(count: 32).base64),
                           lang: lang, signupSource: UserController.cleanSource(source))
        try await req.db.transaction { db in
            try await created.save(on: db)
            try await AuthIdentity(provider: provider, subject: subject,
                                   userID: created.requireID()).save(on: db)
        }

        // Igual que el registro con contraseña: la cuenta responde enseguida y la
        // GeoIP se completa en segundo plano. Nunca se persiste el IP.
        let app = req.application
        let ip = req.clientIP
        let userID = try created.requireID()
        Task.detached { await enrichSignupLocation(userID: userID, ip: ip, app: app) }
        return (created, true)
    }

    private func availableUsername(seed: String, fallback: String, on db: Database) async throws -> String {
        let allowed = seed.lowercased().folding(options: .diacriticInsensitive, locale: nil).unicodeScalars.map { scalar -> Character in
            CharacterSet.alphanumerics.contains(scalar) || "._-".unicodeScalars.contains(scalar)
                ? Character(String(scalar)) : "-"
        }
        var base = String(allowed).trimmingCharacters(in: CharacterSet(charactersIn: "._-"))
        if base.count < 3 { base = "\(fallback)-\(base)" }
        base = String(base.prefix(24))
        if Mentions.isMentionable(base), try await User.findByUsername(base, on: db) == nil { return base }
        for _ in 0..<20 {
            let candidate = "\(base.prefix(23))-\(String(UUID().uuidString.prefix(6)).lowercased())"
            if try await User.findByUsername(candidate, on: db) == nil { return candidate }
        }
        throw Abort(.serviceUnavailable, reason: "No se ha podido elegir un nombre de usuario")
    }

    /// GET /auth/me — devuelve el usuario autenticado (con su email).
    @Sendable func me(req: Request) async throws -> UserResponse {
        UserResponse(try req.auth.require(User.self), includeEmail: true)
    }

    /// POST /auth/forgot-password — genera un token de reset y "envía" el enlace.
    /// Responde siempre 200 (no revela si el correo existe). En dev devuelve el enlace.
    @Sendable func forgotPassword(req: Request) async throws -> ForgotResponse {
        let dto = try req.content.decode(ForgotDTO.self)
        let email = dto.email.lowercased()

        guard let user = try await User.query(on: req.db).filter(\.$email == email).first() else {
            return ForgotResponse(ok: true, devLink: nil) // no enumeramos usuarios
        }
        let userID = try user.requireID()
        try await PasswordReset.query(on: req.db).filter(\.$user.$id == userID).delete()
        let reset = PasswordReset.generate(for: userID)
        try await reset.save(on: req.db)

        let base = Environment.get("WEB_ORIGIN")?.split(separator: ",").first.map(String.init)
            ?? "http://localhost:5174"
        let link = "\(base)/reset?token=\(reset.token)"

        // Envía el correo (LogMailSender en dev, Resend en prod). Best-effort:
        // si el proveedor falla, no revelamos nada al cliente (evita enumeración/oráculo).
        // El contenido va en el idioma de la interfaz que indique el cliente.
        let mail = ResetEmail.build(lang: dto.lang, username: user.username, link: link)
        do {
            try await req.mailSender.send(to: email, subject: mail.subject, html: mail.html, text: mail.text, on: req.client)
        } catch {
            req.logger.error("No s'ha pogut enviar el correu de reset a \(email): \(error)")
        }

        let isProd = req.application.environment == .production
        return ForgotResponse(ok: true, devLink: isProd ? nil : link)
    }

    /// POST /auth/reset-password — fija una nueva contraseña con un token válido.
    @Sendable func resetPassword(req: Request) async throws -> HTTPStatus {
        try ResetDTO.validate(content: req)
        let dto = try req.content.decode(ResetDTO.self)

        guard let reset = try await PasswordReset.query(on: req.db).filter(\.$token == dto.token).first() else {
            throw AppError(.badRequest, "auth.resetInvalid", "Enlace de recuperación no válido")
        }
        guard reset.expiresAt > Date() else {
            try await reset.delete(on: req.db)
            throw AppError(.badRequest, "auth.resetExpired", "El enlace de recuperación ha caducado")
        }
        guard let user = try await User.find(reset.$user.id, on: req.db) else {
            throw AppError(.badRequest, "auth.resetInvalid", "Enlace de recuperación no válido")
        }
        user.passwordHash = try req.password.hash(dto.password)
        try await user.save(on: req.db)
        // Invalida el token usado y cierra las sesiones abiertas por seguridad.
        try await PasswordReset.query(on: req.db).filter(\.$user.$id == user.requireID()).delete()
        try await UserToken.query(on: req.db).filter(\.$user.$id == user.requireID()).delete()
        return .ok
    }

    /// GET /auth/me/fonts — fuentes creadas por el usuario autenticado (más recientes primero).
    @Sendable func myFonts(req: Request) async throws -> [Font] {
        let user = try req.auth.require(User.self)
        return try await Font.query(on: req.db)
            .filter(\.$creator.$id == user.requireID())
            .sort(\.$createdAt, .descending)
            .all()
    }

    /// GET /auth/me/comments — reseñas del usuario autenticado, con el nombre de la fuente.
    @Sendable func myComments(req: Request) async throws -> [MyCommentResponse] {
        let user = try req.auth.require(User.self)
        let comments = try await FontComment.query(on: req.db)
            .filter(\.$user.$id == user.requireID())
            .sort(\.$createdAt, .descending)
            .all()
        // Nombres de las fuentes referenciadas (una query, sin N+1).
        let fontIDs = Array(Set(comments.map { $0.$font.id }))
        let fonts = try await Font.query(on: req.db).filter(\.$id ~~ fontIDs).all()
        // Las sin nombre propio se quedan fuera del diccionario, y por tanto llegan como
        // `nil` al DTO: es la misma ausencia, y así el valor no es un `String??`.
        let names = Dictionary(uniqueKeysWithValues: fonts.compactMap { f -> (UUID, String)? in
            guard let id = f.id, let n = f.name else { return nil }
            return (id, n)
        })
        return comments.map { MyCommentResponse($0, fontName: names[$0.$font.id]) }
    }

    /// GET /auth/me/favorites — fuentes guardadas por el usuario, las últimas primero.
    @Sendable func myFavorites(req: Request) async throws -> [Font] {
        let user = try req.auth.require(User.self)
        let favorites = try await FontFavorite.query(on: req.db)
            .filter(\.$user.$id == user.requireID())
            .sort(\.$createdAt, .descending)
            .all()
        let fontIDs = favorites.map { $0.$font.id }
        guard !fontIDs.isEmpty else { return [] }
        // Carga las fuentes y las reordena según el orden de guardado (más recientes primero).
        let fonts = try await Font.query(on: req.db).filter(\.$id ~~ fontIDs).all()
        let byID = Dictionary(uniqueKeysWithValues: fonts.compactMap { f in f.id.map { ($0, f) } })
        return fontIDs.compactMap { byID[$0] }
    }

    /// POST /auth/logout — revoca el token usado en la petición.
    @Sendable func logout(req: Request) async throws -> HTTPStatus {
        guard let bearer = req.headers.bearerAuthorization else {
            throw Abort(.unauthorized)
        }
        try await UserToken.query(on: req.db).filter(\.$value == bearer.token).delete()
        return .noContent
    }
}

/// Autenticador Basic que acepta el **nombre de usuario o el email** como
/// identificador (el de ModelAuthenticatable solo mira username). Así, si alguien
/// olvida su usuario, puede entrar con el correo. La contraseña se verifica con bcrypt.
struct UserCredentialsAuthenticator: AsyncBasicAuthenticator {
    func authenticate(basic: BasicAuthorization, for request: Request) async throws {
        let id = basic.username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { return }
        let user = try await User.query(on: request.db).group(.or) { group in
            group.filter(\.$username == id).filter(\.$email == id.lowercased())
        }.first()
        // Contraseña incorrecta o usuario inexistente: no autenticamos (401 aguas abajo).
        guard let user, try user.verify(password: basic.password) else { return }
        request.auth.login(user)
    }
}

struct LoginResponse: Content {
    let token: String
    let expiresAt: Date?
    let user: UserResponse
    var isNewUser: Bool? = nil
}

struct AppleLoginDTO: Content {
    let identityToken: String
    var authorizationCode: String? = nil
    /// Solo llega la primera vez que la persona autoriza la app.
    var name: String? = nil
    var lang: String? = nil
    var source: String? = nil
}

struct GoogleLoginDTO: Content {
    let credential: String
    var lang: String? = nil
    var source: String? = nil
}

struct ForgotDTO: Content {
    let email: String
    /// Idioma de la interfaz para localizar el correo (ca/es/gl/eu/en/pt). Opcional.
    let lang: String?
}

/// Plantilla del correo de restablecimiento, localizada. Devuelve asunto, HTML y
/// texto plano (alternativa multipart, mejor para la entregabilidad).
enum ResetEmail {
    static func build(lang: String?, username: String, link: String) -> (subject: String, html: String, text: String) {
        // Escapamos el username por si llevara caracteres HTML (se muestra en el <p>).
        let userHTML = username
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        switch lang {
        case "es":
            return (
                "Restablecer la contraseña · FontApp",
                """
                <p>Has solicitado restablecer la contraseña de FontApp.</p>
                <p>Tu nombre de usuario es: <strong>\(userHTML)</strong></p>
                <p><a href="\(link)">Restablecer la contraseña</a> (el enlace caduca en 1 hora).</p>
                <p>Si no lo has solicitado tú, ignora este correo.</p>
                """,
                "Has solicitado restablecer la contraseña de FontApp.\nTu nombre de usuario es: \(username)\nAbre este enlace (caduca en 1 hora): \(link)\nSi no lo has solicitado tú, ignora este correo."
            )
        case "gl":
            return (
                "Restablecer o contrasinal · FontApp",
                """
                <p>Solicitaches restablecer o contrasinal de FontApp.</p>
                <p>O teu nome de usuario é: <strong>\(userHTML)</strong></p>
                <p><a href="\(link)">Restablecer o contrasinal</a> (a ligazón caduca en 1 hora).</p>
                <p>Se non o solicitaches ti, ignora este correo.</p>
                """,
                "Solicitaches restablecer o contrasinal de FontApp.\nO teu nome de usuario é: \(username)\nAbre esta ligazón (caduca en 1 hora): \(link)\nSe non o solicitaches ti, ignora este correo."
            )
        case "eu":
            return (
                "Pasahitza berrezarri · FontApp",
                """
                <p>FontApp-eko pasahitza berrezartzeko eskaera egin duzu.</p>
                <p>Zure erabiltzaile-izena: <strong>\(userHTML)</strong></p>
                <p><a href="\(link)">Pasahitza berrezarri</a> (esteka ordubetean iraungiko da).</p>
                <p>Zuk eskatu ez baduzu, ez ikusi mezu honi.</p>
                """,
                "FontApp-eko pasahitza berrezartzeko eskaera egin duzu.\nZure erabiltzaile-izena: \(username)\nIreki esteka hau (ordubetean iraungiko da): \(link)\nZuk eskatu ez baduzu, ez ikusi mezu honi."
            )
        case "en":
            return (
                "Reset your password · FontApp",
                """
                <p>You requested to reset your FontApp password.</p>
                <p>Your username is: <strong>\(userHTML)</strong></p>
                <p><a href="\(link)">Reset your password</a> (the link expires in 1 hour).</p>
                <p>If you didn't request this, ignore this email.</p>
                """,
                "You requested to reset your FontApp password.\nYour username is: \(username)\nOpen this link (expires in 1 hour): \(link)\nIf you didn't request this, ignore this email."
            )
        case "pt":
            return (
                "Repor a palavra-passe · FontApp",
                """
                <p>Pediste para repor a palavra-passe do FontApp.</p>
                <p>O teu nome de utilizador é: <strong>\(userHTML)</strong></p>
                <p><a href="\(link)">Repor a palavra-passe</a> (a ligação expira dentro de 1 hora).</p>
                <p>Se não fizeste este pedido, ignora este email.</p>
                """,
                "Pediste para repor a palavra-passe do FontApp.\nO teu nome de utilizador é: \(username)\nAbre esta ligação (expira dentro de 1 hora): \(link)\nSe não fizeste este pedido, ignora este email."
            )
        case "it":
            return (
                "Reimposta la password · FontApp",
                """
                <p>Hai chiesto di reimpostare la password di FontApp.</p>
                <p>Il tuo nome utente è: <strong>\(userHTML)</strong></p>
                <p><a href="\(link)">Reimposta la password</a> (il link scade tra 1 ora).</p>
                <p>Se non sei stato tu, ignora questa email.</p>
                """,
                "Hai chiesto di reimpostare la password di FontApp.\nIl tuo nome utente è: \(username)\nApri questo link (scade tra 1 ora): \(link)\nSe non sei stato tu, ignora questa email."
            )
        default: // ca (idioma por defecto de la app)
            return (
                "Restablir la contrasenya · FontApp",
                """
                <p>Has demanat restablir la contrasenya de FontApp.</p>
                <p>El teu nom d'usuari és: <strong>\(userHTML)</strong></p>
                <p><a href="\(link)">Restablir la contrasenya</a> (l'enllaç caduca en 1 hora).</p>
                <p>Si no ho has demanat tu, ignora aquest correu.</p>
                """,
                "Has demanat restablir la contrasenya de FontApp.\nEl teu nom d'usuari és: \(username)\nObre aquest enllaç (caduca en 1 hora): \(link)\nSi no ho has demanat tu, ignora aquest correu."
            )
        }
    }
}

/// Respuesta de forgot-password. `devLink` solo se rellena fuera de producción.
struct ForgotResponse: Content {
    let ok: Bool
    let devLink: String?
}

struct ResetDTO: Content {
    let token: String
    let password: String
}

extension ResetDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("token", as: String.self, is: !.empty)
        validations.add("password", as: String.self, is: .count(8...))
    }
}

/// Reseña propia con el nombre de la fuente, para la pantalla "mi perfil".
struct MyCommentResponse: Content {
    let id: UUID?
    let fontID: UUID
    let fontName: String?
    let body: String
    let rating: Int?
    let waterStatus: String?
    let createdAt: Date?

    init(_ comment: FontComment, fontName: String?) {
        self.id = comment.id
        self.fontID = comment.$font.id
        self.fontName = fontName
        self.body = comment.body
        self.rating = comment.rating
        self.waterStatus = comment.waterStatus
        self.createdAt = comment.createdAt
    }
}
