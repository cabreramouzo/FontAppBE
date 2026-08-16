import Fluent
import Foundation
import Vapor

/// Fase 6: los niveles abren capacidades reales de mantenimiento del mapa.
///
/// Es la última fase **a propósito**. Dar permisos automáticos antes de ver cómo se
/// comporta la gente es como se rompe un mapa abierto, así que todo aquí está construido
/// para no conceder nada por accidente: por defecto no se concede ninguna capacidad, y
/// hacen falta dos decisiones explícitas del administrador para que empiecen a existir.
///
/// ## Por qué dos interruptores y no uno
///
/// `GAMIFICATION_CAPABILITIES=true` enciende el sistema. Pero además hacen falta puntos
/// **definitivos** (`GAMIFICATION_EPOCH` puesta y pasada), y esto no es burocracia: mientras
/// los puntos son provisionales, `gamification-sync --rescore` puede reescribir el histórico
/// entero. Conceder permiso de escritura sobre puntos que mañana pueden bajar significa que
/// alguien tiene una capacidad hoy y la pierde por la noche sin haber hecho nada mal. Un
/// permiso que aparece y desaparece solo no es un permiso: es un error intermitente.
enum Capabilities {
    /// Qué puede hacer alguien por nivel, más allá de lo que puede hacer cualquiera.
    enum Capability: String, Content, Sendable, CaseIterable {
        /// Corregir la ubicación de una fuente que no creaste. Nivel 5 (`stream`).
        case relocateAnyFont

        /// A partir de qué nivel se abre.
        var level: String {
            switch self {
            case .relocateAnyFont: return "stream"
            }
        }

        /// Gotas necesarias, sacadas de la tabla de niveles para que no se puedan
        /// separar: si mañana se recalibra la escalera, esto la sigue.
        var gotes: Int {
            ContributionScore.levels.first { $0.key == level }?.from ?? Int.max
        }
    }

    /// Días distintos con aportación liquidada que hacen falta, además de las gotas.
    ///
    /// Es la mitad menos vistosa del requisito y la más importante. Sin esto, el camino a
    /// «mover el pin de cualquiera» es una tarde intensa; con esto hay que haber estado
    /// por aquí de verdad. Se cuentan **días** y no aportaciones justamente porque las
    /// aportaciones se pueden apilar en una sola sesión y los días no.
    static let requiredActiveDays = 8

    /// Ventana en la que una anulación por mala conducta bloquea las capacidades.
    static let cleanWindowDays = 90.0

    /// Anulaciones que cuentan como mala conducta. La del techo diario **no**: pasarse del
    /// tope es haber aportado mucho un día, no haber hecho nada malo, y castigarlo con la
    /// pérdida de permisos sería absurdo.
    static func isMisconduct(_ voidReason: String?) -> Bool {
        guard let r = voidReason else { return false }
        return !r.contains("techo")
    }

    /// ¿Está encendido el sistema? Apagado por defecto.
    static var enabled: Bool {
        Environment.get("GAMIFICATION_CAPABILITIES")?.lowercased() == "true"
    }

    struct Grant: Content, Sendable {
        let capabilities: [Capability]
        /// Por qué NO se ha concedido algo, para poder decirlo en la interfaz en vez de
        /// dejar un botón desactivado sin explicación.
        let blockedBy: [String]
    }

    /// Qué puede hacer esta persona ahora mismo.
    ///
    /// Devuelve también el motivo del bloqueo: «te faltan 300 gotas» es un mensaje útil y
    /// «no puedes» no lo es.
    static func of(_ user: User, on db: any Database, now: Date = Date()) async throws -> Grant {
        // Un admin ya lo puede todo por su rol; el nivel no le añade ni le quita nada.
        if user.isAdmin { return Grant(capabilities: Capability.allCases, blockedBy: []) }

        guard enabled else { return Grant(capabilities: [], blockedBy: ["disabled"]) }
        guard let epoch = ContributionLedger.epoch, now >= epoch else {
            return Grant(capabilities: [], blockedBy: ["provisional"])
        }
        // Quien ha apagado la gamificación no juega a esto tampoco. Lo contrario sería
        // darle poderes por un contador que ha pedido no tener.
        guard !user.gamificationOptOut else { return Grant(capabilities: [], blockedBy: ["optedOut"]) }

        let userID = try user.requireID()
        let eventos = try await ContributionEvent.query(on: db)
            .filter(\.$user.$id == userID)
            .all()

        let liquidados = eventos.filter { $0.status == .settled }
        let gotes = liquidados.reduce(0) { $0 + $1.gotes }

        // Días distintos (en UTC, igual que el ranking mensual).
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let dias = Set(liquidados.map { cal.startOfDay(for: $0.occurredAt) }).count

        let corte = now.addingTimeInterval(-cleanWindowDays * 86_400)
        let manchas = eventos.contains {
            $0.status == .void && isMisconduct($0.voidReason) && $0.occurredAt >= corte
        }

        var bloqueos: [String] = []
        if dias < requiredActiveDays { bloqueos.append("activeDays") }
        if manchas { bloqueos.append("recentlyVoided") }

        // Un solo requisito que falle deja todo cerrado: son puertas, no una media.
        guard bloqueos.isEmpty else { return Grant(capabilities: [], blockedBy: bloqueos) }

        let abiertas = Capability.allCases.filter { gotes >= $0.gotes }
        if abiertas.isEmpty { bloqueos.append("gotes") }
        return Grant(capabilities: abiertas, blockedBy: bloqueos)
    }

    /// Atajo para los controladores: ¿tiene esta capacidad concreta?
    static func has(_ cap: Capability, _ user: User, on db: any Database) async throws -> Bool {
        try await of(user, on: db).capabilities.contains(cap)
    }
}
