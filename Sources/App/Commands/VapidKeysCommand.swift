import Crypto
import Vapor

/// Genera un par de claves VAPID. Se ejecuta **una vez** en la vida del proyecto.
///
/// La pública viaja dentro de cada suscripción que crea un navegador, así que cambiarla
/// invalida todas las suscripciones existentes a la vez y **sin ningún error visible**: la
/// gente simplemente deja de recibir avisos. Por eso el comando solo imprime y no toca
/// nada: guardarlas es una decisión, no un efecto secundario.
struct VapidKeysCommand: AsyncCommand {
    struct Signature: CommandSignature {}
    let help = "Genera un par de claves VAPID para las notificaciones push."

    func run(using context: CommandContext, signature: Signature) async throws {
        let priv = P256.Signing.PrivateKey()
        context.console.print("VAPID_PUBLIC_KEY=\(priv.publicKey.x963Representation.base64URL)")
        context.console.print("VAPID_PRIVATE_KEY=\(priv.rawRepresentation.base64URL)")
        context.console.print("VAPID_SUBJECT=mailto:hola@fontapp.net")
        context.console.print("")
        context.console.warning("Guárdalas ya: la privada no se puede volver a ver.")
        context.console.warning("Cambiar la pública invalida TODAS las suscripciones existentes.")
    }
}
