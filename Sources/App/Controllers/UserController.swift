import Fluent
import SQLKit
import Vapor

// CRUD de usuarios — ver definitions.md (Users management).
// Las respuestas usan `UserResponse` para no exponer nunca el hash de contraseña.
struct UserController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let users = routes.grouped("users")
        // Ritmo humano: darse de alta es algo que se hace una vez. El límite deja
        // margen a una familia o un grupo que comparten wifi, y corta en seco al bot
        // que registra cuentas en bucle (cada alta manda un correo de bienvenida).
        let signupThrottle = RateLimitMiddleware(scope: "signup", max: 5, window: 60 * 60)   // 5 / hora
        users.grouped(signupThrottle).post(use: create)  // registro: público
        users.get(":userID", use: show)     // lectura: pública
        users.get(":userID", "fonts", use: userFonts)       // fuentes creadas: público
        users.get(":userID", "comments", use: userComments) // reseñas: público
        // Baja del resumen semanal desde el propio correo, sin sesión (token firmado).
        users.post("unsubscribe", use: unsubscribe)

        // Editar/borrar requiere token y solo sobre la propia cuenta (self-only).
        let protected = users.grouped(UserToken.authenticator(), User.guardMiddleware())
        protected.get("stats", "regions", use: regionStats)  // admin
        protected.get("stats", "new", use: newUsers)         // admin: altas recientes
        protected.get("stats", "sources", use: sourceStats)  // admin: altas por cartel
        protected.get("stats", "online", use: onlineUsers)   // admin: presencia reciente
        protected.get("stats", "activity-ranking", use: activityRanking) // admin: retorno e inactividad
        protected.post("presence", use: touchPresence)       // heartbeat de la propia sesión
        protected.post("source-limit-exemption-request", use: requestSourceLimitExemption)
        protected.get("staff", use: staff)                   // owner: moderadores/admins
        protected.get("admin", use: adminList)               // owner: listado completo paginado
        protected.group(":userID") { user in
            user.put(use: update)
            user.delete(use: destroy)
            user.put("role", use: setRole)                   // owner: cambiar rol
            user.post("posting-restriction", use: restrictPosting) // owner: suspender aportaciones
            user.delete("posting-restriction", use: unrestrictPosting)
        }
    }

    /// Solicita ampliar temporalmente el cupo de fuentes de una cuenta nueva.
    /// La solicitud vive en la cola de moderación y es idempotente: pulsar varias
    /// veces nunca genera ruido ni varias tarjetas para el administrador.
    @Sendable func requestSourceLimitExemption(req: Request) async throws -> HTTPStatus {
        let user = try req.auth.require(User.self)
        try user.requireCanContribute()
        let userID = try user.requireID()
        guard !user.hasSourceLimitExemption else { return .noContent }
        guard let joined = user.createdAt, Date().timeIntervalSince(joined) < 7 * 86_400 else {
            throw Abort(.badRequest, reason: "La cuenta ya no está sujeta al cupo de cuentas nuevas")
        }
        let existing = try await ContentFlag.query(on: req.db)
            .filter(\.$targetType == "source_limit_exemption")
            .filter(\.$targetID == userID)
            .first()
        guard existing == nil else { return .noContent }
        try await ContentFlag(flaggerID: userID, targetType: "source_limit_exemption",
                              targetID: userID).save(on: req.db)

        // «Estoy on fire»: quien lo pulsa está en la calle AHORA, con el móvil en la mano
        // y fuentes por apuntar. Es el aviso más perecedero de la app — si nadie lo ve
        // hasta la noche, ya no hay nada que conceder. Antes caía en el panel y se quedaba
        // ahí hasta que a alguien se le ocurría mirar.
        //
        // Sin esperar, como el resto de avisos: la solicitud ya está guardada, y perderla
        // por no poder avisar sería absurdo. Y no hace falta controlar repeticiones: el
        // `guard existing == nil` de arriba ya devuelve 204 sin guardar nada.
        let db = req.db
        let push = PushEnvio(req.application)
        Task.detached { await OnFireNotifier.requested(by: user, on: db, push: push) }
        return .created
    }

    /// POST /users/presence — heartbeat sin contenido. Como mucho escribe una vez cada
    /// dos minutos aunque varias pestañas lo llamen a la vez.
    @Sendable func touchPresence(req: Request) async throws -> HTTPStatus {
        let user = try req.auth.require(User.self)
        let now = Date()
        if user.lastSeenAt == nil || now.timeIntervalSince(user.lastSeenAt!) >= 120 {
            user.lastSeenAt = now
            try await user.save(on: req.db)
        }
        return .noContent
    }

    /// GET /users/stats/online — presencia aproximada, nunca una conexión persistente.
    /// Solo admin; no expone IP, pantalla, dispositivo ni token.
    @Sendable func onlineUsers(req: Request) async throws -> [OnlineUser] {
        let me = try req.auth.require(User.self)
        guard me.isAdmin else { throw Abort(.forbidden) }
        let cutoff = Date().addingTimeInterval(-10 * 60)
        return try await User.query(on: req.db)
            .filter(\.$anonymizedAt == nil)
            .filter(\.$lastSeenAt >= cutoff)
            .sort(\.$lastSeenAt, .descending)
            .all()
            .compactMap { user in
                guard let id = user.id, let lastSeenAt = user.lastSeenAt else { return nil }
                return OnlineUser(id: id, username: user.username, lastSeenAt: lastSeenAt)
            }
    }

    /// GET /users/stats/activity-ranking — recencia de sesiones autenticadas.
    /// `last_seen_at = NULL` significa que no se ha observado actividad desde que existe
    /// esta medición; no permite afirmar que la cuenta nunca iniciara sesión antes.
    @Sendable func activityRanking(req: Request) async throws -> UserActivityRanking {
        let me = try req.auth.require(User.self)
        guard me.isAdmin else { throw Abort(.forbidden) }
        guard let sql = req.db as? SQLDatabase else { throw Abort(.internalServerError) }

        let recent = try await sql.raw("""
            SELECT id, username, created_at AS "createdAt", last_seen_at AS "lastSeenAt"
            FROM users
            WHERE anonymized_at IS NULL AND last_seen_at IS NOT NULL
            ORDER BY last_seen_at DESC
            LIMIT 10
            """).all(decoding: UserActivityRankRow.self)
        let inactive = try await sql.raw("""
            SELECT id, username, created_at AS "createdAt", last_seen_at AS "lastSeenAt"
            FROM users
            WHERE anonymized_at IS NULL
            ORDER BY (last_seen_at IS NOT NULL) ASC, last_seen_at ASC, created_at ASC
            LIMIT 10
            """).all(decoding: UserActivityRankRow.self)
        struct CountRow: Decodable { let count: Int }
        let untracked = try await sql.raw("""
            SELECT COUNT(*)::int AS count
            FROM users
            WHERE anonymized_at IS NULL AND last_seen_at IS NULL
            """).first(decoding: CountRow.self)?.count ?? 0
        return UserActivityRanking(mostRecent: recent, leastRecent: inactive, untrackedCount: untracked)
    }

    /// GET /users/staff — usuarios con rol por encima de `user` (solo owner).
    @Sendable func staff(req: Request) async throws -> [StaffMember] {
        let me = try req.auth.require(User.self)
        guard me.isOwner else { throw Abort(.forbidden, reason: "Solo el propietario") }
        let users = try await User.query(on: req.db)
            .filter(\.$role != UserRole.user)
            .all()
        return users
            .sorted { $0.role.rank > $1.role.rank }
            .map { StaffMember(id: $0.id, username: $0.username, role: $0.role.rawValue) }
    }

    /// GET /users/admin?page=&per=&search= — listado completo de usuarios, paginado
    /// y con búsqueda (por username/nombre/email). Solo owner: expone email y ubicación
    /// de registro (PII), nunca el hash de contraseña.
    @Sendable func adminList(req: Request) async throws -> Page<AdminUser> {
        let me = try req.auth.require(User.self)
        guard me.isOwner else { throw Abort(.forbidden, reason: "Solo el propietario") }
        let query = User.query(on: req.db).sort(\.$createdAt, .descending)
        if let raw = req.query[String.self, at: "search"], let like = SearchTerm.likePattern(raw) {
            query.group(.or) { or in
                or.filter(\.$username, .custom("ILIKE"), like)
                or.filter(\.$name, .custom("ILIKE"), like)
                or.filter(\.$email, .custom("ILIKE"), like)
            }
        }
        let page = try await query.paginate(SafePage.from(req))
        let ids = page.items.compactMap(\.id)
        var supportByUser: [UUID: [String: Date]] = [:]
        if !ids.isEmpty, let sql = req.db as? SQLDatabase {
            struct SupportRow: Decodable { let userID: UUID; let event: String; let lastClickedAt: Date }
            let rows = try await sql.raw("""
                SELECT user_id AS "userID", event, last_clicked_at AS "lastClickedAt"
                FROM user_support_interactions
                WHERE user_id IN (\(binds: ids))
                  AND last_clicked_at >= CURRENT_TIMESTAMP - INTERVAL '180 days'
                """).all(decoding: SupportRow.self)
            for row in rows { supportByUser[row.userID, default: [:]][row.event] = row.lastClickedAt }
        }
        return Page(items: page.items.map {
            AdminUser($0, support: $0.id.flatMap { supportByUser[$0] } ?? [:])
        }, metadata: page.metadata)
    }

    /// PUT /users/:userID/role — cambia el rol de un usuario (solo owner).
    /// No permite: cambiarte a ti mismo, tocar a otro owner, ni asignar el rol owner
    /// (el owner se fija por CLI con `set-role`, para que no se pueda escalar desde la web).
    @Sendable func setRole(req: Request) async throws -> UserResponse {
        let me = try req.auth.require(User.self)
        guard me.isOwner else { throw Abort(.forbidden, reason: "Solo el propietario puede asignar roles") }
        let dto = try req.content.decode(SetRoleDTO.self)
        guard let role = UserRole(rawValue: dto.role), role != .owner else {
            throw Abort(.badRequest, reason: "Rol no válido (user/moderator/admin)")
        }
        // `find` resuelve el parámetro por UUID o por username (para promover a alguien
        // que aún es `user` escribiendo su nombre, sin conocer su id).
        let target = try await find(req)
        guard target.id != me.id else {
            throw Abort(.badRequest, reason: "No puedes cambiar tu propio rol")
        }
        guard !target.isOwner else {
            throw Abort(.forbidden, reason: "No puedes cambiar el rol del propietario")
        }
        let previousRole = target.role
        target.role = role
        try await target.save(on: req.db)
        if previousRole != role, let email = target.email {
            let app = req.application
            let mail = RoleChangedEmail.build(
                lang: target.lang, name: target.name, role: role,
                webOrigin: Environment.get("WEB_ORIGIN")?.split(separator: ",").first.map(String.init)
                    ?? "http://localhost:5174")
            Task.detached {
                do {
                    try await app.mailSender.send(to: email, subject: mail.subject,
                                                  html: mail.html, text: mail.text, on: app.client)
                } catch {
                    app.logger.error("No s'ha pogut enviar el correu de canvi de rol a \(email): \(error)")
                }
            }
        }
        return UserResponse(target, includeEmail: true)
    }

    @Sendable func restrictPosting(req: Request) async throws -> AdminUser {
        let actor = try req.auth.require(User.self)
        guard actor.isOwner else { throw Abort(.forbidden) }
        struct DTO: Content { let days: Int }
        let dto = try req.content.decode(DTO.self)
        guard (1...365).contains(dto.days) else { throw Abort(.badRequest) }
        let target = try await find(req)
        guard !target.isOwner else { throw Abort(.forbidden) }
        target.postingRestrictedUntil = Date().addingTimeInterval(Double(dto.days) * 86_400)
        try await target.save(on: req.db)
        try await auditRestriction(req, actor: actor, target: target, action: "restrict", reason: "\(dto.days)d")
        return AdminUser(target)
    }

    @Sendable func unrestrictPosting(req: Request) async throws -> AdminUser {
        let actor = try req.auth.require(User.self)
        guard actor.isOwner else { throw Abort(.forbidden) }
        let target = try await find(req)
        target.postingRestrictedUntil = nil
        try await target.save(on: req.db)
        try await auditRestriction(req, actor: actor, target: target, action: "unrestrict", reason: nil)
        return AdminUser(target)
    }

    private func auditRestriction(_ req: Request, actor: User, target: User,
                                  action: String, reason: String?) async throws {
        guard let sql = req.db as? SQLDatabase else { return }
        try await sql.raw("""
            INSERT INTO moderation_actions (id, subject_user_id, actor_id, action, reason, created_at)
            VALUES (\(bind: UUID()), \(bind: target.id), \(bind: actor.id), \(bind: action),
                    \(bind: reason), CURRENT_TIMESTAMP)
            """).run()
    }

    /// GET /users/stats/regions — nº de usuarios por región de registro (solo admins).
    /// Los usuarios sin ubicación (dev/demo o IP no resuelta) salen con region nula.
    @Sendable func regionStats(req: Request) async throws -> [RegionCount] {
        let user = try req.auth.require(User.self)
        guard user.isAdmin else { throw Abort(.forbidden, reason: "Solo para administradores") }
        guard let sql = req.db as? SQLDatabase else { throw Abort(.internalServerError) }
        return try await sql.raw("""
            SELECT signup_country AS country, signup_region AS region, COUNT(*)::int AS count
            FROM users
            GROUP BY signup_country, signup_region
            ORDER BY count DESC, region ASC
            """).all(decoding: RegionCount.self)
    }

    /// GET /users/stats/new?since=<ISO-8601> — cuántos usuarios se han dado de alta
    /// desde esa fecha, para el distintivo del panel (solo admins). Sin `since`,
    /// cuenta los de los últimos 7 días.
    @Sendable func newUsers(req: Request) async throws -> NewUsersCount {
        let user = try req.auth.require(User.self)
        guard user.isAdmin else { throw Abort(.forbidden, reason: "Solo para administradores") }
        let since = req.query[String.self, at: "since"].flatMap(Self.parseISO)
            ?? Date().addingTimeInterval(-7 * 86_400)
        let count = try await User.query(on: req.db)
            .filter(\.$createdAt > since)
            .filter(\.$anonymizedAt == nil)
            .count()
        return NewUsersCount(count: count, since: since)
    }

    /// El codi del cartell l'escriu qui vulgui a la URL, així que entra a la BD net:
    /// minúscules, sense espais, només lletres/números/guions i com a molt 40 caràcters.
    static func cleanSource(_ value: String?) -> String? {
        guard let value else { return nil }
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789-_")
        let clean = String(value.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
            .unicodeScalars.filter { allowed.contains($0) }.prefix(40))
        return clean.isEmpty ? nil : clean
    }

    /// El navegador manda `toISOString()`, que lleva milisegundos ("...T10:00:00.123Z");
    /// `ISO8601DateFormatter` NO los acepta por defecto y devolvía nil en silencio (con
    /// lo que el contador se iba a "los últimos 7 días" y siempre salía distinto de cero).
    private static func parseISO(_ value: String) -> Date? {
        let withMillis = ISO8601DateFormatter()
        withMillis.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withMillis.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    /// GET /users/stats/sources — altas por código de cartel (`?p=…`), solo admins.
    /// Las que llegaron sin código salen con `source` nulo ("directo").
    @Sendable func sourceStats(req: Request) async throws -> [SourceCount] {
        let user = try req.auth.require(User.self)
        guard user.isAdmin else { throw Abort(.forbidden, reason: "Solo para administradores") }
        guard let sql = req.db as? SQLDatabase else { throw Abort(.internalServerError) }
        return try await sql.raw("""
            SELECT signup_source AS source, COUNT(*)::int AS count
            FROM users
            WHERE anonymized_at IS NULL
            GROUP BY signup_source
            ORDER BY count DESC, source ASC
            """).all(decoding: SourceCount.self)
    }

    @Sendable func create(req: Request) async throws -> Response {
        try CreateUserDTO.validate(content: req)
        let dto = try req.content.decode(CreateUserDTO.self)

        // **La misma regla que al cambiarlo**, y aquí sí siempre. Faltaba: el registro
        // solo comprobaba la longitud, así que se podía crear hoy mismo una cuenta
        // llamada «josé maría» — no es cosa de cuentas antiguas, era la puerta de
        // entrada.
        //
        // Y el daño no es «no se le puede mencionar», que ya sería malo. Es que la
        // mención **acierta a otro**: `Mentions.names(in:)` corta en el primer carácter
        // que no vale, así que `@josé maría` menciona a `jos`, enlaza a su perfil y, si
        // ese usuario existe, le manda a él el aviso. Un nombre que no se puede escribir
        // en una mención no debería poder existir.
        //
        // Las cuentas ya creadas se quedan como están: el nombre es con el que entran, y
        // renombrarlas por nuestra cuenta las dejaría fuera. Se corrigen desde `/me`,
        // donde el formulario ya exige esta regla.
        guard Mentions.isMentionable(dto.username) else {
            throw AppError(.badRequest, "user.usernameChars", "El nombre de usuario solo puede llevar letras sin acentos, números, punto, guion y guion bajo (3-30 caracteres)")
        }

        // 409 limpio en vez de dejar que el constraint de unicidad reviente en 500.
        // Insensible a mayúsculas **a propósito**: con la comparación exacta se podían
        // crear `sebas` y `Sebas`, y entonces la búsqueda por nombre —que ahora ignora
        // las mayúsculas, como el aviso de menciones— no sabría a cuál de los dos se
        // refiere `@sebas`. Comprobado en producción que hoy no hay ninguna pareja así;
        // esto es para que siga sin haberlas.
        guard try await User.findByUsername(dto.username, on: req.db) == nil else {
            throw AppError(.conflict, "user.usernameTaken", "El username '\(dto.username)' ya está en uso")
        }
        let email = dto.email.lowercased()
        guard try await User.query(on: req.db).filter(\.$email == email).first() == nil else {
            throw AppError(.conflict, "user.emailTaken", "El correo '\(email)' ya está registrado")
        }

        let user = User(
            name: dto.name,
            username: dto.username,
            email: email,
            passwordHash: try req.password.hash(dto.password),
            lang: dto.lang,
            signupSource: Self.cleanSource(dto.source)
        )
        try await user.save(on: req.db)

        // El geo-IP y el correo de bienvenida son DOS llamadas HTTP a servicios ajenos.
        // Hacerlas aquí dejaba al usuario mirando el botón de "crear cuenta" mientras
        // respondía un tercero, así que van en segundo plano: la cuenta ya está creada
        // y ninguna de las dos cosas cambia lo que hay que responderle.
        let app = req.application
        let ip = req.clientIP
        let userID = try user.requireID()
        let name = user.name
        let lang = dto.lang
        Task.detached {
            // Ubicación aproximada del registro (nunca se guarda la IP).
            await enrichSignupLocation(userID: userID, ip: ip, app: app)
            let base = Environment.get("WEB_ORIGIN")?.split(separator: ",").first.map(String.init)
                ?? "http://localhost:5174"
            let mail = WelcomeEmail.build(lang: lang, name: name, webOrigin: base)
            do {
                try await app.mailSender.send(to: email, subject: mail.subject, html: mail.html, text: mail.text, on: app.client)
            } catch {
                app.logger.error("No s'ha pogut enviar el correu de benvinguda a \(email): \(error)")
            }
        }

        let response = Response(status: .created)
        try response.content.encode(UserResponse(user, includeEmail: true))
        return response
    }

    /// POST /users/unsubscribe — desactiva el resumen semanal con el token del correo.
    /// Público a propósito: el enlace se pulsa desde el buzón, sin sesión. El token es un
    /// HMAC del id (ver `UnsubscribeToken`), así que no se puede dar de baja a otro.
    /// Idempotente: darse de baja dos veces responde 200 igualmente.
    @Sendable func unsubscribe(req: Request) async throws -> HTTPStatus {
        let dto = try req.content.decode(UnsubscribeDTO.self)
        guard let userID = UUID(uuidString: dto.user), UnsubscribeToken.verify(dto.token, userID: userID) else {
            throw AppError(.badRequest, "auth.unsubscribeInvalid", "Enlace de baja no válido")
        }
        guard let user = try await User.find(userID, on: req.db) else {
            throw AppError(.badRequest, "auth.unsubscribeInvalid", "Enlace de baja no válido")
        }
        if dto.kind == "mentions" {
            user.mentionEmails = false
        } else {
            user.weeklyDigest = false
        }
        try await user.save(on: req.db)
        return .ok
    }

    @Sendable func show(req: Request) async throws -> UserResponse {
        UserResponse(try await find(req))
    }

    /// GET /users/:userID/fonts — fuentes creadas por ese usuario (público, solo lectura).
    @Sendable func userFonts(req: Request) async throws -> [Font] {
        let user = try await find(req)
        return try await Font.query(on: req.db)
            .filter(\.$creator.$id == user.requireID())
            .sort(\.$createdAt, .descending)
            .all()
    }

    /// GET /users/:userID/comments — reseñas de ese usuario, con el nombre de la fuente (público).
    @Sendable func userComments(req: Request) async throws -> [MyCommentResponse] {
        let user = try await find(req)
        let comments = try await FontComment.query(on: req.db)
            .filter(\.$user.$id == user.requireID())
            .sort(\.$createdAt, .descending)
            .all()
        let fontIDs = Array(Set(comments.map { $0.$font.id }))
        let fonts = fontIDs.isEmpty ? [] : try await Font.query(on: req.db).filter(\.$id ~~ fontIDs).all()
        // Las sin nombre propio se quedan fuera del diccionario, y por tanto llegan como
        // `nil` al DTO: es la misma ausencia, y así el valor no es un `String??`.
        let names = Dictionary(uniqueKeysWithValues: fonts.compactMap { f -> (UUID, String)? in
            guard let id = f.id, let n = f.name else { return nil }
            return (id, n)
        })
        return comments.map { MyCommentResponse($0, fontName: names[$0.$font.id]) }
    }

    @Sendable func update(req: Request) async throws -> UserResponse {
        try UpdateUserDTO.validate(content: req)
        let user = try await find(req)
        try requireSelf(req, target: user)
        let dto = try req.content.decode(UpdateUserDTO.self)

        // Si el username cambia a uno que ya tiene OTRO usuario -> 409.
        if let clash = try await User.findByUsername(dto.username, on: req.db),
           clash.id != user.id {
            throw AppError(.conflict, "user.usernameTaken", "El username '\(dto.username)' ya está en uso")
        }
        // Los caracteres solo se comprueban **cuando el nombre cambia**. Las cuentas
        // antiguas se registraron sin esta regla, y aplicarla siempre dejaría a quien
        // tenga un nombre raro sin poder guardar ni un interruptor de su perfil: el
        // formulario le devolvería un error sobre un campo que no ha tocado.
        if dto.username != user.username, !Mentions.isMentionable(dto.username) {
            throw AppError(.badRequest, "user.usernameChars", "El nombre de usuario solo puede llevar letras sin acentos, números, punto, guion y guion bajo (3-30 caracteres)")
        }
        let email = dto.email.lowercased()
        if let clash = try await User.query(on: req.db).filter(\.$email == email).first(),
           clash.id != user.id {
            throw AppError(.conflict, "user.emailTaken", "El correo '\(email)' ya está registrado")
        }

        user.name = dto.name
        user.username = dto.username
        user.email = email
        if let emailPublic = dto.emailPublic { user.emailPublic = emailPublic }
        if let namePublic = dto.namePublic { user.namePublic = namePublic }
        if let weeklyDigest = dto.weeklyDigest { user.weeklyDigest = weeklyDigest }
        if let optOut = dto.gamificationOptOut { user.gamificationOptOut = optOut }
        if let avisos = dto.mentionEmails { user.mentionEmails = avisos }
        if let password = dto.password {
            user.passwordHash = try req.password.hash(password)
        }
        try await user.save(on: req.db)
        return UserResponse(user, includeEmail: true)
    }

    /// "Borrado" de cuenta = anonimización. Las aportaciones (fuentes, reseñas,
    /// confirmaciones) NO son datos personales sino información sobre fuentes de
    /// uso común, así que se conservan pero se desligan de la identidad del
    /// usuario. Los datos personales (nombre, email, ubicación de registro) se
    /// eliminan y el login queda inutilizado.
    @Sendable func destroy(req: Request) async throws -> HTTPStatus {
        let user = try await find(req)
        try requireSelf(req, target: user)
        let userID = try user.requireID()

        // Ya anonimizada: nada más que hacer (idempotente).
        guard user.anonymizedAt == nil else { return .noContent }

        let shortID = userID.uuidString.prefix(8).lowercased()
        user.name = "Compte eliminat"
        user.username = "eliminat-\(shortID)"
        user.email = nil
        user.emailPublic = false
        user.namePublic = false
        user.role = .user
        user.signupCountry = nil
        user.signupRegion = nil
        user.signupCity = nil
        // Contraseña aleatoria e inrecuperable: el login queda inutilizado.
        user.passwordHash = try req.password.hash([UInt8].random(count: 32).base64)
        user.anonymizedAt = Date()
        try await user.save(on: req.db)

        // Revoca sesiones y peticiones de reseteo pendientes.
        try await UserToken.query(on: req.db).filter(\.$user.$id == userID).delete()
        try await PasswordReset.query(on: req.db).filter(\.$user.$id == userID).delete()
        try await AuthIdentity.query(on: req.db).filter(\.$user.$id == userID).delete()
        try await PasskeyCredential.query(on: req.db).filter(\.$user.$id == userID).delete()
        try await PasskeyChallenge.query(on: req.db).filter(\.$user.$id == userID).delete()
        // La cuenta se anonimiza en vez de borrar físicamente la fila, así que el FK
        // no puede hacer cascade: el rastro personal de apoyo se elimina expresamente.
        if let sql = req.db as? SQLDatabase {
            try await sql.raw("DELETE FROM user_support_interactions WHERE user_id = \(bind: userID)").run()
        }

        return .noContent
    }

    /// Resuelve `:userID` por UUID o por username. Así las URLs pueden ser
    /// legibles (/users/miguel) sin romperse: el UUID sigue siendo un fallback
    /// estable si alguien se renombra.
    private func find(_ req: Request) async throws -> User {
        guard let param = req.parameters.get("userID") else { throw Abort(.notFound) }
        let user: User?
        if let id = UUID(uuidString: param) {
            user = try await User.find(id, on: req.db)
        } else {
            // Sin distinguir mayúsculas, como ya hacía el aviso de menciones: si no,
            // `@sebas` avisa a `Sebas` y el enlace del texto da 404.
            user = try await User.findByUsername(param, on: req.db)
        }
        guard let user else { throw Abort(.notFound) }
        return user
    }

    /// 403 si el usuario autenticado intenta modificar una cuenta que no es la suya.
    private func requireSelf(_ req: Request, target: User) throws {
        let authUser = try req.auth.require(User.self)
        guard authUser.id == target.id else {
            throw AppError(.forbidden, "user.selfOnly", "Solo puedes modificar tu propia cuenta")
        }
    }
}

