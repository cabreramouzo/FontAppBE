import Foundation

/// Los motivos por los que una aportación se anula, en un solo sitio.
///
/// Existían como cadenas sueltas repartidas por tres ficheros, y `Capabilities` decidía
/// si una anulación era mala conducta **por exclusión**: «todo lo que no mencione el
/// techo diario». Esa forma es la que falla sola — cada motivo nuevo nace clasificado
/// como mala conducta sin que nadie lo decida.
///
/// Y ya había fallado: borrar tu propia reseña anula su evento con
/// `disappeared`, así que ordenar lo tuyo te cerraba **todas** las capacidades por nivel
/// durante 90 días. Medido en producción: le pasaba a una cuenta con 3.949 gotas.
///
/// Con la lista en positivo, añadir un motivo obliga a decir a qué lado cae.
enum VoidReason {
    /// La reseña, edición o incidencia ya no está: la borró su autor o se revirtió.
    /// **No es mala conducta**: recoger lo tuyo no es portarse mal.
    static let disappeared = "la aportación ya no existe (borrada o revertida)"

    /// Denunciada por otras personas mientras esperaba las 72 h de liquidación.
    static let flagged = "contenido denunciado durante la ventana de liquidación"

    /// Ocultada por moderación con un motivo detrás; el motivo va a continuación.
    static let moderationPrefix = "moderación confirmada: "

    /// Lo que pasaba del techo de gotas de su día. **No es mala conducta**: es haber
    /// aportado mucho.
    static func overCap(_ cap: Int) -> String {
        "por encima del techo de \(cap) gotas de ese día"
    }

    /// ¿Esta anulación cierra las capacidades por nivel durante 90 días?
    ///
    /// Solo lo que dice algo sobre **el comportamiento**: una denuncia de terceros y una
    /// decisión de moderación. Ni borrar lo propio ni pasarse del techo.
    static func isMisconduct(_ reason: String?) -> Bool {
        guard let r = reason else { return false }
        return r == flagged || r.hasPrefix(moderationPrefix)
    }
}
