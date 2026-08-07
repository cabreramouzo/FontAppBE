import Fluent
import Vapor

/// Fija el rol de un usuario desde la CLI. Sirve para **nombrar al propietario**
/// (`owner`) — que por seguridad no se puede asignar desde la web — y para crear
/// el primer staff sin tocar SQL a mano.
///
/// Uso: `swift run App set-role <username> <user|moderator|admin|owner>`
struct SetRoleCommand: AsyncCommand {
    struct Signature: CommandSignature {
        @Argument(name: "username", help: "Nombre de usuario")
        var username: String
        @Argument(name: "role", help: "Rol: user | moderator | admin | owner")
        var role: String
    }

    var help: String { "Fija el rol de un usuario (incluye owner, que no se puede asignar desde la web)" }

    func run(using context: CommandContext, signature: Signature) async throws {
        guard let role = UserRole(rawValue: signature.role.lowercased()) else {
            context.console.error("Rol no válido: \(signature.role). Usa user | moderator | admin | owner.")
            return
        }
        let db = context.application.db
        guard let user = try await User.query(on: db).filter(\.$username == signature.username).first() else {
            context.console.error("No existe el usuario '\(signature.username)'.")
            return
        }
        let previous = user.role
        user.role = role
        try await user.save(on: db)
        context.console.info("Rol de '\(signature.username)': \(previous.rawValue) → \(role.rawValue).")
    }
}
