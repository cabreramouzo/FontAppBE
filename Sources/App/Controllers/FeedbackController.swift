import Fluent
import Vapor

// Sugerencias / feedback libre de los usuarios (¿falta tu zona?, ideas…).
// Crear: público (auth OPCIONAL; con rate-limit anti-spam por IP).
// Listar: solo admins.
struct FeedbackController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let feedback = routes.grouped("feedback")
        // Anti-spam: 5 envíos / 10 min por IP. Auth opcional (liga el usuario si hay token).
        let throttle = RateLimitMiddleware(scope: "feedback", max: 5, window: 10 * 60)
        feedback.grouped(throttle, UserToken.authenticator()).post(use: create)
        // Estadística: exige token y rol admin.
        feedback.grouped(UserToken.authenticator(), User.guardMiddleware()).get(use: index)
    }

    /// POST /feedback — registra una sugerencia (mensaje libre + país/email opcionales).
    @Sendable func create(req: Request) async throws -> HTTPStatus {
        try FeedbackDTO.validate(content: req)
        let dto = try req.content.decode(FeedbackDTO.self)

        func trimmed(_ s: String?) -> String? {
            let t = s?.trimmingCharacters(in: .whitespacesAndNewlines)
            return (t?.isEmpty ?? true) ? nil : t
        }

        let feedback = Feedback(
            userID: req.auth.get(User.self)?.id,
            message: dto.message.trimmingCharacters(in: .whitespacesAndNewlines),
            country: trimmed(dto.country),
            email: trimmed(dto.email)?.lowercased()
        )
        try await feedback.save(on: req.db)
        return .noContent
    }

    /// GET /feedback — lista de sugerencias, más recientes primero (solo admins).
    @Sendable func index(req: Request) async throws -> [FeedbackResponse] {
        let user = try req.auth.require(User.self)
        guard user.isAdmin else { throw Abort(.forbidden, reason: "Solo para administradores") }

        let items = try await Feedback.query(on: req.db).sort(\.$createdAt, .descending).all()
        let names = try await User.usernames(for: items.compactMap { $0.$user.id }, on: req.db)
        return items.map { FeedbackResponse($0, username: $0.$user.id.flatMap { names[$0] }) }
    }
}

struct FeedbackDTO: Content {
    let message: String
    let country: String?
    let email: String?
}

extension FeedbackDTO: Validatable {
    static func validations(_ validations: inout Validations) {
        validations.add("message", as: String.self, is: .count(1...2000))
        validations.add("country", as: String.self, is: .count(...100), required: false)
        validations.add("email", as: String.self, is: .email, required: false)
    }
}

struct FeedbackResponse: Content {
    let id: UUID?
    let username: String?
    let message: String
    let country: String?
    let email: String?
    let createdAt: Date?

    init(_ f: Feedback, username: String?) {
        self.id = f.id
        self.username = username
        self.message = f.message
        self.country = f.country
        self.email = f.email
        self.createdAt = f.createdAt
    }
}
