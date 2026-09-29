import Fluent
import SQLKit
import Vapor

/// Where new accounts come from, to measure posters without a code on each one.
///
/// Posters are printed in batches and handed out on the go, so a per-town `?p=` code is
/// not workable, and the signup IP resolves to Madrid or Turkey half the time (VPNs,
/// mobile carriers). What does work: the first position the phone gives **with a
/// permission the person already granted** for the map — typically during the welcome
/// tutorial. No new permission is ever asked for this.
///
/// Privacy, which is the point of the design:
/// - **coordinates never leave this function**: they are turned into a municipality
///   (IGN boundaries) or, outside Spain, the region/country of the nearest classified
///   fountain, and discarded;
/// - only during the first `window` of the account, and only once (first answer wins);
/// - it is temporary: `clear-signup-places` wipes the four columns when it is no
///   longer needed, and the legal page says so.
enum SignupPlace {
    static let window: TimeInterval = 14 * 86_400

    struct DTO: Content { let latitude: Double; let longitude: Double }

    struct Count: Content {
        let municipality: String?
        let region: String?
        let country: String?
        let count: Int
    }

    /// POST /users/me/signup-place. Always 204: whether it was stored is nobody's concern
    /// on the client, which sends it at most once per account anyway.
    @Sendable static func record(req: Request) async throws -> HTTPStatus {
        let user = try req.auth.require(User.self)
        let dto = try req.content.decode(DTO.self)
        guard (-90...90).contains(dto.latitude), (-180...180).contains(dto.longitude) else {
            throw Abort(.badRequest)
        }
        guard let joined = user.createdAt, Date().timeIntervalSince(joined) < window,
              user.signupMunicipality == nil, user.signupPlaceCountry == nil else { return .noContent }

        if let m = try await Municipalities.resolve(lat: dto.latitude, long: dto.longitude, on: req.db) {
            user.signupMunicipality = m.name
            user.signupINE = m.ine
            user.signupPlaceCountry = "Spain"
        } else if let sql = req.db as? SQLDatabase {
            // Outside Spain there are no municipal boundaries: the nearest classified
            // fountain within ~55 km gives region and country, as `inheritZone` does.
            struct Zone: Decodable { let region: String?; let country: String? }
            let zone = try await sql.raw("""
                SELECT region, country FROM fonts
                WHERE country IS NOT NULL
                  AND latitude BETWEEN \(bind: dto.latitude - 0.5) AND \(bind: dto.latitude + 0.5)
                  AND longitude BETWEEN \(bind: dto.longitude - 0.7) AND \(bind: dto.longitude + 0.7)
                ORDER BY (latitude - \(bind: dto.latitude))^2 + (longitude - \(bind: dto.longitude))^2
                LIMIT 1
                """).first(decoding: Zone.self)
            guard let zone else { return .noContent }
            user.signupPlaceRegion = zone.region
            user.signupPlaceCountry = zone.country
        }
        try await user.save(on: req.db)
        return .noContent
    }

    /// GET /users/stats/signup-places — accounts per signup town, admins only.
    @Sendable static func stats(req: Request) async throws -> [Count] {
        let user = try req.auth.require(User.self)
        guard user.isAdmin else { throw Abort(.forbidden, reason: "Solo para administradores") }
        guard let sql = req.db as? SQLDatabase else { throw Abort(.internalServerError) }
        return try await sql.raw("""
            SELECT signup_municipality AS municipality, signup_place_region AS region,
                   signup_place_country AS country, COUNT(*)::int AS count
            FROM users
            WHERE anonymized_at IS NULL AND signup_place_country IS NOT NULL
            GROUP BY 1, 2, 3
            ORDER BY count DESC, municipality ASC NULLS LAST
            """).all(decoding: Count.self)
    }
}

/// `swift run App clear-signup-places` — wipes the temporary signup places for everyone.
struct ClearSignupPlacesCommand: AsyncCommand {
    struct Signature: CommandSignature {}
    var help: String { "Borra el municipio de alta de todas las cuentas (dato temporal)." }

    func run(using context: CommandContext, signature: Signature) async throws {
        guard let sql = context.application.db as? SQLDatabase else { return }
        try await sql.raw("""
            UPDATE users SET signup_municipality = NULL, signup_ine = NULL,
                             signup_place_region = NULL, signup_place_country = NULL
            WHERE signup_place_country IS NOT NULL OR signup_municipality IS NOT NULL
            """).run()
        context.console.print("Municipios de alta borrados.")
    }
}