struct CreateUserDTO: Content {
    let name: String
    let username: String
    let email: String
    let password: String
    /// Idioma de la interfaz para localizar el correo de bienvenida (ca/es/gl/eu/en/pt).
    /// Opcional: sin él se envía en catalán, el idioma por defecto de la app.
    var lang: String? = nil
    /// Codi del cartell pel qual va arribar (`?p=castellcir`). Opcional.
    var source: String? = nil
}

/// Altas desde una fecha, para el distintivo de "usuarios nuevos" del panel.
struct NewUsersCount: Content {
    let count: Int
    let since: Date
}

/// Fila de la estadística de altas por cartel (`source` nulo = llegaron sin código).
struct SourceCount: Content {
    let source: String?
    let count: Int
}

/// Fila de la estadística de registros por región.
struct RegionCount: Content {
    let country: String?
    let region: String?
    let count: Int
}

/// Miembro del equipo (rol > user) para la vista de gestión de roles del owner.
struct StaffMember: Content {
    let id: UUID?
    let username: String
    let role: String
}

struct OnlineUser: Content {
    let id: UUID
    let username: String
    let lastSeenAt: Date
}

struct UserActivityRankRow: Content {
    let id: UUID
    let username: String
    let createdAt: Date?
    let lastSeenAt: Date?
}

