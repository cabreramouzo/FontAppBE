import Vapor

/// Limitador de tasa en memoria (por instancia). Suficiente para una sola máquina;
/// a escala multi-instancia habría que respaldarlo en Redis. Cuenta intentos por
/// clave (p. ej. IP) dentro de una ventana deslizante.
actor RateLimiter {
    private var hits: [String: [Date]] = [:]

    struct Decision: Sendable {
        let allowed: Bool
        let retryAfter: Int?
    }

    /// Registra un intento permitido. Los rechazados NO entran en la ventana: insistir
    /// no debe aplazar indefinidamente el momento en que se recupera la cuota.
    func allow(key: String, max: Int, window: TimeInterval, now: Date = Date()) -> Decision {
        let cutoff = now.addingTimeInterval(-window)
        var recent = (hits[key] ?? []).filter { $0 > cutoff }
        guard recent.count < max else {
            hits[key] = recent
            let retry = Swift.max(1, Int(ceil((recent[0].addingTimeInterval(window).timeIntervalSince(now)))))
            return Decision(allowed: false, retryAfter: retry)
        }
        recent.append(now)
        hits[key] = recent
        // Poda oportunista para no crecer sin límite.
        if hits.count > 10_000 { hits = hits.filter { !$0.value.isEmpty } }
        return Decision(allowed: true, retryAfter: nil)
    }
}

private struct RateLimiterKey: StorageKey {
    typealias Value = RateLimiter
}

extension Application {
    var rateLimiter: RateLimiter {
        get {
            if let existing = storage[RateLimiterKey.self] { return existing }
            let limiter = RateLimiter()
            storage[RateLimiterKey.self] = limiter
            return limiter
        }
        set { storage[RateLimiterKey.self] = newValue }
    }
}

/// Middleware que corta las peticiones que superan `max` intentos por IP en `window`.
/// Se aplica antes de la autenticación (p. ej. en /auth/login) para frenar fuerza bruta.
struct RateLimitMiddleware: AsyncMiddleware {
    enum Identity: Sendable { case ip, authenticatedUser }

    /// Etiqueta del contador. IMPRESCINDIBLE que sea distinta por endpoint: si dos
    /// límites comparten clave, comparten cuenta, y el más generoso se queda sin
    /// margen porque otro endpoint ya gastó los intentos (registrarte te dejaría sin
    /// cupo para añadir fuentes).
    let scope: String
    let max: Int
    let window: TimeInterval
    var identity: Identity = .ip
    var errorCode: String? = nil

    func respond(to request: Request, chainingTo next: any AsyncResponder) async throws -> Response {
        let subject: String
        switch identity {
        case .ip:
            subject = Self.clientIP(request)
        case .authenticatedUser:
            subject = request.auth.get(User.self)?.id?.uuidString ?? Self.clientIP(request)
        }
        let decision = await request.application.rateLimiter.allow(key: "\(scope):\(subject)", max: max, window: window)
        guard decision.allowed else {
            throw RateLimitExceeded(retryAfter: decision.retryAfter ?? Int(window), code: errorCode)
        }
        return try await next.respond(to: request)
    }

    /// IP real del cliente. El porqué de cada fuente y por qué no vale `X-Forwarded-For`
    /// está en `ClientIP`, que es donde vive la decisión (la comparte el geo-IP del
    /// registro: si las dos no miran lo mismo, una de las dos se equivoca).
    static func clientIP(_ req: Request) -> String {
        ClientIP.of(req) ?? "unknown"
    }
}

/// Conserva el tiempo real restante hasta que `CodedErrorMiddleware` construye la
/// respuesta. El cliente usa tanto el código traducible como `Retry-After`.
struct RateLimitExceeded: Error, AbortError, Sendable {
    let status: HTTPResponseStatus = .tooManyRequests
    let reason: String
    let retryAfter: Int
    let code: String?

    init(retryAfter: Int, code: String? = nil) {
        self.retryAfter = retryAfter
        self.code = code
        let minutes = max(1, Int(ceil(Double(retryAfter) / 60)))
        self.reason = "Has alcanzado el límite. Podrás volver a intentarlo dentro de \(minutes) min."
    }
}
