import Foundation

/// Las frases de las notificaciones del sistema, en los ocho idiomas.
///
/// Están aquí y no en el cliente porque un push se pinta **fuera de la app** —lo dibuja el
/// sistema en la pantalla de bloqueo— y ahí no hay diccionarios ni forma de saber qué
/// idioma elegiste. Es el mismo trato que ya tienen los correos: se usa `users.lang`.
///
/// Van **cortas a propósito**: Android corta el cuerpo en unas dos líneas y iOS en menos.
/// Lo que importa cabe en el título; el cuerpo solo dice qué ha pasado.
enum PushCopy {
    /// El nombre de una fuente sin topónimo. Tres de cada cuatro no tienen, así que este
    /// caso NO es el raro: escribir «null» o dejarlo en blanco sería lo normal, no la
    /// excepción.
    static func nombre(_ n: String?, lang: String?) -> String {
        if let n, !n.trimmingCharacters(in: .whitespaces).isEmpty { return n }
        switch (lang ?? "ca").prefix(2) {
        case "es": return "una fuente sin nombre"
        case "gl": return "unha fonte sen nome"
        case "eu": return "izenik gabeko iturri bat"
        case "en": return "an unnamed fountain"
        case "fr": return "une fontaine sans nom"
        case "pt": return "uma fonte sem nome"
        case "it": return "una fontana senza nome"
        default:   return "una font sense nom"
        }
    }

    /// El aviso de prueba que uno se manda a sí mismo desde los ajustes.
    static func prueba(lang: String?) -> (String, String) {
        switch (lang ?? "ca").prefix(2) {
        case "es": return ("FontApp", "Los avisos funcionan en este aparato.")
        case "gl": return ("FontApp", "Os avisos funcionan neste aparello.")
        case "eu": return ("FontApp", "Abisuak gailu honetan dabiltza.")
        case "en": return ("FontApp", "Notifications work on this device.")
        case "fr": return ("FontApp", "Les notifications fonctionnent sur cet appareil.")
        case "pt": return ("FontApp", "Os avisos funcionam neste aparelho.")
        case "it": return ("FontApp", "Le notifiche funzionano su questo dispositivo.")
        default:   return ("FontApp", "Els avisos funcionen en aquest aparell.")
        }
    }

    /// Se te ha ampliado el cupo de fuentes de cuenta nueva.
    ///
    /// **Sin fecha**: el push lo compone el servidor, que no sabe en qué huso estás. La
    /// fecha exacta la pinta la campana, que sí lo sabe. Aquí lo que importa es «ya
    /// puedes seguir».
    static func sourceLimit(lang: String?) -> (String, String) {
        switch (lang ?? "ca").prefix(2) {
        case "es": return ("Ya puedes añadir más fuentes", "Te hemos ampliado el cupo temporalmente.")
        case "gl": return ("Xa podes engadir máis fontes", "Ampliámosche o cupo temporalmente.")
        case "eu": return ("Iturri gehiago gehi ditzakezu", "Kupoa aldi baterako handitu dizugu.")
        case "en": return ("You can add more fountains now", "We have raised your limit for a while.")
        case "fr": return ("Vous pouvez ajouter plus de points d’eau", "Nous avons relevé votre quota temporairement.")
        case "pt": return ("Já podes adicionar mais fontes", "Aumentámos o teu limite temporariamente.")
        case "it": return ("Ora puoi aggiungere più fontane", "Abbiamo alzato il tuo limite per un po’.")
        default:   return ("Ja pots afegir més fonts", "T’hem ampliat el cupo temporalment.")
        }
    }

