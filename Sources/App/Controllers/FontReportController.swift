import Fluent
import Vapor

// Reportes de problemas sobre una fuente — ver definitions.md (Fonts problem management).
// Un "report" avisa de una INCIDENCIA en la fuente (avería, sin agua, sucia, grifo roto…).
struct FontReportController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let reports = routes.grouped("fonts", ":fontID", "report")
        // Lectura pública, pero **con el autenticador y sin `guardMiddleware`**: hace falta
        // saber si quien mira ya dio su me gusta, y eso no puede costar que la ficha deje
        // de verse sin sesión. Es el mismo patrón que usa `GET /fonts` para mirar si quien
        // llama es admin sin dejar de ser pública.
        reports.grouped(UserToken.authenticator()).get(use: index)
        let auth = reports.grouped(UserToken.authenticator(), User.guardMiddleware())
        auth.grouped(RateLimitMiddleware(scope: "report", max: 20, window: 60 * 60)).post(use: create)
        // El listado para revisar lo que ya está escrito. Va fuera del grupo de una
        // fuente concreta porque la pregunta es «enséñame todo», que es justo lo que no
        // se puede contestar entrando ficha por ficha.
        routes.grouped("admin", "reports")
            .grouped(UserToken.authenticator(), User.guardMiddleware())
            .get(use: adminIndex)
        auth.group(":reportID") { r in
            r.delete(use: destroy)
            r.put(use: update)
            // Cerrar y reabrir. Reabrir es lo que hace que cerrar se pueda conceder por
            // nivel: si no hubiera vuelta atrás, una incidencia legítima podría quedar
            // silenciada por alguien que se equivocó.
            r.post("resolve", use: resolve)
            r.delete("resolve", use: reopen)
            r.patch("incident", use: setIncident)
            r.post("like", use: like)
            r.delete("like", use: unlike)
        }
    }

    /// Cuánto tiempo se puede corregir lo que uno escribió.
    ///
    /// Una hora, y es una ventana y no «siempre» por lo que un comentario significa aquí:
    /// otras personas lo leen para decidir si se desvían, y algunos llevan respuesta
    /// debajo. Poder reescribirlo a los tres días deja conversaciones que no se entienden
    /// y avisos que ya no dicen lo que alguien contestó. Una hora cubre lo que de verdad
    /// se pide —la errata, el «quería decir la otra fuente», el dedo en el móvil— sin
    /// abrir eso.
    static let editWindow: TimeInterval = 60 * 60

    /// PUT /fonts/:fontID/report/:reportID — corrige el texto durante la primera hora.
    ///
    /// **Solo el texto.** Marcar como incidencia y ponerle tipo tienen su propia ruta
    /// (`PATCH .../incident`) porque son decisiones distintas y con otros permisos: el
    /// texto es tuyo y solo tuyo, y lo otro lo puede tocar un moderador.
    ///
    /// **No vuelve a avisar de las menciones.** Al crear sí se avisa; al editar no, o
    /// editar sería una forma gratuita de darle un toque a alguien tantas veces como
    /// quieras. El precio asumido: añadir una mención al corregir no le llega a nadie.
    @Sendable func update(req: Request) async throws -> ReportResponse {
        let user = try req.auth.require(User.self)
        try user.requireCanContribute()
        guard let report = try await FontReport.find(req.parameters.get("reportID"), on: req.db) else {
            throw AppError(.notFound, "report.notFound", "No se ha encontrado el comentario")
        }
        guard report.$user.id == (try user.requireID()) else {
            throw AppError(.forbidden, "report.selfOnly", "Solo puedes editar tus comentarios")
        }
        guard let creado = report.createdAt,
              Date().timeIntervalSince(creado) <= Self.editWindow else {
            throw AppError(.forbidden, "report.editWindowOver",
                           "El plazo para editar este comentario ha terminado")
        }
        try CreateReportDTO.validate(content: req)
        let dto = try req.content.decode(CreateReportDTO.self)
        report.message = dto.message
        report.editedAt = Date()
        try await report.save(on: req.db)
        let autores = try await User.authors(for: report.$user.id.map { [$0] } ?? [], on: req.db)
        let quien = report.$user.id.flatMap { autores[$0] }
        return ReportResponse(report, username: quien?.username, staff: quien?.staff)
    }

    /// GET /fonts/:fontID/report — lista los problemas reportados en la fuente.
    @Sendable func index(req: Request) async throws -> [ReportResponse] {
        let fontID = try await requireFontID(req)
        let reports = try await FontReport.query(on: req.db)
            .filter(\.$font.$id == fontID)
            .sort(\.$createdAt, .descending)
            .all()
        let autores = try await User.authors(
            for: reports.flatMap { [$0.$user.id, $0.$resolver.id] }.compactMap { $0 }, on: req.db)
        let megusta = try await Self.likes(for: reports, viewer: req.auth.get(User.self)?.id, on: req.db)
        return reports.map {
            let quien = $0.$user.id.flatMap { autores[$0] }
            return ReportResponse($0, username: quien?.username, staff: quien?.staff,
                                  resolverName: $0.$resolver.id.flatMap { autores[$0]?.username },
                                  likes: $0.id.flatMap { megusta[$0] })
        }
    }

    /// POST /fonts/:fontID/report/:reportID/resolve — darla por resuelta.
    ///
    /// La puede cerrar quien la abrió (ya se ha arreglado, lo he visto), un moderador, o
    /// quien tenga la capacidad por nivel. **No se borra**: que la fuente estuvo rota y
    /// volvió a manar es parte de su historia y es lo que mira quien duda si acercarse.
    @Sendable func resolve(req: Request) async throws -> ReportResponse {
        try req.auth.require(User.self).requireCanContribute()
        return try await cambiaEstado(req, resolviendo: true)
    }

    /// DELETE /fonts/:fontID/report/:reportID/resolve — volver a abrirla.
    @Sendable func reopen(req: Request) async throws -> ReportResponse {
        try await cambiaEstado(req, resolviendo: false)
    }

    /// Cierra sola las incidencias abiertas de una fuente cuando llega una reseña que
    /// dice que vuelve a manar.
    ///
    /// ## Por qué automático
    ///
    /// El sistema ya deducía esto y no hacía nada con ello: `ContributionLedger` concede
    /// la insignia «Incidencia resuelta» cuando después de un aviso aparece una reseña
    /// `flowing`. O sea que calculábamos la respuesta y luego pedíamos a un humano —de
    /// nivel 6, además— que pulsara un botón para decir lo mismo. Mientras nadie lo
    /// pulsaba, la ficha seguía avisando de una avería que ya no existe, que es
    /// justamente la información equivocada que esta app existe para evitar.
    ///
    /// Se cierra al publicar y no al liquidar a las 72 h, al revés que la insignia: aquí
    /// no se está pagando nada, se está diciendo si hay agua, y eso caduca rápido. Si la
    /// reseña resulta falsa, cualquiera puede reabrir la incidencia.
    ///
    /// Sin `resolver`: nadie la cerró. La ficha lo dice como «resuelta automáticamente»
    /// en vez de atribuírsela a quien pasó por allí, que no ha decidido nada.
    /// - Returns: **quiénes** habían abierto las incidencias cerradas. Vacío significa
    ///   que no había ninguna abierta, y quien llama lo necesita para avisar solo cuando
    ///   ha pasado algo: «la incidencia se ha resuelto» sobre una fuente que no tenía
    ///   ninguna no es una noticia, es ruido. Y sirve además para decidir a quién le llega
    ///   una notificación del sistema: para el que pasaba por ahí es una buena noticia sin
    ///   nada que hacer, pero para quien se molestó en avisar cierra su propio bucle.
    @discardableResult
    static func autoResolve(fontID: UUID, on db: any Database) async throws -> Set<UUID> {
        let abiertas = try await FontReport.query(on: db)
            .filter(\.$font.$id == fontID)
            .filter(\.$isIncident == true)
            .filter(\.$resolvedAt == nil)
            .all()
        guard !abiertas.isEmpty else { return [] }
        let ahora = Date()
        for r in abiertas {
            r.resolvedAt = ahora
            r.$resolver.id = nil
            try await r.save(on: db)
        }
        return Set(abiertas.compactMap { $0.$user.id })
    }

    private func cambiaEstado(_ req: Request, resolviendo: Bool) async throws -> ReportResponse {
        let user = try req.auth.require(User.self)
        guard let report = try await FontReport.find(req.parameters.get("reportID"), on: req.db) else {
            throw AppError(.notFound, "report.notFound", "Incidencia no encontrada")
        }
        // Un comentario no se «resuelve»: no hay nada que arreglar. Si de verdad lo era,
        // primero se marca como incidencia y después se cierra.
        guard report.isIncident else {
            throw AppError(.badRequest, "report.notAnIncident", "Esto es un comentario, no una incidencia")
        }
        let userID = try user.requireID()
        var puede = report.$user.id == userID || user.canModerate
        if !puede { puede = try await Capabilities.has(.resolveIncident, user, on: req.db) }
        guard puede else { throw AppError(.forbidden, "capability.resolveIncident", "Todavía no puedes cerrar incidencias ajenas") }

        report.resolvedAt = resolviendo ? Date() : nil
        report.$resolver.id = resolviendo ? userID : nil
        try await report.save(on: req.db)
        let autores = try await User.authors(
            for: [report.$user.id, report.$resolver.id].compactMap { $0 }, on: req.db)
        let quien = report.$user.id.flatMap { autores[$0] }
        return ReportResponse(report, username: quien?.username, staff: quien?.staff,
                              resolverName: report.$resolver.id.flatMap { autores[$0]?.username })
    }

    /// GET /admin/reports — todos los comentarios e incidencias, para repasarlos.
    ///
    /// Existe porque la marca de incidencia llegó **después** que los datos: todo lo
    /// escrito hasta ahora entró cuando la caja se llamaba «incidencia», así que hay que
    /// poder mirarlo entero y desmarcar lo que no lo era. Ficha por ficha eso es
    /// imposible: no hay ninguna pantalla que responda «enséñame todo lo que hay escrito».
    ///
    /// Solo admin, y solo lectura: escribir es la ruta de siempre (`PATCH …/incident`),
    /// para no abrir una segunda puerta con reglas distintas — el mismo criterio que
    /// siguió el panel de moderación.
    struct AdminReport: Content {
        let id: UUID
        let fontID: UUID
        let fontName: String?
        let username: String?
        let message: String
        let isIncident: Bool
        let incidentKind: IncidentKind?
        let createdAt: Date?
        let resolvedAt: Date?

        /// Los opcionales, **explícitos**. El codificador de Swift omite los nulos y en el
        /// cliente `undefined !== null`; aquí solo se miran por verdadero/falso, pero es
        /// la regla de esta API desde que el mismo descuido tumbó la pantalla de ayuda
        /// (`fromDays`) y dio por conseguida toda insignia bloqueada (`tier`).
        func encode(to encoder: any Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(id, forKey: .id)
            try c.encode(fontID, forKey: .fontID)
            try c.encode(fontName, forKey: .fontName)
            try c.encode(username, forKey: .username)
            try c.encode(message, forKey: .message)
            try c.encode(isIncident, forKey: .isIncident)
            try c.encode(incidentKind, forKey: .incidentKind)
            try c.encode(createdAt, forKey: .createdAt)
            try c.encode(resolvedAt, forKey: .resolvedAt)
        }
    }

    @Sendable func adminIndex(req: Request) async throws -> [AdminReport] {
        let user = try req.auth.require(User.self)
        guard user.isAdmin else { throw AppError(.forbidden, "auth.adminOnly", "Solo administradores") }

        let reports = try await FontReport.query(on: req.db)
            .sort(\.$createdAt, .descending)
            .limit(500)
            .all()
        // Los nombres de fuente y de autor en dos consultas y no una por fila: son
        // quinientas y esto se abre para repasarlas de una sentada.
        let fuentes = try await Font.query(on: req.db)
            .filter(\.$id ~~ Set(reports.map { $0.$font.id }))
            .all()
            .reduce(into: [UUID: String?]()) { $0[$1.id!] = $1.name }
        let autores = try await User.authors(for: reports.compactMap { $0.$user.id }, on: req.db)

        return reports.compactMap { r in
            guard let id = r.id else { return nil }
            return AdminReport(
                id: id, fontID: r.$font.id, fontName: fuentes[r.$font.id] ?? nil,
                username: r.$user.id.flatMap { autores[$0]?.username },
                message: r.message, isIncident: r.isIncident, incidentKind: r.incidentKind,
                createdAt: r.createdAt, resolvedAt: r.resolvedAt)
        }
    }

    /// PATCH /fonts/:fontID/report/:reportID/incident — marcar o desmarcar como incidencia.
    ///
    /// Existe por las dos direcciones y las dos hacen falta:
    ///
    /// - **Desmarcar** es lo que limpia lo que ya está escrito. Sin esto, los comentarios
    ///   que entraron cuando la caja se llamaba «incidencia» se quedan abiertos para
    ///   siempre, porque nadie va a «resolver» una petición de foto.
    /// - **Marcar** es la red de seguridad del interruptor apagado por defecto: una avería
    ///   real que se escribió como comentario la puede ascender otro.
    ///
    /// Quién: el autor sobre lo suyo y moderador+ sobre lo ajeno. La misma escalera de
    /// siempre — y no se abre por nivel a propósito, porque decidir si el aviso de otro es
    /// una avería es criterio sobre una persona y no sobre el mapa.
    struct SetIncidentDTO: Content { let isIncident: Bool; let incidentKind: IncidentKind? }

    @Sendable func setIncident(req: Request) async throws -> ReportResponse {
        let user = try req.auth.require(User.self)
        try user.requireCanContribute()
        guard let report = try await FontReport.find(req.parameters.get("reportID"), on: req.db) else {
            throw AppError(.notFound, "report.notFound", "Incidencia no encontrada")
        }
        let dto = try req.content.decode(SetIncidentDTO.self)
        guard report.$user.id == (try user.requireID()) || user.canModerate else {
            throw AppError(.forbidden, "report.notYours", "Solo puedes cambiar los tuyos")
        }
        report.isIncident = dto.isIncident
        report.incidentKind = dto.isIncident ? (dto.incidentKind ?? report.incidentKind) : nil
        // Dejar de ser incidencia también borra el cierre: «resuelta» no significa nada
        // sobre un comentario, y si se volviera a marcar aparecería cerrada sin que nadie
        // la haya arreglado.
        if !dto.isIncident {
            report.resolvedAt = nil
            report.$resolver.id = nil
        }
        try await report.save(on: req.db)
        let autores = try await User.authors(
            for: [report.$user.id, report.$resolver.id].compactMap { $0 }, on: req.db)
        let quien = report.$user.id.flatMap { autores[$0] }
        return ReportResponse(report, username: quien?.username, staff: quien?.staff,
                              resolverName: report.$resolver.id.flatMap { autores[$0]?.username })
    }

    /// POST /fonts/:fontID/report — reporta un problema en la fuente.
    @Sendable func create(req: Request) async throws -> Response {
        let user = try req.auth.require(User.self)
        try user.requireCanContribute()
        let fontID = try await requireFontID(req)
        try CreateReportDTO.validate(content: req)
        let dto = try req.content.decode(CreateReportDTO.self)

        let esIncidencia = dto.isIncident ?? false
        let report = FontReport(fontID: fontID, userID: try user.requireID(), message: dto.message,
                                isIncident: esIncidencia,
                                // El tipo solo tiene sentido si es una incidencia: guardarlo
                                // en un comentario dejaría filas que dicen «rota» sobre algo
                                // que nadie ha declarado avería.
                                incidentKind: esIncidencia ? dto.incidentKind : nil)
        try await report.save(on: req.db)

        // Después de guardar y sin esperar: un aviso que no sale no puede costarle la
        // incidencia a quien la escribe.
        MentionNotifier.notify(text: dto.message, by: user, fontID: fontID, on: req)

        // Y a quien sigue la fuente: una avería es exactamente lo que quiere saber quien
        // la tiene en favoritas antes de ir.
        let quienID = try user.requireID()
        let db = req.db

        // **Avisar de algo te pone la fuente en favoritas.**
        //
        // Sin esto, quien reporta un fallo escribe al vacío: los avisos van a quien tiene
        // la fuente en favoritas, y poner una incidencia no lo hacía. Pasó de verdad — un
        // usuario avisó de que una fuente constaba como potable sin serlo, se le contestó
        // en la propia ficha, y no se enteró; hubo que escribirle un correo a mano.
        //
        // Quien se molesta en avisar de que algo está mal es exactamente la persona a la
        // que quieres poder responder, así que la suscripción es el caso normal y no la
        // excepción. Se puede deshacer con el mismo botón de siempre.
        //
        // Solo al **crear**, y sin duplicar si ya la tenía. Quien la quitó a mano y
        // vuelve a reportar sí se la encuentra marcada otra vez: no guardamos el «no la
        // quiero», y quien vuelve a avisar de algo quiere que le respondan. `try?` porque
        // perder la incidencia por no poder marcar una favorita sería absurdo — es lo
        // mismo que ya se hace con los avisos.
        try? await FontFavorite.follow(fontID: fontID, userID: quienID, on: db)

        // **Solo una incidencia despierta a nadie.** Un comentario sobre la fuente no es
        // urgente por definición: no cambia lo que vas a hacer, y esta app se silencia una
        // vez y no se vuelve. La marca es justo lo que separa las dos cosas.
        if esIncidencia {
            let push = PushEnvio(req.application)
            Task.detached {
                await FontWatchNotifier.notify(fontID: fontID, change: .report, actorID: quienID, on: db, push: push)
            }
        }

        let response = Response(status: .created)
        try response.content.encode(
            ReportResponse(report, username: user.username, staff: user.role == .user ? nil : user.role))
        return response
    }

    /// Verifica que la fuente existe (404 si no) y devuelve su id.
    private func requireFontID(_ req: Request) async throws -> UUID {
        guard let font = try await Font.find(req.parameters.get("fontID"), on: req.db) else {
            throw AppError(.notFound, "font.notFound", "No existe la fuente indicada")
        }
        return try font.requireID()
    }

    /// DELETE /fonts/:fontID/report/:reportID — borra una incidencia propia.
    /// Cuántos me gusta tiene cada comentario y si el que mira ya dio el suyo.
    ///
    /// Una sola consulta para toda la lista: el mismo patrón que `confirmations(for:)` en
    /// las reseñas, y por la misma razón — una por comentario sería una N+1 en la ficha de
    /// cualquier fuente con conversación.
    static func likes(for reports: [FontReport], viewer: UUID?, on db: any Database) async throws -> [UUID: LikeAgg] {
        let ids = reports.compactMap { $0.id }
        guard !ids.isEmpty else { return [:] }
        let filas = try await ReportLike.query(on: db).filter(\.$report.$id ~~ ids).all()
        var out: [UUID: LikeAgg] = [:]
        for f in filas {
            let rid = f.$report.id
            var agg = out[rid] ?? LikeAgg(count: 0, mine: false)
            agg.count += 1
            if let viewer, f.$user.id == viewer { agg.mine = true }
            out[rid] = agg
        }
        return out
    }

    /// POST /fonts/:fontID/report/:reportID/like — me gusta. Idempotente.
    ///
    /// **Ni avisa ni puntúa**, y eso es el diseño y no una tarea pendiente: un me gusta no
    /// cambia lo que vas a hacer —que es la regla que decide qué merece una notificación
    /// en esta app— y si diera gotas sería gratis de farmear entre dos cuentas.
    @Sendable func like(req: Request) async throws -> ReportResponse {
        try await setLike(req, on: true)
    }

    /// DELETE …/like — quitarlo.
    @Sendable func unlike(req: Request) async throws -> ReportResponse {
        try await setLike(req, on: false)
    }

    private func setLike(_ req: Request, on: Bool) async throws -> ReportResponse {
        let user = try req.auth.require(User.self)
        try user.requireCanContribute()
        guard let report = try await FontReport.find(req.parameters.get("reportID"), on: req.db) else {
            throw AppError(.notFound, "report.notFound", "No se ha encontrado el comentario")
        }
        let userID = try user.requireID()
        let reportID = try report.requireID()
        let ya = try await ReportLike.query(on: req.db)
            .filter(\.$report.$id == reportID)
            .filter(\.$user.$id == userID)
            .first()
        if on {
            // Repetirlo no apila nada: el índice único lo impediría igual, pero así
            // tampoco devuelve un error por algo que desde fuera es «ya está hecho».
            if ya == nil { try await ReportLike(reportID: reportID, userID: userID).save(on: req.db) }
        } else {
            try await ya?.delete(on: req.db)
        }
        let autores = try await User.authors(for: report.$user.id.map { [$0] } ?? [], on: req.db)
        let quien = report.$user.id.flatMap { autores[$0] }
        let agg = try await Self.likes(for: [report], viewer: userID, on: req.db)
        return ReportResponse(report, username: quien?.username, staff: quien?.staff,
                              likes: agg[reportID])
    }

    @Sendable func destroy(req: Request) async throws -> HTTPStatus {
        let user = try req.auth.require(User.self)
        guard let report = try await FontReport.find(req.parameters.get("reportID"), on: req.db) else {
            throw Abort(.notFound)
        }
        guard user.canModerate || report.$user.id == user.id else {
            throw AppError(.forbidden, "report.selfOnly", "Solo puedes borrar tus propias incidencias")
        }
        try await report.delete(on: req.db)
        return .noContent
    }
}

