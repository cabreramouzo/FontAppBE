import Fluent
import SQLKit
import Vapor

/// Analítica propia de interacciones, deliberadamente pequeña: evento cerrado + día +
/// sesión aleatoria de pestaña. La analítica general no guarda usuario, IP, URL,
/// user-agent ni parámetros. Solo los gestos de apoyo se guardan además, en una tabla
/// separada, cuando la petición ya pertenece a una cuenta autenticada.
struct InteractionAnalyticsController: RouteCollection {
    static let allowed: Set<String> = [
        "support_heart", "support_view", "support_share", "support_whatsapp",
        "support_feedback", "support_aixeta", "support_stripe_once", "support_btc_copy",
        "page_map", "page_fountain", "page_activity", "page_zones", "page_gamification",
        "page_profile", "page_support", "page_install", "page_login", "page_register",
        "nav_map", "nav_activity", "nav_zones", "nav_profile", "nav_login",
        "map_filters", "map_missions", "map_locate", "map_add_font", "map_add_font_button", "map_add_font_long_press",
        "map_add_font_signed_out", "map_long_press_signed_out", "map_export_gpx", "map_gpx",
        "map_offline",
        // El «aha» de la primera visita: la tarjeta que enseña tu fuente cercana según
        // lo que haya (gift/mission/explore). Contar cuál sale y qué se pulsa es lo único
        // que dirá si convierte a un anónimo en alguien que vuelve.
        "first_fountain_gift", "first_fountain_mission", "first_fountain_explore",
        "first_fountain_locate", "first_fountain_go", "first_fountain_save",
        "first_fountain_add", "first_fountain_dismiss",
        // Éxito y los fallos de la geolocalización del popup, separados para diagnosticar:
        // denegado, timeout (lento) y unavailable (el sistema no da posición — en un iPad
        // suele ser Localización apagada en Ajustes, que ningún reintento arregla).
        // `geo_failed` se mantiene un tiempo por los clientes que aún no se han actualizado.
        "first_fountain_located", "first_fountain_geo_denied",
        "first_fountain_geo_timeout", "first_fountain_geo_unavailable", "first_fountain_geo_failed",
        // La lista de cercanas. Es de lo poco del mapa que no mandaba nada, así que «no
        // la usa nadie» era una intuición y no un dato — y vive dentro de la hoja de
        // filtros, donde cuesta encontrarla. Sin esta línea el evento se descartaría en
        // silencio, que es justo lo que le pasó a `map_quick_review` durante semanas.
        "map_nearby",
        // Reseñar de un toque desde el globo del mapa, y la foto que se ofrece justo
        // después cuando la fuente no tiene ninguna. Los dos son la única forma de saber
        // si el atajo trae reseñas que antes no llegaban o solo las mueve de sitio.
        "map_quick_review", "map_quick_photo", "map_quick_confirm",
        "map_cluster_click", "map_heatmap_click",
        "font_favorite", "font_directions", "font_share", "font_update",
        "auth_google", "auth_passkey", "auth_password", "auth_register", "install_start",
        "font_create_start", "font_create_photo", "font_create_success", "font_create_queued", "font_create_error",
        "review_start", "review_photo", "review_success", "review_queued", "review_error",
        "search_run", "search_no_results", "search_font_select", "search_place_select",
        "outbox_queued", "outbox_synced", "outbox_failed", "install_available", "install_success",
        "auth_google_success", "auth_google_error", "auth_passkey_success", "auth_passkey_error",
        "auth_password_success", "auth_password_error",
        "platform_ios", "platform_android", "platform_mobile_other", "platform_desktop",
        "platform_mode_pwa", "platform_mode_browser",
    ]
    static let identifiedSupportEvents: Set<String> = ["support_heart", "support_aixeta"]

    func boot(routes: RoutesBuilder) throws {
        routes.grouped(UserToken.authenticator())
            .grouped(RateLimitMiddleware(scope: "interaction-analytics", max: 120, window: 5 * 60))
            .post("analytics", use: record)
        routes.grouped(RateLimitMiddleware(scope: "campaign-visit", max: 60, window: 5 * 60))
            .post("analytics", "visit", use: visit)
        routes.grouped("admin", "analytics")
            .grouped(UserToken.authenticator(), User.guardMiddleware())
            .get(use: summary)
        routes.grouped("admin", "analytics", "campaigns")
            .grouped(UserToken.authenticator(), User.guardMiddleware())
            .get(use: campaigns)
    }

