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
        /// Añadir fotos secundarias de la fuente. Nivel 3 (`brook`).
        ///
        /// Las de tipo `document` **no pasan por aquí**: un informe de salubridad lo
        /// aporta quien lo tiene, y quien lo tiene puede haberse registrado esta mañana.
        /// La puerta está para los duplicados del mismo ángulo, que es donde hay ruido.
        case addSecondaryPhoto
        /// Dar por resuelta la incidencia de otra persona. Nivel 3 (`brook`).
        ///
        /// Bajó de nivel 6 a 3 al revisar la escalera: cerrar un aviso que dice «está
        /// seca» cuando ya no lo está es la acción más inocua del sistema, es reversible
        /// y es justo lo que debería poder hacer quien acaba de pasar por delante. Pedir
        /// media escalera para eso era desproporcionado. Además, lo normal es que se
        /// cierre **sola** (ver `FontReportController.autoResolve`).
        case resolveIncident
        /// Ver quién ha cambiado qué en una fuente. Nivel 4 (`torrent`). **Solo lectura.**
        ///
        /// Es el contrapeso de `relocateAnyFont`: sin esto, mover el pin de una fuente
        /// ajena es una escritura que nadie salvo un admin puede ver, y mucho menos
        /// deshacer. El historial es de moderación por privacidad —«quién editó qué» no
        /// está a la vista de cualquiera— y esto es el término medio: lo ve quien ya ha
        /// demostrado que anda por el mapa.
        case viewFontHistory
        /// Corregir la ubicación de una fuente que no creaste. Nivel 5 (`stream`).
        case relocateAnyFont
        /// Marcar una fuente como duplicada de otra. Nivel 5 (`stream`). Reversible.
        ///
        /// Es la que más trabajo quita: hoy los duplicados los resuelve un admin a mano,
        /// borrando. El importador ya hace lo que puede —el `--dedupe 50` está medido—
        /// pero en la banda de 25 a 50 m un 20 % de los vecinos son fuentes distintas de
        /// verdad, así que el resto **solo lo puede decidir quien conoce el sitio**.
        /// No borra nada: la duplicada se esconde del mapa y apunta a la buena.
        case markDuplicate
        /// Retirar del mapa una fuente que ya no existe. Nivel 6 (`river`). Reversible.
        ///
        /// El estado `gone` de una reseña es «un testimonio, no una decisión», y hasta
        /// ahora ese testimonio no llevaba a ninguna parte: el punto seguía en el mapa
        /// mandando gente a caminar para nada, que es justo lo que esta app existe para
        /// evitar. Hacen falta además `retireGoneReports` testimonios independientes.
        case retireFont
        /// Marcar una edición como revisada, para sacarla de la cola. Nivel 7
        /// (`waterfall`). Puro triaje: **no cambia la fuente**, así que el riesgo es cero
        /// y lo único que hace es repartir trabajo que hoy solo puede hacer un admin.
        case reviewEdit

        /// A partir de qué nivel se abre.
        var level: String {
            switch self {
            case .addSecondaryPhoto: return "brook"
            case .resolveIncident: return "brook"
            case .viewFontHistory: return "torrent"
            case .relocateAnyFont: return "stream"
            case .markDuplicate: return "stream"
            case .retireFont: return "river"
            case .reviewEdit: return "waterfall"
            }
        }

        /// ¿Hace falta que los puntos sean **definitivos** (`GAMIFICATION_EPOCH` pasada)?
        ///
        /// La regla original la exigía para todo, y el motivo es bueno: mientras
        /// `--rescore` pueda reescribir el histórico, un permiso concedido por gotas puede
        /// desaparecer solo. Pero el peso del accidente no es el mismo en todas.
        ///
        /// Mover el pin de una fuente ajena es escritura destructiva sobre el trabajo de
        /// otro: perder esa capacidad a media corrección es un error intermitente y hay
        /// que evitarlo. Añadir una foto es aditivo y reversible; perderla una noche es
        /// una molestia. Exigir lo mismo a las dos dejaba la segunda inservible en la
        /// práctica, porque la época no está puesta y no lo va a estar pronto.
        var requiresDefinitivePoints: Bool {
            switch self {
            case .relocateAnyFont: return true
            case .addSecondaryPhoto: return false
            // Cerrar una incidencia no destruye nada y se puede reabrir: se comporta como
            // añadir una foto, no como borrarla.
            case .resolveIncident: return false
            // Leer no destruye nada, y marcar una edición como revisada tampoco toca el
            // contenido: perderlas una noche por un `--rescore` no rompe nada.
            case .viewFontHistory, .reviewEdit: return false
            // Estas dos sacan una fuente del mapa. Se deshacen —de eso se trata— pero
            // mientras están puestas nadie encuentra ese punto, así que se comportan como
            // mover un pin ajeno: hay que poder confiar en que el permiso no baila.
            case .markDuplicate, .retireFont: return true
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

    /// Testimonios `gone` independientes que hacen falta para retirar una fuente, además
    /// del nivel.
    ///
    /// Dos y no uno porque retirar es la única de estas acciones que hace **desaparecer**
    /// un punto para todo el mundo, y una persona equivocada —o con prisa— no debería
    /// poder hacerlo sola. Dos tampoco es una gran barrera, y ése es el punto: no se trata
    /// de que cueste, sino de que no sea la opinión de uno.
    static let retireGoneReports = 2

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

        /// Lo que **todavía** no tienes, con el nivel que lo abre.
        ///
        /// El marcador solo enseñaba lo ya concedido, así que para casi todo el mundo la
        /// escalera no llevaba visiblemente a ninguna parte: diez nombres de agua y
        /// ninguna consecuencia. Esto es la otra mitad de la información.
        struct Upcoming: Content, Sendable {
            let key: String
            let level: String
            let gotes: Int
        }
        let upcoming: [Upcoming]

        static func of(_ abiertas: [Capability], blockedBy: [String]) -> Grant {
            let pendientes = Capability.allCases
                .filter { !abiertas.contains($0) }
                .map { Upcoming(key: $0.rawValue, level: $0.level, gotes: $0.gotes) }
            return Grant(capabilities: abiertas, blockedBy: blockedBy, upcoming: pendientes)
        }
    }

    /// Qué puede hacer esta persona ahora mismo.
    ///
    /// Devuelve también el motivo del bloqueo: «te faltan 300 gotas» es un mensaje útil y
    /// «no puedes» no lo es.
    static func of(_ user: User, on db: any Database, now: Date = Date()) async throws -> Grant {
        // Un admin ya lo puede todo por su rol; el nivel no le añade ni le quita nada.
        if user.isAdmin { return Grant.of(Capability.allCases, blockedBy: []) }

        guard enabled else { return Grant.of([], blockedBy: ["disabled"]) }
        // Con puntos provisionales solo se cierran las que lo exigen; las demás siguen.
        let definitivos = ContributionLedger.epoch.map { now >= $0 } ?? false
        let candidatas = Capability.allCases.filter { definitivos || !$0.requiresDefinitivePoints }
        if candidatas.isEmpty { return Grant.of([], blockedBy: ["provisional"]) }
        // Quien ha apagado la gamificación no juega a esto tampoco. Lo contrario sería
        // darle poderes por un contador que ha pedido no tener.
        guard !user.gamificationOptOut else { return Grant.of([], blockedBy: ["optedOut"]) }

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

        // `provisional` NO se añade aquí aunque los puntos lo sean: cerraría también las
        // capacidades que no lo exigen, que es justo lo que acabamos de separar. Las que
        // sí lo exigen ya se han quedado fuera de `candidatas`.
        var bloqueos: [String] = []
        if dias < requiredActiveDays { bloqueos.append("activeDays") }
        if manchas { bloqueos.append("recentlyVoided") }

        // Un solo requisito que falle deja todo cerrado: son puertas, no una media.
        guard bloqueos.isEmpty else { return Grant.of([], blockedBy: bloqueos) }

        let abiertas = candidatas.filter { gotes >= $0.gotes }
        if abiertas.isEmpty { bloqueos.append("gotes") }
        return Grant.of(abiertas, blockedBy: bloqueos)
    }

    /// Atajo para los controladores: ¿tiene esta capacidad concreta?
    static func has(_ cap: Capability, _ user: User, on db: any Database) async throws -> Bool {
        try await of(user, on: db).capabilities.contains(cap)
    }
}
