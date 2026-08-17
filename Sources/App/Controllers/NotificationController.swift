import Fluent
import Vapor

/// La campana: los avisos de la persona que mira.
///
/// Todo privado y sin caché — es la bandeja de alguien, y la única lectura posible es la
/// suya. No hay endpoint para ver los avisos de otro porque no hay motivo para que exista.
struct NotificationController: RouteCollection {
    /// Cuántos se devuelven. Una campana no es un historial: lo que no cabe aquí es que
    /// hace tiempo que no entras, y en ese caso los diez primeros ya te lo cuentan.
    static let pageSize = 30

    func boot(routes: any RoutesBuilder) throws {
        let avisos = routes.grouped("notifications")
            .grouped(UserToken.authenticator(), User.guardMiddleware())
        avisos.get(use: index)
        avisos.post("read", use: markRead)
    }

    struct Item: Content {
        let id: UUID
        let kind: String
        let actorName: String
        /// A dónde lleva. Nulo si la fuente se borró: el aviso sobrevive y deja de ser
        /// un enlace, en vez de mandarte a un 404.
        let fontID: UUID?
        let fontName: String
        let excerpt: String
        let read: Bool
        let createdAt: Date?

        /// Explícito, como en el resto de esta API: el codificador sintetizado omite los
        /// opcionales nulos y en el cliente llegan como `undefined`. Quinta vez.
        func encode(to encoder: any Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(id, forKey: .id)
            try c.encode(kind, forKey: .kind)
            try c.encode(actorName, forKey: .actorName)
            try c.encode(fontID, forKey: .fontID)
            try c.encode(fontName, forKey: .fontName)
            try c.encode(excerpt, forKey: .excerpt)
            try c.encode(read, forKey: .read)
            try c.encode(createdAt, forKey: .createdAt)
        }
    }

    struct Inbox: Content {
        let unread: Int
        let items: [Item]
    }

    /// GET /notifications — la bandeja, sin marcar nada como leído.
    ///
    /// Leer no es lo mismo que abrir: si esta ruta marcara, cualquier carga de la app te
    /// vaciaría la campana antes de que la miraras. Se marca cuando se abre el panel.
    ///
    /// De paso, y solo aquí, se anota que has pasado (`last_seen_at`). Es la petición que
    /// hace la app al cargar, así que es el sitio exacto donde saber si alguien anda por
    /// aquí — y eso es lo que decide si un aviso necesita además un correo.
    @Sendable func index(req: Request) async throws -> Inbox {
        let user = try req.auth.require(User.self)
        let userID = try user.requireID()

        await touch(user, on: req.db)

        let avisos = try await Notification.query(on: req.db)
            .filter(\.$user.$id == userID)
            .sort(\.$createdAt, .descending)
            .limit(Self.pageSize)
            .all()
        let sinLeer = try await Notification.query(on: req.db)
            .filter(\.$user.$id == userID)
            .filter(\.$readAt == nil)
            .count()

        return Inbox(unread: sinLeer, items: avisos.compactMap { n in
            guard let id = n.id else { return nil }
            return Item(id: id, kind: n.kind.rawValue, actorName: n.actorName,
                        fontID: n.$font.id, fontName: n.fontName, excerpt: n.excerpt,
                        read: n.readAt != nil, createdAt: n.createdAt)
        })
    }

    /// POST /notifications/read — marca como leídos todos los que había.
    ///
    /// Todos y no uno a uno: la campana se abre entera y se lee de un vistazo, y pedir un
    /// gesto por aviso para apagar un punto rojo es trabajo que no le sirve a nadie.
    @Sendable func markRead(req: Request) async throws -> HTTPStatus {
        let user = try req.auth.require(User.self)
        let userID = try user.requireID()
        try await Notification.query(on: req.db)
            .filter(\.$user.$id == userID)
            .filter(\.$readAt == nil)
            .set(\.$readAt, to: Date())
            .update()
        return .noContent
    }

    /// Anota el paso, como mucho una vez por `User.seenThrottle`. Nunca lanza: fallar al
    /// apuntar que alguien ha entrado no puede costarle ver sus avisos.
    private func touch(_ user: User, on db: any Database) async {
        let ahora = Date()
        if let visto = user.lastSeenAt, ahora.timeIntervalSince(visto) < User.seenThrottle { return }
        user.lastSeenAt = ahora
        try? await user.save(on: db)
    }
}
