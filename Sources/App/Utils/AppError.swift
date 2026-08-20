import Vapor

/// Un error con **código**, para que el cliente pueda traducirlo.
///
/// ## El problema
///
/// Todos los errores de esta API viajaban como una frase en castellano dentro de
/// `reason`, y el cliente la enseñaba tal cual. La app se lee en seis idiomas, así que a
/// un portugués intentando registrarse con un correo repetido le llegaba «El correo ya
/// está registrado». No es un detalle de cortesía: es un mensaje que hay que **entender
/// para poder arreglar** lo que has hecho mal.
///
/// ## Cómo se resuelve
///
/// El error lleva las dos cosas: el código (`user.emailTaken`), que es lo que el cliente
/// traduce, y la frase en castellano, que se queda **para quien llame a la API a pelo**
/// —`curl`, un script, un log— donde un código suelto no dice nada.
///
/// Es **aditivo**: `code` es opcional en la respuesta, así que los `Abort` corrientes que
/// no se hayan convertido siguen funcionando exactamente igual y el cliente cae en la
/// frase del servidor. Eso permite convertirlos poco a poco en vez de en una tacada, que
/// con 86 sitios es la diferencia entre hacerlo y no hacerlo.
struct AppError: Error, AbortError, Sendable {
    let status: HTTPResponseStatus
    /// Clave estable, en inglés y con punto: `user.emailTaken`. **Es contrato**: el
    /// cliente la usa para buscar la traducción, así que renombrarla rompe la interfaz
    /// de quien tenga una versión vieja cargada.
    let code: String
    let reason: String

    init(_ status: HTTPResponseStatus, _ code: String, _ reason: String) {
        self.status = status
        self.code = code
        self.reason = reason
    }
}

/// Igual que la de Vapor, pero añadiendo `code` cuando el error lo trae.
///
/// Sustituye a `ErrorMiddleware.default`. Lo que no es un `AppError` se sigue tratando
/// exactamente como antes: mismo `status`, mismo `reason`, y sin `code` — que es lo que
/// hace que esto se pueda desplegar sin convertirlo todo primero.
struct CodedErrorMiddleware: AsyncMiddleware {
    struct Body: Content {
        let error: Bool
        let reason: String
        let code: String?
    }

    func respond(to request: Request, chainingTo next: any AsyncResponder) async throws -> Response {
        do {
            return try await next.respond(to: request)
        } catch {
            let status: HTTPResponseStatus
            let reason: String
            let code: String?
            switch error {
            case let e as AppError:
                (status, reason, code) = (e.status, e.reason, e.code)
            case let e as any AbortError:
                (status, reason, code) = (e.status, e.reason, nil)
            default:
                // Un error no previsto no cuenta nada de dentro hacia fuera: se registra
                // entero y al cliente le llega lo mínimo. Es lo que ya hacía Vapor.
                (status, reason, code) = (.internalServerError, "Something went wrong.", nil)
            }
            request.logger.report(error: error)

            let res = Response(status: status, headers: ["content-type": "application/json; charset=utf-8"])
            do {
                res.body = try .init(data: JSONEncoder().encode(Body(error: true, reason: reason, code: code)),
                                     byteBufferAllocator: request.byteBufferAllocator)
            } catch {
                res.body = .init(string: "Oops: \(reason)", byteBufferAllocator: request.byteBufferAllocator)
                res.headers.replaceOrAdd(name: .contentType, value: "text/plain; charset=utf-8")
            }
            return res
        }
    }
}
