import Fluent
import Vapor

// Medición de demanda de app móvil nativa (banner en la web) — ver "Pendiente".
// Crear voto: público (auth OPCIONAL; si viene token se liga al usuario).
// Estadística: solo admins.
struct InterestController: RouteCollection {
    static let platforms = ["ios", "android", "other"]

    func boot(routes: RoutesBuilder) throws {
        let interest = routes.grouped("interest")
        // Auth opcional: si hay token capturamos quién vota; si no, voto anónimo.
        interest.grouped(UserToken.authenticator()).post(use: create)
        // Estadística: exige token y rol admin.
        interest.grouped(UserToken.authenticator(), User.guardMiddleware()).get("stats", use: stats)
    }

    /// POST /interest — registra si el visitante quiere (o no) una app móvil.
    /// Si está autenticado, un único voto por usuario (se actualiza si vuelve a votar).
    @Sendable func create(req: Request) async throws -> HTTPStatus {
        try VoteDTO.validate(content: req)
        let dto = try req.content.decode(VoteDTO.self)

        if let user = req.auth.get(User.self) {
            let userID = try user.requireID()
            // Upsert: un voto por usuario.
            let existing = try await AppInterest.query(on: req.db)
                .filter(\.$user.$id == userID)
                .first()
            if let existing {
                existing.wants = dto.wants
                existing.platform = dto.platform
                try await existing.save(on: req.db)
            } else {
                try await AppInterest(userID: userID, wants: dto.wants, platform: dto.platform).save(on: req.db)
            }
        } else {
            try await AppInterest(wants: dto.wants, platform: dto.platform).save(on: req.db)
        }
        return .noContent
    }

    /// GET /interest/stats — recuento sí/no y quién lo quiere (solo admins).
    @Sendable func stats(req: Request) async throws -> InterestStats {
        let user = try req.auth.require(User.self)
        guard user.isAdmin else { throw Abort(.forbidden, reason: "Solo para administradores") }

        let all = try await AppInterest.query(on: req.db).sort(\.$createdAt, .descending).all()
        let yes = all.filter { $0.wants }.count
        let names = try await User.usernames(for: all.compactMap { $0.$user.id }, on: req.db)
        // Solo los votos con usuario identificado se listan (los anónimos solo cuentan).
        let voters = all.compactMap { i -> InterestVoter? in
            guard let uid = i.$user.id, let username = names[uid] else { return nil }
            return InterestVoter(username: username, wants: i.wants, platform: i.platform, at: i.updatedAt ?? i.createdAt)
        }
        return InterestStats(yes: yes, no: all.count - yes, total: all.count, voters: voters)
    }
}

struct VoteDTO: Content {
    let wants: Bool
    let platform: String?
}

extension VoteDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("platform", as: String.self, is: .in("ios", "android", "other"), required: false)
    }
}

struct InterestVoter: Content {
    let username: String
    let wants: Bool
    let platform: String?
    let at: Date?
}

struct InterestStats: Content {
    let yes: Int
    let no: Int
    let total: Int
    /// Votantes identificados (los anónimos solo suman en los recuentos).
    let voters: [InterestVoter]
}
