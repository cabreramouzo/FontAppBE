import Vapor

private struct OpenMeteoCurrent: Decodable {
    let precipitation: Double?
    let weatherCode: Int?

    enum CodingKeys: String, CodingKey {
        case precipitation
        case weatherCode = "weather_code"
    }
}

private struct OpenMeteoResponse: Decodable {
    let current: OpenMeteoCurrent
}

struct RainResponse: Content {
    let raining: Bool
}

private actor WeatherCache {
    static let shared = WeatherCache()
    private var values: [String: (until: Date, raining: Bool)] = [:]

    func value(for key: String) -> Bool? {
        guard let item = values[key], item.until > Date() else { return nil }
        return item.raining
    }

    func put(_ raining: Bool, for key: String) {
        values[key] = (Date().addingTimeInterval(30 * 60), raining)
    }
}

/// Meteorología mínima para el guiño del logotipo. El navegador pregunta a FontApp, no
/// a un tercero; el servidor redondea a unos 11 km antes de consultar Open-Meteo y guarda
/// el resultado media hora. No se persiste ni se vincula a una cuenta.
struct WeatherController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        routes.get("weather", "rain", use: rain)
    }

    @Sendable func rain(req: Request) async throws -> RainResponse {
        guard
            let lat = req.query[Double.self, at: "lat"], (-90...90).contains(lat),
            let lng = req.query[Double.self, at: "lng"], (-180...180).contains(lng)
        else { throw Abort(.badRequest) }

        let roundedLat = (lat * 10).rounded() / 10
        let roundedLng = (lng * 10).rounded() / 10
        let key = "\(roundedLat),\(roundedLng)"
        if let cached = await WeatherCache.shared.value(for: key) {
            return RainResponse(raining: cached)
        }

        let uri = URI(string: "https://api.open-meteo.com/v1/forecast?latitude=\(roundedLat)&longitude=\(roundedLng)&current=precipitation,weather_code&forecast_days=1")
        let response = try await req.client.get(uri)
        guard response.status == .ok else { throw Abort(.serviceUnavailable) }
        let weather = try response.content.decode(OpenMeteoResponse.self)
        // Códigos WMO 51–67 y 80–82: llovizna, lluvia y chubascos. La nieve no pone
        // paraguas: merece su propio guiño si algún día se diseña.
        let code = weather.current.weatherCode ?? -1
        let raining = (weather.current.precipitation ?? 0) > 0 || (51...67).contains(code) || (80...82).contains(code)
        await WeatherCache.shared.put(raining, for: key)
        return RainResponse(raining: raining)
    }
}
