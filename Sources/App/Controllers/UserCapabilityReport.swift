import Fluent
import Foundation
import Vapor

/// La foto completa de lo que una persona puede y no puede hacer, para un administrador.
///
/// Nace de un caso de soporte: alguien escribió diciendo que la app le pedía un nivel que
/// ya tenía, y **desde el panel no había forma de comprobarlo**. Los dos requisitos que de
/// verdad le bloqueaban —`requiredActiveDays` y una anulación contada como mala conducta—
/// solo se podían ver entrando a la base de datos por SSH. Contestar a un usuario exigía
/// abrir `psql`, así que en la práctica no se contestaba con datos.
///
/// **No lleva ni un dato personal**: ni correo, ni ubicación de registro, ni IP. Habla de
/// lo que alguien puede hacer sobre el mapa, no de quién es. Por eso es de `admin` y no de
/// `owner`, al revés que `/users/admin`, que sí expone PII y por eso está más cerrado.
struct UserCapabilityReport: Content {
    let username: String
    let role: String

    /// Nivel alcanzado con las gotas **liquidadas**, que es lo que miran las capacidades.
    let level: String
    let gotes: Int
    /// Lo que todavía está en las 72 h. Se enseña porque explica la queja más común:
    /// «he aportado y no me ha subido nada».
    let pendingGotes: Int

    let activeDays: Int
    let requiredActiveDays: Int

    /// `disabled` · `provisional` · `optedOut` · `restricted` · `activeDays` ·
    /// `recentlyVoided` · `gotes`. Vacío si no hay nada bloqueado.
    let blockedBy: [String]
    let granted: [String]
    let missing: [Missing]

    let gamificationOptOut: Bool
    let postingRestrictedUntil: Date?

    /// Las anulaciones de los últimos 90 días, agrupadas y **diciendo cuáles cuentan**.
    ///
    /// Es la mitad que costó el caso: la respuesta a «¿por qué está bloqueado?» era una
    /// anulación por haber borrado su propia reseña, y sin verla no había forma de saberlo.
    let recentVoids: [VoidGroup]

    /// El estado del sistema, no de la persona. Sin esto, «no puede nada» se lee como un
    /// castigo cuando puede ser que las capacidades estén apagadas para todo el mundo.
    let capabilitiesEnabled: Bool
    let definitivePoints: Bool

    struct Missing: Content {
        let key: String
        let level: String
        let gotes: Int
        /// Cuántas le faltan para ese peldaño. `0` cuando ya tiene las gotas y lo que
        /// falla es otro requisito — que es justo el caso que nadie sabía leer.
        let missingGotes: Int
    }

    struct VoidGroup: Content {
        let reason: String
        let count: Int
        let misconduct: Bool
        let lastAt: Date?
    }

    static func of(_ user: User, on db: any Database, now: Date = Date()) async throws -> UserCapabilityReport {
        let grant = try await Capabilities.of(user, on: db, now: now)
        let userID = try user.requireID()
        let eventos = try await ContributionEvent.query(on: db).filter(\.$user.$id == userID).all()

        let liquidados = eventos.filter { $0.status == .settled }
        let gotes = liquidados.reduce(0) { $0 + $1.gotes }
        let pendientes = eventos.filter { $0.status == .pending }.reduce(0) { $0 + $1.gotes }

        let corte = now.addingTimeInterval(-Capabilities.cleanWindowDays * 86_400)
        var grupos: [String: (n: Int, last: Date?)] = [:]
        for e in eventos where e.status == .void && e.occurredAt >= corte {
            let clave = e.voidReason ?? "—"
            let previo = grupos[clave]
            grupos[clave] = (n: (previo?.n ?? 0) + 1,
                             last: max(previo?.last ?? .distantPast, e.occurredAt))
        }

        // Los días se cuentan aquí y no se leen de `grant`: `Capabilities.of` sale por la
        // puerta de atrás para un admin, para quien está restringido y con el sistema
        // apagado, y en esos casos devuelve 0. Un informe que dice «0 días» sobre alguien
        // que lleva veinte es peor que no decir nada — es justo el error que este panel
        // existe para no volver a cometer.
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let dias = Set(liquidados.map { cal.startOfDay(for: $0.occurredAt) }).count

        let concedidas = Set(grant.capabilities.map(\.rawValue))
        let faltan = Capabilities.Capability.allCases
            .filter { !concedidas.contains($0.rawValue) }
            .map { Missing(key: $0.rawValue, level: $0.level, gotes: $0.gotes,
                           missingGotes: max(0, $0.gotes - gotes)) }

        return UserCapabilityReport(
            username: user.username,
            role: user.role.rawValue,
            level: ContributionScore.level(for: gotes).key,
            gotes: gotes,
            pendingGotes: pendientes,
            activeDays: dias,
            requiredActiveDays: grant.requiredActiveDays,
            blockedBy: grant.blockedBy,
            granted: grant.capabilities.map(\.rawValue),
            missing: faltan,
            gamificationOptOut: user.gamificationOptOut,
            postingRestrictedUntil: user.postingRestrictedUntil,
            recentVoids: grupos
                .map { VoidGroup(reason: $0.key, count: $0.value.n,
                                 misconduct: VoidReason.isMisconduct($0.key), lastAt: $0.value.last) }
                .sorted { $0.count > $1.count },
            capabilitiesEnabled: Capabilities.enabled,
            definitivePoints: ContributionLedger.epoch.map { now >= $0 } ?? false
        )
    }
}
