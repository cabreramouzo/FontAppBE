import Vapor

/// «Alguien te ha mencionado en una fuente.»
///
/// Deliberadamente corto. La bienvenida y el resumen semanal son correos que se leen; éste
/// es un aviso, y lo único que tiene que conseguir es que vuelvas a la ficha. Todo lo que
/// sobre —ilustración, consejos, secciones— alarga el camino hasta el botón.
///
/// El HTML es antiguo a propósito, como el resto: tablas, anchos fijos y estilos EN LÍNEA,
/// porque Outlook y Gmail ignoran `<style>`, flexbox y grid. Va con alternativa en texto
/// plano, que además es lo que verá quien tenga las imágenes bloqueadas.
enum MentionEmail {
    private struct Copy {
        let subject: String
        let title: String
        let intro: String        // «{quien} te ha mencionado en {fuente}»
        let cta: String
        let unsubscribe: String
        let footer: String
    }

    /// - Parameters:
    ///   - by: quién escribió el mensaje.
    ///   - fontName: la fuente donde ocurrió.
    ///   - excerpt: el mensaje, ya recortado por quien llama.
    ///   - unsubscribeURL: baja firmada, para poder apagarlo sin iniciar sesión.
    static func build(lang: String?, by: String, fontName: String, excerpt: String,
                      fontURL: String, unsubscribeURL: String) -> (subject: String, html: String, text: String) {
        let c = copy(for: lang, by: by, fontName: fontName)
        return (c.subject, html(c, excerpt: excerpt, fontURL: fontURL, unsubscribeURL: unsubscribeURL),
                text(c, excerpt: excerpt, fontURL: fontURL, unsubscribeURL: unsubscribeURL))
    }

    // MARK: - HTML

    private static func html(_ c: Copy, excerpt: String, fontURL: String, unsubscribeURL: String) -> String {
        """
        <!doctype html>
        <html><body style="margin:0;padding:0;background:#f1f5f9;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
          <tr><td align="center" style="padding:24px 12px;">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <tr><td style="padding:28px 28px 8px;">
                <div style="font-size:20px;line-height:28px;font-weight:700;color:#0f172a;">\(esc(c.title))</div>
                <div style="font-size:15px;line-height:22px;color:#334155;padding-top:6px;">\(esc(c.intro))</div>
              </td></tr>
              <tr><td style="padding:12px 28px;">
                <!-- El mensaje va citado y no parafraseado: sin él hay que abrir la app
                     para saber si es urgente, y la mayoría de las veces no lo es. -->
                <div style="border-left:3px solid #0ea5e9;background:#f8fafc;padding:12px 14px;font-size:15px;line-height:22px;color:#0f172a;">\(esc(excerpt))</div>
              </td></tr>
              <tr><td align="center" style="padding:8px 28px 28px;">
                <a href="\(esc(fontURL))" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:8px;">\(esc(c.cta))</a>
              </td></tr>
              <tr><td style="padding:0 28px 24px;border-top:1px solid #e2e8f0;">
                <div style="font-size:12px;line-height:18px;color:#64748b;padding-top:14px;">
                  \(esc(c.footer))<br>
                  <a href="\(esc(unsubscribeURL))" style="color:#64748b;">\(esc(c.unsubscribe))</a>
                </div>
              </td></tr>
            </table>
          </td></tr>
        </table>
        </body></html>
        """
    }

    private static func text(_ c: Copy, excerpt: String, fontURL: String, unsubscribeURL: String) -> String {
        """
        \(c.title)

        \(c.intro)

        «\(excerpt)»

        \(c.cta): \(fontURL)

        —
        \(c.footer)
        \(c.unsubscribe): \(unsubscribeURL)
        """
    }

    private static func esc(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }

    // MARK: - Textos

    private static func copy(for lang: String?, by: String, fontName: String) -> Copy {
        switch (lang ?? "ca").prefix(2) {
        case "es":
            return Copy(
                subject: "@\(by) te ha mencionado en FontApp",
                title: "Te han mencionado",
                intro: "@\(by) te ha nombrado en «\(fontName)».",
                cta: "Ver la fuente",
                unsubscribe: "Dejar de recibir estos avisos",
                footer: "Recibes esto porque alguien te ha mencionado en FontApp.")
        case "gl":
            return Copy(
                subject: "@\(by) mencionoute en FontApp",
                title: "Mencionáronte",
                intro: "@\(by) nomeoute en «\(fontName)».",
                cta: "Ver a fonte",
                unsubscribe: "Deixar de recibir estes avisos",
                footer: "Recibes isto porque alguén te mencionou en FontApp.")
        case "eu":
            return Copy(
                subject: "@\(by)(e)k aipatu zaitu FontApp-en",
                title: "Aipatu zaituzte",
                intro: "@\(by)(e)k «\(fontName)» iturrian aipatu zaitu.",
                cta: "Ikusi iturria",
                unsubscribe: "Utzi abisu hauek jasotzeari",
                footer: "Hau jasotzen duzu norbaitek FontApp-en aipatu zaituelako.")
        case "en":
            return Copy(
                subject: "@\(by) mentioned you on FontApp",
                title: "You were mentioned",
                intro: "@\(by) named you on “\(fontName)”.",
                cta: "Open the fountain",
                unsubscribe: "Stop receiving these",
                footer: "You are getting this because someone mentioned you on FontApp.")
        default:
            return Copy(
                subject: "@\(by) t'ha mencionat a FontApp",
                title: "T'han mencionat",
                intro: "@\(by) t'ha anomenat a «\(fontName)».",
                cta: "Veure la font",
                unsubscribe: "Deixar de rebre aquests avisos",
                footer: "Reps això perquè algú t'ha mencionat a FontApp.")
        }
    }
}
