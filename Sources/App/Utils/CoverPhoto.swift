import Fluent
import Vapor

/// La foto de portada de una fuente, cuando llega desde una reseña.
///
/// Existe porque la gente **sí** hace fotos y **casi nunca** acaban en la ficha: medido,
/// había 144 fuentes con portada y otras 168 con la foto esperando dentro de una reseña
/// y la portada en blanco. La foto ya estaba hecha por alguien que estuvo delante; lo
/// único que faltaba era decir que servía.
///
/// Un solo sitio para las tres puertas que ascienden una foto —publicar una reseña, el
/// botón «usar como foto principal» y el comando retroactivo—, porque las tres tienen
/// que aplicar la misma regla y dejar el mismo rastro.
enum CoverPhoto {
    /// Asciende la foto de una reseña a portada, **solo si la fuente no tiene ninguna**.
    ///
    /// Nunca sustituye: esa es la asimetría de siempre (`FontController.update`). Añadir
    /// donde no había nada solo puede mejorar la ficha; tapar una foto buena con una
    /// mala, no. Y por eso esto puede ser automático y sustituir nunca podrá serlo.
    ///
    /// Devuelve si de verdad ascendió algo, para que quien llama pueda decirlo en voz
    /// alta — un cambio silencioso en la ficha de otro es justo lo que no queremos.
    @discardableResult
    static func adopt(font: Font, from comment: FontComment,
                      storage: any ImageStorage, on db: any Database) async throws -> Bool {
        guard font.image == nil, let origen = comment.image else { return false }
        let before = FontInfoSnapshot(font)
        // Se copia el objeto: la reseña se queda con el suyo, así que borrarla más tarde
        // no deja la ficha sin foto.
        font.image = try await storage.copy(origen)
        try await font.save(on: db)
        // Rastro en el historial de moderación, igual que cualquier otra edición de la
        // ficha. Sin esto la portada aparecía de la nada y no se podía revertir desde el
        // panel, que es la red de seguridad de toda la edición abierta.
        //
        // **Sin firmar, a propósito.** El baremo saca las aportaciones de foto de dos
        // sitios: las reseñas con imagen y las ediciones que cambian `image`. Esta foto
        // deja las dos huellas, así que firmando la edición la misma foto se cobraba dos
        // veces — medido: «primera foto» **y** «foto sustituida», 15 gotas de más. El
        // mérito ya lo lleva quien hizo la foto, por su reseña; esto es contabilidad, no
        // una aportación nueva. Mismo criterio que la incidencia que se cierra sola, que
        // queda «resuelta automáticamente» y no a nombre de quien pasó por allí.
        try await FontEdit(fontID: try font.requireID(), editorID: nil,
                           before: before, after: FontInfoSnapshot(font)).save(on: db)
        return true
    }
}