    /// Formato de un código de campaña. Es la puerta que impide que esta tabla se llene
    /// de basura: la ruta es pública y el código viene de la URL, así que sin esto
    /// cualquiera puede inventarse filas nuevas a voluntad. No es una lista cerrada
    /// porque no puede serlo —cada cartel nuevo trae su código— pero sí acota la forma y
    /// el largo, igual que ya hace `users.signup_source` al recortar a 40.
    static let sourceFormat = "^[a-z0-9][a-z0-9_-]{0,39}$"

    /// POST /analytics/visit — «alguien llegó con este código y no se ha registrado».
    ///
    /// Pública y sin sesión **a propósito**: quien llega de un post de LinkedIn no tiene
    /// cuenta, y contar solo a quien la crea es exactamente lo que dejaba ciego el
    /// embudo. Guarda código, día y UUID de pestaña; nada más.
    @Sendable func visit(req: Request) async throws -> HTTPStatus {
        struct DTO: Content { let source: String; let session: String }
        let dto = try req.content.decode(DTO.self)
        let source = dto.source.lowercased()
        guard source.range(of: Self.sourceFormat, options: .regularExpression) != nil,
              let sessionID = UUID(uuidString: dto.session),
              let sql = req.db as? SQLDatabase else { throw Abort(.badRequest) }
        try await sql.raw("""
            INSERT INTO campaign_visits (id, source, day, session_id, hits)
            VALUES (\(bind: UUID()), \(bind: source), CURRENT_DATE, \(bind: sessionID), 1)
            ON CONFLICT (source, day, session_id)
            DO UPDATE SET hits = campaign_visits.hits + 1
            """).run()
        // Misma retención que el resto de la analítica de sesión. Aquí se BORRA en vez de
        // compactar: el total por código y día no aporta nada que no diga ya el total del
        // periodo, y una tabla menos que mantener es una tabla menos que se queda vieja.
        try await sql.raw("DELETE FROM campaign_visits WHERE day < CURRENT_DATE - 180").run()
        return .noContent
    }

    /// GET /admin/analytics/campaigns?days= — clics y altas del mismo código, juntos.
    ///
    /// **En la misma fila a propósito.** Los clics viven en `campaign_visits` y las altas
    /// en `users.signup_source`; separados hay que cruzarlos a mano y nadie lo hace, que
    /// es como se acaba mirando solo las altas y concluyendo que una campaña no funcionó
    /// cuando lo que falló fue el registro.
    @Sendable func campaigns(req: Request) async throws -> [CampaignSummary] {
        let user = try req.auth.require(User.self)
        guard user.isAdmin, let sql = req.db as? SQLDatabase else { throw Abort(.forbidden) }
        let requested = req.query[Int.self, at: "days"]
        guard requested == nil || requested == 30 || requested == 180 else { throw Abort(.badRequest) }
        // Sin `days` es todo el histórico; un `days` nulo en el bind se compara contra
        // `IS NULL` en el SQL para no repetir la consulta entera dos veces.
        let days = requested.map { $0 - 1 }
        return try await sql.raw("""
            WITH clics AS (
                SELECT source, COUNT(DISTINCT session_id)::int AS visits, SUM(hits)::int AS hits
                FROM campaign_visits
                WHERE \(bind: days)::int IS NULL OR day >= CURRENT_DATE - \(bind: days)::int
                GROUP BY source
            ), altas AS (
                SELECT signup_source AS source, COUNT(*)::int AS signups
                FROM users
                WHERE signup_source IS NOT NULL
                  AND (\(bind: days)::int IS NULL OR created_at >= CURRENT_DATE - \(bind: days)::int)
                GROUP BY signup_source
            )
            SELECT COALESCE(clics.source, altas.source) AS source,
                   COALESCE(clics.visits, 0) AS visits,
                   COALESCE(clics.hits, 0) AS hits,
                   COALESCE(altas.signups, 0) AS signups
            FROM clics FULL OUTER JOIN altas ON altas.source = clics.source
            ORDER BY visits DESC, signups DESC
            """).all(decoding: CampaignSummary.self)
    }