struct UserActivityRanking: Content {
    let mostRecent: [UserActivityRankRow]
    let leastRecent: [UserActivityRankRow]
    let untrackedCount: Int
}

/// Fila del listado completo de usuarios (solo owner). Todas las columnas útiles,
/// sin el hash de contraseña. Incluye PII (email, ubicación de registro).
struct AdminUser: Content {
    let id: UUID?
    let username: String
    let name: String
    let email: String?
    let role: String
    let signupCountry: String?
    let signupRegion: String?
    let signupCity: String?
    let lang: String?
    let signupSource: String?
    let anonymized: Bool
    let createdAt: Date?
    let supportClickedAt: Date?
    let aixetaClickedAt: Date?
    let moderationStrikes: Int
    let postingRestrictedUntil: Date?

    init(_ u: User, support: [String: Date] = [:]) {
        self.id = u.id
        self.username = u.username
        self.name = u.name
        self.email = u.email
        self.role = u.role.rawValue
        self.signupCountry = u.signupCountry
        self.signupRegion = u.signupRegion
        self.signupCity = u.signupCity
        self.lang = u.lang
        self.signupSource = u.signupSource
        self.anonymized = u.anonymizedAt != nil
        self.createdAt = u.createdAt
        self.supportClickedAt = support["support_heart"]
        self.aixetaClickedAt = support["support_aixeta"]
        self.moderationStrikes = u.moderationStrikes
        self.postingRestrictedUntil = u.postingRestrictedUntil
    }
}

