import Fluent
import Vapor

// Reportes de problemas sobre una fuente — ver definitions.md (Fonts problem management).
// Un "report" avisa de una INCIDENCIA en la fuente (avería, sin agua, sucia, grifo roto…).
struct FontReportController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let reports = routes.grouped("fonts", ":fontID", "report")
        reports.get(use: index) // lectura pública
        let auth = reports.grouped(UserToken.authenticator(), User.guardMiddleware())
        auth.grouped(RateLimitMiddleware(scope: "report", max: 20, window: 60 * 60)).post(use: create)
        auth.group(":reportID") { r in
            r.delete(use: destroy)
            // Cerrar y reabrir. Reabrir es lo que hace que cerrar se pueda conceder por
            // nivel: si no hubiera vuelta atrás, una incidencia legítima podría quedar
            // silenciada por alguien que se equivocó.
            r.post("resolve", use: resolve)
            r.delete("resolve", use: reopen)
        }
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
        return reports.map {
            let quien = $0.$user.id.flatMap { autores[$0] }
            return ReportResponse($0, username: quien?.username, staff: quien?.staff,
                                  resolverName: $0.$resolver.id.flatMap { autores[$0]?.username })
        }
    }

    /// POST /fonts/:fontID/report/:reportID/resolve — darla por resuelta.
    ///
    /// La puede cerrar quien la abrió (ya se ha arreglado, lo he visto), un moderador, o
    /// quien tenga la capacidad por nivel. **No se borra**: que la fuente estuvo rota y
    /// volvió a manar es parte de su historia y es lo que mira quien duda si acercarse.
    @Sendable func resolve(req: Request) async throws -> ReportResponse {
        try await cambiaEstado(req, resolviendo: true)
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
    /// - Returns: si de verdad ha cerrado alguna. Quien llama lo necesita para avisar a
    ///   los seguidores solo cuando ha pasado algo: «la incidencia se ha resuelto» dicho
    ///   sobre una fuente que no tenía ninguna no es una noticia, es ruido.
    @discardableResult
    static func autoResolve(fontID: UUID, on db: any Database) async throws -> Bool {
        let abiertas = try await FontReport.query(on: db)
            .filter(\.$font.$id == fontID)
            .filter(\.$resolvedAt == nil)
            .all()
        guard !abiertas.isEmpty else { return false }
        let ahora = Date()
        for r in abiertas {
            r.resolvedAt = ahora
            r.$resolver.id = nil
            try await r.save(on: db)
        }
        return true
    }

    private func cambiaEstado(_ req: Request, resolviendo: Bool) async throws -> ReportResponse {
        let user = try req.auth.require(User.self)
        guard let report = try await FontReport.find(req.parameters.get("reportID"), on: req.db) else {
            throw AppError(.notFound, "report.notFound", "Incidencia no encontrada")
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

    /// POST /fonts/:fontID/report — reporta un problema en la fuente.
    @Sendable func create(req: Request) async throws -> Response {
        let user = try req.auth.require(User.self)
        let fontID = try await requireFontID(req)
        try CreateReportDTO.validate(content: req)
        let dto = try req.content.decode(CreateReportDTO.self)

        let report = FontReport(fontID: fontID, userID: try user.requireID(), message: dto.message)
        try await report.save(on: req.db)

        // Después de guardar y sin esperar: un aviso que no sale no puede costarle la
        // incidencia a quien la escribe.
        MentionNotifier.notify(text: dto.message, by: user, fontID: fontID, on: req)

        // Y a quien sigue la fuente: una avería es exactamente lo que quiere saber quien
        // la tiene guardada antes de ir.
        let quienID = try user.requireID()
        let db = req.db
        Task.detached {
            await FontWatchNotifier.notify(fontID: fontID, change: .report, actorID: quienID, on: db)
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
}

extension CreateReportDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("message", as: String.self, is: .count(1...1000))
    }
}

/// Representación pública de un reporte (evita el `{"font":{"id":…}}` del @Parent).
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
    let createdAt: Date?
    /// Nulo = sigue abierta. Explícito en el JSON, como el resto de opcionales de esta
    /// API: omitido llega como `undefined` y «resuelta» se distingue de «no lo sé».
    let resolvedAt: Date?
    let resolvedBy: String?

    init(_ report: FontReport, username: String?, staff: UserRole? = nil, resolverName: String? = nil) {
        self.id = report.id
        self.fontID = report.$font.id
        self.userID = report.$user.id
        self.username = username
        self.staff = staff
        self.message = report.message
        self.createdAt = report.createdAt
        self.resolvedAt = report.resolvedAt
        self.resolvedBy = resolverName
    }

    func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(fontID, forKey: .fontID)
        try c.encode(userID, forKey: .userID)
        try c.encode(username, forKey: .username)
        try c.encode(staff, forKey: .staff)
        try c.encode(message, forKey: .message)
        try c.encode(createdAt, forKey: .createdAt)
        try c.encode(resolvedAt, forKey: .resolvedAt)
        try c.encode(resolvedBy, forKey: .resolvedBy)
    }
}
