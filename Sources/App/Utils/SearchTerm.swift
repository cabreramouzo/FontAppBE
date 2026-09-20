import Fluent
import Foundation
import Vapor

/// Prepara un término escrito por el usuario para usarlo en un `ILIKE`.
///
/// Dos motivos, y los dos duelen:
///
/// 1. **Coste.** `ILIKE '%…%'` no usa índice: compara el patrón contra cada fila. El
///    tiempo crece con la longitud del patrón, así que una cadena larga pegada en el
///    buscador convierte una petición HTTP en segundos de CPU de la base de datos.
///    Medido sobre 53.000 fuentes: 0,09 s con un término normal, 2 s con 5.000
///    caracteres y 20 s con 50.000. Diez peticiones así dejan la web para el arrastre.
///
/// 2. **Corrección.** `%` y `_` son comodines de LIKE. Sin escapar, buscar `%` te
///    devuelve la tabla entera (otro escaneo completo gratis para quien pase por ahí)
///    y buscar "50%" nunca encuentra lo que el usuario quería.
enum SearchTerm {
    /// Ningún topónimo real se acerca; de sobra para "font de la mare de déu del…".
    static let maxLength = 80

    /// Cuántas palabras se cruzan como mucho. Un topónimo real no pasa de esto, y acota el
    /// coste: cada palabra es un `ILIKE` aparte, y quien pega muchas no está buscando.
    static let maxWords = 6

    /// Devuelve el patrón listo para `ILIKE`, o `nil` si no hay nada que buscar.
    static func likePattern(_ raw: String) -> String? {
        let limpio = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !limpio.isEmpty else { return nil }
        // Se recorta en silencio en vez de devolver un error: quien pega algo largo
        // de más no está atacando, normalmente se ha equivocado de portapapeles.
        return "%\(escapa(String(limpio.prefix(maxLength))))%"
    }

    /// Un patrón `ILIKE` **por palabra**, para exigir que TODAS aparezcan (en cualquier
    /// orden), no la frase entera pegada.
    ///
    /// Es el arreglo de «si no pones la palabra exacta no encuentra». Un solo `%font vall%`
    /// no casa «Font de la Vall» —hay artículos por medio—; partido en `%font%` AND
    /// `%vall%` sí, y además da igual el orden. `nil` si no queda ninguna palabra.
    ///
    /// El coste sigue acotado: el término se recorta a `maxLength` **antes** de partir, y
    /// se toman como mucho `maxWords`, así que ni el patrón total ni el número de `ILIKE`
    /// se disparan por pegar una parrafada.
    static func likePatterns(_ raw: String) -> [String]? {
        let limpio = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !limpio.isEmpty else { return nil }
        let palabras = String(limpio.prefix(maxLength))
            .split(whereSeparator: { $0.isWhitespace })
            .prefix(maxWords)
            .map { "%\(escapa(String($0)))%" }
        return palabras.isEmpty ? nil : Array(palabras)
    }

    /// Literal phrase for relevance ranking, with the same bounds as word matching.
    static func rankingPhrase(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let words = String(trimmed.prefix(maxLength))
            .split(whereSeparator: { $0.isWhitespace }).prefix(maxWords)
        guard !words.isEmpty else { return nil }
        return escapa(words.joined(separator: " "))
    }

    /// Escapa los comodines de `LIKE`. La barra invertida primero, o se escaparían las que
    /// añadimos después. Sin esto, buscar `%` devolvía la tabla entera.
    private static func escapa(_ s: String) -> String {
        s.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "%", with: "\\%")
            .replacingOccurrences(of: "_", with: "\\_")
    }
}

/// Página pedida por el cliente, con topes.
///
/// `paginate(for:)` se cree lo que venga en `?per=`: con `per=100000` una petición
/// anónima devuelve 14 MB y ocupa 8 s de servidor. Ese ancho de banda se paga.
enum SafePage {
    static let maxPer = 100

    static func from(_ req: Request) throws -> PageRequest {
        let pedida = try req.query.decode(PageRequest.self)
        return PageRequest(page: max(1, pedida.page), per: min(max(1, pedida.per), maxPer))
    }
}