struct CreateReportDTO: Content {
    let message: String
    /// Si no viene, es un **comentario**. El valor por defecto es el opuesto al de la
    /// columna a propósito: la columna nace a `true` para que lo ya escrito conserve su
    /// significado, y el DTO a `false` porque de aquí en adelante marcar una incidencia
    /// tiene que ser un gesto explícito. Un cliente viejo que no mande el campo publicará
    /// comentarios, que es el fallo barato: se marca después.
    let isIncident: Bool?
    let incidentKind: IncidentKind?
}

extension CreateReportDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("message", as: String.self, is: .count(1...1000))
    }
}

/// Representación pública de un reporte (evita el `{"font":{"id":…}}` del @Parent).
/// Recuento de me gusta de un comentario y si el que mira ya dio el suyo.
struct LikeAgg {
    var count: Int
    var mine: Bool
}

struct ReportResponse: Content {
    let id: UUID?
    let fontID: UUID
    let userID: UUID?
    let username: String?
    /// Rol de quien lo escribió, **solo si es del equipo**. Nulo para todos los demás.
    /// Es lo que deja marcar un aviso de moderación como tal: firmado por «admin», el
    /// mismo texto pasa de ser la opinión de alguien a ser una decisión.
    let staff: UserRole?
    let message: String
    let isIncident: Bool
    let incidentKind: IncidentKind?
    let createdAt: Date?
    /// Cuándo se corrigió el texto, o nulo si no se ha tocado. El cliente lo pinta como
    /// «editado» y le sirve además para saber si aún queda plazo.
    let editedAt: Date?
    /// Nulo = sigue abierta. Explícito en el JSON, como el resto de opcionales de esta
    /// API: omitido llega como `undefined` y «resuelta» se distingue de «no lo sé».
    let resolvedAt: Date?
    let resolvedBy: String?
    /// Cuántos me gusta lleva. **Cero es cero y se manda igual**: el cliente decide no
    /// pintar nada, que no es lo mismo que no saberlo.
    let likes: Int
    /// Si quien pide la lista ya dio el suyo. Sin sesión es `false`.
    let likedByMe: Bool

