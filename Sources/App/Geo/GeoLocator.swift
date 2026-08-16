import Vapor

/// Ubicación aproximada deducida de una IP (país/región/ciudad). Solo para
/// estadística regional; nunca se guarda la IP en claro.
struct GeoLocation: Sendable {
    let country: String?
    let region: String?
    let city: String?
}

/// Resuelve una IP a una ubicación aproximada. Desacopla el "cómo" (nada en dev,
/// un servicio HTTP en prod), igual que `MailSender` / `ImageStorage`.
protocol GeoLocator: Sendable {
    func locate(ip: String?, on client: any Client) async -> GeoLocation?
}

/// Dev / sin proveedor: no resuelve nada (en local no hay IP pública real).
struct NoopGeoLocator: GeoLocator {
    func locate(ip: String?, on client: any Client) async -> GeoLocation? { nil }
}

/// Producción: resuelve por ip-api.com (gratis, sin API key, uso no comercial).
/// Best-effort: cualquier fallo devuelve `nil` y nunca bloquea el registro.
struct IPAPIGeoLocator: GeoLocator {
    func locate(ip: String?, on client: any Client) async -> GeoLocation? {
        guard let ip, !ip.isEmpty else { return nil }
        struct Resp: Content { let status: String?; let country: String?; let regionName: String?; let city: String? }
        do {
            let uri = URI(string: "http://ip-api.com/json/\(ip)?fields=status,country,regionName,city")
            let res = try await client.get(uri)
            let body = try res.content.decode(Resp.self)
            guard body.status == "success" else { return nil }
            return GeoLocation(country: body.country, region: body.regionName, city: body.city)
        } catch {
            return nil
        }
    }
}

private struct GeoLocatorKey: StorageKey {
    typealias Value = any GeoLocator
}

extension Application {
    var geoLocator: any GeoLocator {
        get { storage[GeoLocatorKey.self] ?? NoopGeoLocator() }
        set { storage[GeoLocatorKey.self] = newValue }
    }
}

extension Request {
    var geoLocator: any GeoLocator { application.geoLocator }

    /// IP del cliente real, teniendo en cuenta los proxies (Fly, y Cloudflare si está
    /// delante). No se persiste; solo se usa para deducir la región y descartarla.
    /// La lógica es la misma que usa el rate-limit: ver `ClientIP`.
    var clientIP: String? { ClientIP.of(self) }
}
