import Fluent
import Vapor

/// Sugerencias al escribir una `@mención`.
///
/// ## Por qué es `/mentions` y no `/users/search`
///
/// `/users/:userID` resuelve **también por nombre de usuario**, así que `/users/search`
/// se comería a quien se llame «search» — y `search` es un nombre perfectamente válido
/// según `Mentions.isMentionable`. Una ruta aparte no puede chocar con ningún nombre, y
/// además dice para qué es.
///
/// ## Pide sesión, a propósito
///
/// Los nombres ya son públicos: firman cada reseña, salen en el ranking y en los
/// perfiles. Pero eso es verlos **sobre contenido**, y esto es otra cosa: un listado que
/// se puede recorrer letra a letra hasta sacar el censo entero. Mencionar solo lo puede
/// hacer quien escribe una reseña, o sea quien tiene sesión, así que pedirla no le quita
/// nada a nadie y deja el directorio fuera del alcance de un script anónimo.
struct MentionController: RouteCollection {
    /// Con menos letras, la lista es el censo. Dos es lo que se pidió y lo que basta para
    /// que sugerir tenga sentido.
    static let minQuery = 2
    /// Lo que cabe en una lista sin obligar a leerla: si tu persona no está, escribe otra
    /// letra.
    static let limit = 8

    func boot(routes: any RoutesBuilder) throws {
        routes.grouped(UserToken.authenticator(), User.guardMiddleware())
            .grouped(RateLimitMiddleware(scope: "mentions", max: 300, window: 60 * 60))
            .get("mentions", use: search)
    }

    struct Suggestion: Content, Sendable {
        let username: String
    }

    /// GET /mentions?q= — nombres que empiezan por `q`.
    ///
    /// **Solo el nombre.** No sale el identificador, ni el correo, ni el rol, ni cuántas
    /// gotas tiene: para escribir `@alguien` no hace falta nada más, y todo lo demás
    /// sería exponer de una tacada lo que hoy hay que ir a buscar perfil a perfil.
    @Sendable func search(req: Request) async throws -> [Suggestion] {
        let yo = try req.auth.require(User.self)
        let q = (req.query[String.self, at: "q"] ?? "").trimmingCharacters(in: .whitespaces)
        guard q.count >= Self.minQuery else { return [] }
        // Lo que no puede escribirse en una mención tampoco puede buscarse: si la
        // consulta lleva un espacio o un acento, no hay ningún nombre que la satisfaga y
        // sí un `ILIKE` con comodines por delante que recorrer.
        guard q.range(of: "^[a-zA-Z0-9_.-]{2,30}$", options: .regularExpression) != nil else { return [] }

        let filas = try await User.query(on: req.db)
            // Por delante y no por dentro: escribir `@ma` busca a quien empieza por «ma»,
            // que es lo que significa un autocompletado. `contains` daría a Marta al
            // escribir «art» y convertiría la lista en una lotería.
            .filter(\.$username, .custom("ILIKE"), "\(q)%")
            // Las cuentas anonimizadas no se pueden mencionar; mostrarlas sería ofrecer
            // avisar a alguien que se ha ido.
            .filter(\.$anonymizedAt == nil)
            .sort(\.$username)
            .limit(Self.limit + 1)
            .all()

        return filas
            // Nunca a ti mismo: es lo que ya hace el aviso, y sugerirte tu propio nombre
            // sería ofrecer algo que después no pasa nada.
            .filter { $0.id != yo.id }
            // Y nunca un nombre que el parser no reconocería. Es la misma paridad de
            // siempre: sugerir `@josé maría` deja escrito algo que no enlaza ni avisa.
            .filter { Mentions.isMentionable($0.username) }
            .prefix(Self.limit)
            .map { Suggestion(username: $0.username) }
    }
}