    /// Título y cuerpo para un cambio en una fuente que sigues.
    ///
    /// `code` es el mismo que guarda la campana (`review:dry`, `report`, `hidden:retired`).
    /// Un código que no conozcamos cae en el genérico en vez de quedarse en blanco: los
    /// avisos viejos tienen que sobrevivir a un servidor nuevo.
    static func fontUpdate(code: String, fontName: String?, lang: String?) -> (String, String) {
        let l = String((lang ?? "ca").prefix(2))
        let n = nombre(fontName, lang: lang)
        let seco = code == "review:dry" || code == "review:broken" || code == "review:gone"
        let agua = code.hasPrefix("review:") && !seco

        switch l {
        case "es":
            if agua { return (n, "Alguien ha comprobado que sale agua") }
            if seco { return (n, "Alguien dice que ahora mismo no sale agua") }
            if code == "report" { return (n, "Han avisado de una incidencia") }
            if code == "resolved" { return (n, "La incidencia se ha resuelto") }
            if code.hasPrefix("hidden") { return (n, "Ya no aparece en el mapa") }
            return (n, "Ha cambiado algo")
        case "gl":
            if agua { return (n, "Alguén comprobou que sae auga") }
            if seco { return (n, "Alguén di que agora mesmo non sae auga") }
            if code == "report" { return (n, "Avisaron dunha incidencia") }
            if code == "resolved" { return (n, "A incidencia resolveuse") }
            if code.hasPrefix("hidden") { return (n, "Xa non aparece no mapa") }
            return (n, "Cambiou algo")
        case "eu":
            if agua { return (n, "Norbaitek egiaztatu du ura badariola") }
            if seco { return (n, "Norbaitek dio orain ez dariola urik") }
            if code == "report" { return (n, "Gorabehera baten berri eman dute") }
            if code == "resolved" { return (n, "Gorabehera konpondu da") }
            if code.hasPrefix("hidden") { return (n, "Jada ez da mapan agertzen") }
            return (n, "Zerbait aldatu da")
        case "en":
            if agua { return (n, "Someone confirmed there is water") }
            if seco { return (n, "Someone says there is no water right now") }
            if code == "report" { return (n, "An issue has been reported") }
            if code == "resolved" { return (n, "The issue has been resolved") }
            if code.hasPrefix("hidden") { return (n, "It no longer appears on the map") }
            return (n, "Something changed")
        case "fr":
            if agua { return (n, "Quelqu’un a confirmé qu’il y a de l’eau") }
            if seco { return (n, "Quelqu’un dit qu’il n’y a pas d’eau en ce moment") }
            if code == "report" { return (n, "Un problème a été signalé") }
            if code == "resolved" { return (n, "Le problème est résolu") }
            if code.hasPrefix("hidden") { return (n, "Elle n’apparaît plus sur la carte") }
            return (n, "Quelque chose a changé")
        case "pt":
            if agua { return (n, "Alguém confirmou que sai água") }
            if seco { return (n, "Alguém diz que agora não sai água") }
            if code == "report" { return (n, "Foi comunicada uma ocorrência") }
            if code == "resolved" { return (n, "A ocorrência foi resolvida") }
            if code.hasPrefix("hidden") { return (n, "Já não aparece no mapa") }
            return (n, "Mudou alguma coisa")
        case "it":
            if agua { return (n, "Qualcuno ha confermato che c’è acqua") }
            if seco { return (n, "Qualcuno dice che ora non c’è acqua") }
            if code == "report" { return (n, "È stata segnalata una anomalia") }
            if code == "resolved" { return (n, "L’anomalia è stata risolta") }
            if code.hasPrefix("hidden") { return (n, "Non compare più sulla mappa") }
            return (n, "È cambiato qualcosa")
        default:
            if agua { return (n, "Algú ha comprovat que hi surt aigua") }
            if seco { return (n, "Algú diu que ara mateix no hi surt aigua") }
            if code == "report" { return (n, "Han avisat d’una incidència") }
            if code == "resolved" { return (n, "La incidència s’ha resolt") }
            if code.hasPrefix("hidden") { return (n, "Ja no surt al mapa") }
            return (n, "Ha canviat alguna cosa")
        }
    }
}