    @Sendable func record(req: Request) async throws -> HTTPStatus {
        let dto = try req.content.decode(InteractionDTO.self)
        guard Self.allowed.contains(dto.event), let sessionID = UUID(uuidString: dto.session),
              let sql = req.db as? SQLDatabase else { throw Abort(.badRequest) }
        try await sql.raw("""
            INSERT INTO interaction_analytics (id, event, day, session_id, hits)
            VALUES (\(bind: UUID()), \(bind: dto.event), CURRENT_DATE, \(bind: sessionID), 1)
            ON CONFLICT (event, day, session_id)
            DO UPDATE SET hits = interaction_analytics.hits + 1
            """).run()
        if Self.identifiedSupportEvents.contains(dto.event),
           let user = req.auth.get(User.self), let userID = try? user.requireID() {
            try await sql.raw("""
                INSERT INTO user_support_interactions
                    (id, user_id, event, first_clicked_at, last_clicked_at, hits)
                VALUES (
                    \(bind: UUID()), \(bind: userID), \(bind: dto.event),
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
                )
                ON CONFLICT (user_id, event) DO UPDATE SET
                    last_clicked_at = CURRENT_TIMESTAMP,
                    hits = user_support_interactions.hits + 1
                """).run()
        }
        // A los 180 días se conserva el total diario, pero desaparece el UUID de sesión.
        // DELETE ... RETURNING + INSERT es una sola sentencia atómica: nunca duplica
        // históricos aunque el proceso se corte entre compactar y borrar.
        try await sql.raw("""
            WITH moved AS (
                DELETE FROM interaction_analytics WHERE day < CURRENT_DATE - 180
                RETURNING event, day, hits
            ), totals AS (
                SELECT event, day, SUM(hits)::int AS clicks, COUNT(*)::int AS sessions
                FROM moved GROUP BY event, day
            )
            INSERT INTO interaction_analytics_daily (id, event, day, clicks, sessions)
            SELECT gen_random_uuid(), event, day, clicks, sessions FROM totals
            ON CONFLICT (event, day) DO UPDATE SET
                clicks = interaction_analytics_daily.clicks + EXCLUDED.clicks,
                sessions = interaction_analytics_daily.sessions + EXCLUDED.sessions
            """).run()
        // El detalle asociado a una persona no se conserva indefinidamente.
        try await sql.raw("DELETE FROM user_support_interactions WHERE last_clicked_at < CURRENT_TIMESTAMP - INTERVAL '180 days'").run()
        return .noContent
    }

    @Sendable func summary(req: Request) async throws -> [InteractionSummary] {
        let user = try req.auth.require(User.self)
        guard user.isAdmin, let sql = req.db as? SQLDatabase else { throw Abort(.forbidden) }
        let requested = req.query[Int.self, at: "days"]
        guard requested == nil || requested == 30 || requested == 180 else { throw Abort(.badRequest) }
        if let days = requested {
            return try await sql.raw("""
                SELECT event, SUM(clicks)::int AS clicks, SUM(sessions)::int AS sessions FROM (
                    SELECT event, SUM(hits)::int AS clicks, COUNT(*)::int AS sessions
                    FROM interaction_analytics WHERE day >= CURRENT_DATE - (\(bind: days - 1))::int GROUP BY event
                    UNION ALL
                    SELECT event, SUM(clicks)::int, SUM(sessions)::int
                    FROM interaction_analytics_daily WHERE day >= CURRENT_DATE - (\(bind: days - 1))::int GROUP BY event
                ) totals GROUP BY event ORDER BY clicks DESC
                """).all(decoding: InteractionSummary.self)
        }
        return try await sql.raw("""
            SELECT event, SUM(clicks)::int AS clicks, SUM(sessions)::int AS sessions FROM (
                SELECT event, SUM(hits)::int AS clicks, COUNT(*)::int AS sessions
                FROM interaction_analytics GROUP BY event
                UNION ALL
                SELECT event, SUM(clicks)::int, SUM(sessions)::int
                FROM interaction_analytics_daily GROUP BY event
            ) totals GROUP BY event ORDER BY clicks DESC
            """).all(decoding: InteractionSummary.self)
    }
}

struct InteractionDTO: Content { let event: String; let session: String }
struct InteractionSummary: Content { let event: String; let clicks: Int; let sessions: Int }

/// Un código de campaña con sus dos mitades: quién llegó y quién se quedó.
///
/// `visits` son **sesiones de pestaña distintas**, no personas: quien abra el enlace tres
/// días cuenta tres. Sirve para comparar campañas entre sí, nunca para contar gente.
struct CampaignSummary: Content { let source: String; let visits: Int; let hits: Int; let signups: Int }