struct SetRoleDTO: Content {
    let role: String
}

extension CreateUserDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("name", as: String.self, is: !.empty)
        validations.add("username", as: String.self, is: .count(3...))
        validations.add("email", as: String.self, is: .email)
        validations.add("password", as: String.self, is: .count(8...))
    }
}

/// Baja del resumen semanal desde el correo: id de usuario + su HMAC.
struct UnsubscribeDTO: Content {
    let user: String
    let token: String
    /// Qué se apaga: `mentions`, o el resumen semanal si no viene.
    ///
    /// Opcional y con el resumen por defecto **a posta**: los enlaces de baja ya enviados
    /// no lo llevan y viven para siempre en el buzón de quien los recibió. Un parámetro
    /// obligatorio los habría roto todos de golpe.
    var kind: String? = nil
}

struct UpdateUserDTO: Content {
    let name: String
    let username: String
    let email: String
    let password: String?
    let emailPublic: Bool?
    let namePublic: Bool?
    /// Resumen semanal por correo. Opcional: si no viene, la preferencia no se toca.
    var weeklyDigest: Bool? = nil
    /// Apagar la gamificación. Opcional, igual que la anterior.
    var gamificationOptOut: Bool? = nil
    var mentionEmails: Bool? = nil
}

extension UpdateUserDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("name", as: String.self, is: !.empty)
        validations.add("username", as: String.self, is: .count(3...))
        validations.add("email", as: String.self, is: .email)
        validations.add("password", as: String.self, is: .count(8...), required: false)
    }
}
