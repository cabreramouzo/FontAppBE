import Vapor

/// Rol de un usuario. **Jerárquico**: cada nivel incluye lo del inferior, y los
/// permisos se comprueban por umbral (`role.atLeast(.moderator)`), no por igualdad.
///
/// - `user`: por defecto. Crea fuentes, edita info (wiki) y gestiona su propio contenido.
/// - `moderator`: modera contenido ajeno (reseñas, incidencias, denuncias).
/// - `admin`: gestiona fuentes (borrar/reubicar/revertir) y ve estadísticas.
/// - `owner`: además asigna roles y ajustes globales. Uno solo (tú); se fija por CLI.
enum UserRole: String, Codable, Sendable, CaseIterable {
    case user
    case moderator
    case admin
    case owner

    /// Orden jerárquico (mayor = más permisos).
    var rank: Int {
        switch self {
        case .user: return 0
        case .moderator: return 1
        case .admin: return 2
        case .owner: return 3
        }
    }

    /// ¿Este rol alcanza (o supera) el nivel dado?
    func atLeast(_ other: UserRole) -> Bool { rank >= other.rank }
}