    init(_ report: FontReport, username: String?, staff: UserRole? = nil, resolverName: String? = nil,
         likes: LikeAgg? = nil) {
        self.id = report.id
        self.fontID = report.$font.id
        self.userID = report.$user.id
        self.username = username
        self.staff = staff
        self.message = report.message
        self.isIncident = report.isIncident
        self.incidentKind = report.incidentKind
        self.createdAt = report.createdAt
        self.editedAt = report.editedAt
        self.resolvedAt = report.resolvedAt
        self.resolvedBy = resolverName
        self.likes = likes?.count ?? 0
        self.likedByMe = likes?.mine ?? false
    }

    func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(fontID, forKey: .fontID)
        try c.encode(userID, forKey: .userID)
        try c.encode(username, forKey: .username)
        try c.encode(staff, forKey: .staff)
        try c.encode(message, forKey: .message)
        // Explícitos, como el resto de opcionales de esta API: omitido llega como
        // `undefined` y el cliente no puede distinguir «no es incidencia» de «este
        // servidor todavía no lo sabe».
        try c.encode(isIncident, forKey: .isIncident)
        try c.encode(incidentKind, forKey: .incidentKind)
        try c.encode(createdAt, forKey: .createdAt)
        try c.encode(editedAt, forKey: .editedAt)
        try c.encode(resolvedAt, forKey: .resolvedAt)
        try c.encode(resolvedBy, forKey: .resolvedBy)
        try c.encode(likes, forKey: .likes)
        try c.encode(likedByMe, forKey: .likedByMe)
    }
}
