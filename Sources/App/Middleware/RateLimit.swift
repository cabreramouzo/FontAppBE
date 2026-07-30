import Vapor

/// Limitador de tasa en memoria (por instancia). Suficiente para una sola máquina;
/// a escala multi-instancia habría que respaldarlo en Redis. Cuenta intentos por
/// clave (p. ej. IP) dentro de una ventana deslizante.
actor RateLimiter {
    private var hits: [String: [Date]] = [:]

    /// Registra un intento y devuelve si sigue dentro del límite.
    func allow(key: String, max: Int, window: TimeInterval) -> Bool {
        let now = Date()
        let cutoff = now.addingTimeInterval(-window)
        var recent = (hits[key] ?? []).filter { $0 > cutoff }
        recent.append(now)
        hits[key] = recent
        // Poda oportunista para no crecer sin límite.
        if hits.count > 10_000 { hits = hits.filter { !$0.value.isEmpty } }
        return recent.count <= max
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
    let max: Int
    let window: TimeInterval

    func respond(to request: Request, chainingTo next: any AsyncResponder) async throws -> Response {
        let key = Self.clientIP(request)
        let allowed = await request.application.rateLimiter.allow(key: key, max: max, window: window)
        guard allowed else {
            throw Abort(.tooManyRequests, reason: "Demasiados intentos. Prueba de nuevo en unos minutos.")
        }
        return try await next.respond(to: request)
    }

    /// IP del cliente teniendo en cuenta el proxy (Fly/Cloudflare ponen X-Forwarded-For).
    static func clientIP(_ req: Request) -> String {
        if let fwd = req.headers.first(name: "X-Forwarded-For")?.split(separator: ",").first {
            return fwd.trimmingCharacters(in: .whitespaces)
        }
        return req.remoteAddress?.ipAddress ?? "unknown"
    }
}
