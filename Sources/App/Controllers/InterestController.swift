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
        interest.grouped(UserToken.authenticator(), User.guardMiddleware()).get("dashboard", use: dashboard)
    }

    /// POST /interest — registra si el visitante quiere (o no) una app móvil y qué modelo de precio prefiere.
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
                existing.pricingPreference = dto.pricingPreference
                existing.pricePoint = dto.pricePoint
                try await existing.save(on: req.db)
            } else {
                try await AppInterest(userID: userID, wants: dto.wants, platform: dto.platform, pricingPreference: dto.pricingPreference, pricePoint: dto.pricePoint).save(on: req.db)
            }
        } else {
            try await AppInterest(wants: dto.wants, platform: dto.platform, pricingPreference: dto.pricingPreference, pricePoint: dto.pricePoint).save(on: req.db)
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
            return InterestVoter(username: username, wants: i.wants, platform: i.platform, pricingPreference: i.pricingPreference, pricePoint: i.pricePoint, at: i.updatedAt ?? i.createdAt)
        }
        return InterestStats(yes: yes, no: all.count - yes, total: all.count, voters: voters)
    }

    /// GET /interest/dashboard — estadísticas agregadas por plataforma y preferencias (solo admins).
    @Sendable func dashboard(req: Request) async throws -> InterestDashboard {
        let user = try req.auth.require(User.self)
        guard user.isAdmin else { throw Abort(.forbidden, reason: "Solo para administradores") }

        let all = try await AppInterest.query(on: req.db).all()
        var platformStats: [String: PlatformStats] = [:]

        for platform in Self.platforms {
            let platformVotes = all.filter { $0.platform == platform }
            let wantsApp = platformVotes.filter { $0.wants }
            let noApp = platformVotes.filter { !$0.wants }

            let subscriptionVotes = wantsApp.filter { $0.pricingPreference == "subscription" }
            let oneTimeVotes = wantsApp.filter { $0.pricingPreference == "one_time" }

            platformStats[platform] = PlatformStats(
                total: platformVotes.count,
                wantsApp: wantsApp.count,
                noApp: noApp.count,
                subscription: PricingModelStats(
                    count: subscriptionVotes.count,
                    priceBreakdown: breakdownPrices(subscriptionVotes, monthlyPrices: true)
                ),
                oneTime: PricingModelStats(
                    count: oneTimeVotes.count,
                    priceBreakdown: breakdownPrices(oneTimeVotes, monthlyPrices: false)
                ),
                wouldNotPay: wantsApp.filter { $0.pricingPreference == "free" }.count
            )
        }

        return InterestDashboard(
            total: all.count,
            byPlatform: platformStats
        )
    }

    private func breakdownPrices(_ votes: [AppInterest], monthlyPrices: Bool) -> [String: Int] {
        let prices = monthlyPrices
            ? ["1_month", "2_month", "5_month", "10_month"]
            : ["1", "2", "5", "10"]

        var breakdown: [String: Int] = [:]
        for price in prices {
            breakdown[price] = votes.filter { $0.pricePoint == price }.count
        }
        return breakdown
    }
}

struct VoteDTO: Content {
    let wants: Bool
    let platform: String?
    let pricingPreference: String? // 'one_time' | 'subscription' | 'free' (would not pay)
    let pricePoint: String? // '1', '2', '5', '10', '1_month', '2_month', '5_month', '10_month'
}

extension VoteDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("platform", as: String.self, is: .in("ios", "android", "other"), required: false)
        validations.add("pricingPreference", as: String.self, is: .in("one_time", "subscription", "free"), required: false)
        validations.add("pricePoint", as: String.self, is: .in("1", "2", "5", "10", "1_month", "2_month", "5_month", "10_month"), required: false)
    }
}

struct InterestVoter: Content {
    let username: String
    let wants: Bool
    let platform: String?
    let pricingPreference: String?
    let pricePoint: String?
    let at: Date?
}

struct InterestStats: Content {
    let yes: Int
    let no: Int
    let total: Int
    /// Votantes identificados (los anónimos solo suman en los recuentos).
    let voters: [InterestVoter]
}

struct PricingModelStats: Content {
    let count: Int
    let priceBreakdown: [String: Int]
}

struct PlatformStats: Content {
    let total: Int
    let wantsApp: Int
    let noApp: Int
    let subscription: PricingModelStats
    let oneTime: PricingModelStats
    /// Wanted the app but answered "free / wouldn't pay".
    let wouldNotPay: Int
}

struct InterestDashboard: Content {
    let total: Int
    let byPlatform: [String: PlatformStats]
}
