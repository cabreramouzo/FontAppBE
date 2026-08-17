import Foundation

/// Reconoce las `@menciones` dentro de un texto escrito por alguien.
///
/// Está aquí y no dentro de un controlador porque la usan dos —incidencias y reseñas— y
/// porque tiene que decir **exactamente lo mismo que el cliente**: allí una mención se
/// pinta como enlace (`ConMenciones` en `AuthorLine.tsx`) y aquí decide a quién se le
/// manda un correo. Si las dos reglas se separan, se subraya a gente a la que no se
/// avisa, o peor, se avisa a gente que en pantalla no aparece mencionada.
enum Mentions {
    /// A cuántas personas puede avisar un solo mensaje.
    ///
    /// El tope no es por coste sino por abuso: sin él, un mensaje con cincuenta nombres
    /// es un envío masivo gratis desde una cuenta recién creada. Tres cubre de sobra el
    /// uso real —contestar a alguien, o a dos— y convierte el spam en trabajo manual.
    static let maxPerMessage = 3

    /// Nombres mencionados, sin la `@`, en orden y sin repetir.
    ///
    /// El `(?<![\w@.])` es la parte que importa: sin él, `hola@fontapp.net` menciona a un
    /// usuario «fontapp» que no existe, y peor, `escriu@nuria.cat` avisaría a Nuria por
    /// una dirección de correo.
    static func names(in text: String) -> [String] {
        let patron = try? NSRegularExpression(pattern: "(?<![\\w@.])@([a-zA-Z0-9_.-]{3,30})")
        guard let patron else { return [] }
        let rango = NSRange(text.startIndex..<text.endIndex, in: text)
        var vistos = Set<String>()
        var out: [String] = []
        for m in patron.matches(in: text, range: rango) {
            guard let r = Range(m.range(at: 1), in: text) else { continue }
            let nombre = String(text[r])
            // Sin distinguir mayúsculas para no avisar dos veces a la misma persona por
            // escribirla de dos formas; el nombre real lo pone después la base de datos.
            let clave = nombre.lowercased()
            if vistos.insert(clave).inserted { out.append(nombre) }
            if out.count >= maxPerMessage { break }
        }
        return out
    }
}
