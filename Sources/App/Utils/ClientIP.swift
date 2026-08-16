import Vapor

/// De dónde sale la IP real del cliente, que deja de ser evidente en cuanto hay proxies
/// encadenados.
///
/// Hoy la cadena es `navegador → proxy de Fly → app`, y el proxy de Fly pone
/// `Fly-Client-IP`, que el cliente no puede sobrescribir. Si se pone **Cloudflare
/// delante**, la cadena pasa a `navegador → Cloudflare → proxy de Fly → app` y
/// `Fly-Client-IP` deja de ser el usuario: es el edge de Cloudflare. Con eso, todos los
/// usuarios compartirían el contador del rate-limit (un puñado de IPs para todo el
/// tráfico) y el geo-IP del registro situaría a todo el mundo en el centro de datos de
/// Cloudflare más cercano.
///
/// La IP buena la manda Cloudflare en `CF-Connecting-IP`, pero esa cabecera **solo vale
/// si la petición ha entrado de verdad por Cloudflare**: a `fontapp.fly.dev` se llega
/// directo y se puede falsificar, y quien lo hiciera se saltaría el límite rotando IPs
/// inventadas. El testigo es `EDGE_SECRET`, un valor que Cloudflare inyecta con una
/// Transform Rule y que nunca viaja al navegador.
///
/// Sin `EDGE_SECRET` configurado no cambia nada: se sigue usando `Fly-Client-IP`. Así
/// esto se puede desplegar antes de tocar el DNS, que es el orden seguro.
enum ClientIP {
    /// IP del cliente, o `nil` si no hay forma de saberla.
    static func of(_ req: Request) -> String? {
        if let real = viaCloudflare(req) { return real }
        if let fly = req.headers.first(name: "Fly-Client-IP")?.trimmingCharacters(in: .whitespaces),
           !fly.isEmpty {
            return fly
        }
        // Fuera de Fly (dev): la IP del socket TCP, que tampoco es falsificable.
        // Deliberadamente NO se mira `X-Forwarded-For`: la pone el cliente, el proxy
        // añade la buena *al final*, y quedarse con la primera es quedarse con la que
        // controla el atacante.
        return req.remoteAddress?.ipAddress
    }

    private static func viaCloudflare(_ req: Request) -> String? {
        guard let secret = Environment.get("EDGE_SECRET"), !secret.isEmpty,
              let enviado = req.headers.first(name: "X-Edge-Secret"),
              iguales(enviado, secret),
              let real = req.headers.first(name: "CF-Connecting-IP")?.trimmingCharacters(in: .whitespaces),
              !real.isEmpty
        else { return nil }
        return real
    }

    /// Comparación en tiempo constante: `==` se corta en el primer byte distinto y eso
    /// filtra el secreto a quien mida los tiempos.
    private static func iguales(_ a: String, _ b: String) -> Bool {
        let x = Array(a.utf8), y = Array(b.utf8)
        guard x.count == y.count else { return false }
        var diff: UInt8 = 0
        for i in 0..<x.count { diff |= x[i] ^ y[i] }
        return diff == 0
    }
}
