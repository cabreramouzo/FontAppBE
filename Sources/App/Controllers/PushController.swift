import Fluent
import Vapor

/// Suscribir y dar de baja un navegador para las notificaciones del sistema.
struct PushController: RouteCollection {
    func boot(routes: any RoutesBuilder) throws {
        let push = routes.grouped("push")
        // La clave pública es **pública** por definición: viaja dentro de cada suscripción
        // y el navegador la necesita antes de tener sesión siquiera. No pide autenticación
        // y no revela nada.
        push.get("key", use: key)

        let auth = push.grouped(User.authenticator(), User.guardMiddleware())
        auth.post("subscribe", use: subscribe)
        auth.post("unsubscribe", use: unsubscribe)
        auth.post("test", use: test)
    }

    struct KeyResponse: Content {
        /// `nil` si el servidor no tiene push configurado. El cliente entonces ni ofrece
        /// el interruptor, en vez de pedirle permiso a alguien para nada.
        let key: String?
    }

    func key(_ req: Request) async throws -> KeyResponse {
        KeyResponse(key: req.vapid?.publicKey.base64URL)
    }

    struct SubscribeDTO: Content {
        let endpoint: String
        let p256dh: String
        let auth: String
    }

    func subscribe(_ req: Request) async throws -> HTTPStatus {
        let user = try req.auth.require(User.self)
        let dto = try req.content.decode(SubscribeDTO.self)
        guard dto.endpoint.hasPrefix("https://"), dto.endpoint.count <= 1000 else {
            throw AppError(.badRequest, "push.badEndpoint", "El endpoint no es válido.")
        }
        // Se comprueba que las claves son claves **antes** de guardarlas: si no, el fallo
        // aparece meses después como un aviso que no llega y sin nada que mirar.
        let candidata = PushSubscription(userID: try user.requireID(), endpoint: dto.endpoint,
                                         p256dh: dto.p256dh, auth: dto.auth)
        guard candidata.suscriptor != nil else {
            throw AppError(.badRequest, "push.badKeys", "Las claves de la suscripción no son válidas.")
        }

        // El endpoint es la identidad del aparato: si ya existe se ACTUALIZA. Un navegador
        // puede rotar sus claves conservando el endpoint, y con dos filas una de ellas ya
        // no descifraría — un aviso duplicado del que uno llega en blanco.
        if let ya = try await PushSubscription.query(on: req.db)
            .filter(\.$endpoint == dto.endpoint).first() {
            ya.$user.id = try user.requireID()
            ya.p256dh = dto.p256dh
            ya.auth = dto.auth
            try await ya.save(on: req.db)
            return .ok
        }
        try await candidata.save(on: req.db)
        return .created
    }

    /// Manda un aviso de prueba **a uno mismo**.
    ///
    /// Existe porque sin esto probar el push exige una segunda cuenta y una reseña de
    /// verdad, y cuando no llega nada no se puede saber qué falla: la suscripción, las
    /// claves VAPID o el aviso. Esto deja fuera de la ecuación todo lo demás.
    ///
    /// Solo se manda a quien lo pide —el destinatario es la propia sesión—, así que no
    /// hay forma de usarlo para molestar a nadie.
    func test(_ req: Request) async throws -> HTTPStatus {
        let user = try req.auth.require(User.self)
        guard let push = PushEnvio(req.application) else {
            throw AppError(.serviceUnavailable, "push.notConfigured",
                           "El servidor no tiene claves VAPID configuradas.")
        }
        let n = try await PushSubscription.query(on: req.db)
            .filter(\.$user.$id == user.requireID()).count()
        guard n > 0 else {
            throw AppError(.badRequest, "push.noSubscription",
                           "Esta cuenta no tiene ningún aparato suscrito.")
        }
        let (titulo, cuerpo) = PushCopy.prueba(lang: user.lang)
        await PushSender.send(.init(title: titulo, body: cuerpo, url: "/me/settings",
                                    tag: "fontapp-prueba"),
                              to: try user.requireID(), on: req.db,
                              client: push.client, vapid: push.vapid, logger: push.logger)
        return .accepted
    }

    struct UnsubscribeDTO: Content { let endpoint: String }

    /// Da de baja **este** aparato, no la cuenta entera: quien apaga los avisos en el móvil
    /// no está diciendo nada sobre su portátil.
    func unsubscribe(_ req: Request) async throws -> HTTPStatus {
        let user = try req.auth.require(User.self)
        let dto = try req.content.decode(UnsubscribeDTO.self)
        try await PushSubscription.query(on: req.db)
            .filter(\.$user.$id == user.requireID())
            .filter(\.$endpoint == dto.endpoint)
            .delete()
        return .noContent
    }
}
