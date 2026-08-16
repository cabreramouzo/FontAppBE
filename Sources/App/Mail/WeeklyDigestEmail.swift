import Foundation

/// Plantilla del resumen semanal (ver `WeeklyDigest` para los datos). Mismas reglas
/// que `WelcomeEmail`: tablas, anchos fijos y estilos en línea, porque los clientes de
/// correo ignoran `<style>`, flexbox y grid. Localizada en los 5 idiomas de la app.
enum WeeklyDigestEmail {
    private struct Copy {
        let subject: String
        let header: String            // "Tu resumen semanal"
        let greeting: String          // "Hola, {nombre}"
        let intro: String
        let statFonts: String
        let statStatuses: String
        let statNews: String
        let activityTitle: String
        let activitySubtitle: String
        let nearbyTitle: String
        let nearbySubtitle: String
        /// Cobertura de zona (fase 5). No se promete ningún «has pasado del 12 % al
        /// 15 %»: no se guarda la fecha en que cada fuente ganó su foto, así que la
        /// variación semanal habría que inventársela. Se dice el número de hoy.
        let zoneTitle: (String) -> String       // "Cómo va Girona"
        let zoneSubtitle: String
        let zoneLine: (Int, Int, Int) -> String // hechas, total, %
        let zoneMissing: (Int) -> String        // "Faltan 1.440 por fotografiar"
        let addedBy: String           // "añadida por"
        let editedBody: String        // texto para una edición (no tiene cuerpo propio)
        let cta: String
        let nudge: String
        let footer: String
        let unsubscribe: String       // texto del enlace de baja
        let statusLabels: [String: String]  // waterStatus -> etiqueta
        let reportLabel: String       // distintivo de una incidencia/aviso
        let editLabel: String         // distintivo de una edición
        let daysAgo: (Int) -> String
    }

    /// - Parameters:
    ///   - webOrigin: origen de la web (para los enlaces).
    ///   - unsubscribeURL: enlace de baja ya firmado.
    static func build(lang: String?, name: String, digest: WeeklyDigest, weekStart: Date, weekEnd: Date,
                      webOrigin: String, unsubscribeURL: String) -> (subject: String, html: String, text: String) {
        let c = copy(for: lang, name: name)
        let base = webOrigin.hasSuffix("/") ? String(webOrigin.dropLast()) : webOrigin
        let range = dateRange(weekStart, weekEnd, lang: lang)
        return (c.subject, html(c, digest: digest, base: base, range: range, unsubscribeURL: unsubscribeURL),
                text(c, digest: digest, base: base, range: range, unsubscribeURL: unsubscribeURL))
    }

    // MARK: - HTML

    private static func html(_ c: Copy, digest: WeeklyDigest, base: String, range: String, unsubscribeURL: String) -> String {
        var sections = ""

        if !digest.activity.isEmpty {
            let rows = digest.activity.enumerated().map { index, a -> String in
                let last = index == digest.activity.count - 1
                let chip = chipHTML(for: a, c: c)
                let body: String
                switch a.kind {
                case .comment: body = "“\(esc(trim(a.body ?? "")))” — <strong>\(esc(a.author))</strong> · \(esc(c.daysAgo(daysSince(a.createdAt))))"
                case .report:  body = "“\(esc(trim(a.body ?? "")))” — <strong>\(esc(a.author))</strong> · \(esc(c.daysAgo(daysSince(a.createdAt))))"
                case .edit:    body = "\(esc(c.editedBody)) — <strong>\(esc(a.author))</strong> · \(esc(c.daysAgo(daysSince(a.createdAt))))"
                }
                return """
                <tr><td style="padding:10px 0;\(last ? "" : "border-bottom:1px solid #f1f5f9;")">
                  <p style="margin:0;font-size:15px;line-height:21px;color:#0f172a;">
                    <a href="\(base)/fonts/\(a.fontID)" style="color:#0f172a;text-decoration:none;font-weight:700;">\(esc(a.fontName))</a>\(chip)
                  </p>
                  <p style="margin:5px 0 0;font-size:14px;line-height:20px;color:#475569;">\(body)</p>
                </td></tr>
                """
            }.joined(separator: "\n")

            sections += """
            <tr><td style="padding:26px 28px 0;">
              <p style="margin:0;font-size:16px;font-weight:800;color:#0f172a;">\(esc(c.activityTitle))</p>
              <p style="margin:4px 0 0;font-size:13px;line-height:19px;color:#64748b;">\(esc(c.activitySubtitle))</p>
            </td></tr>
            <tr><td style="padding:12px 28px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">\(rows)</table>
            </td></tr>
            """
        }

        // La zona va DESPUÉS de la actividad y antes de las fuentes cercanas: primero lo
        // que ha pasado, luego cómo va el sitio. Es una barra dibujada con dos celdas de
        // tabla y anchos en porcentaje, porque los clientes de correo no pintan `<meter>`
        // ni divs con `width` calculado por CSS.
        if let z = digest.zone, z.fonts > 0 {
            let lleno = max(z.photoPct, z.withPhoto > 0 ? 2 : 0)
            let vacio = 100 - lleno
            let faltan = z.fonts - z.withPhoto
            sections += """
            <tr><td style="padding:26px 28px 0;">
              <p style="margin:0;font-size:16px;font-weight:800;color:#0f172a;">\(esc(c.zoneTitle(z.region)))</p>
              <p style="margin:4px 0 0;font-size:13px;line-height:19px;color:#64748b;">\(esc(c.zoneSubtitle))</p>
            </td></tr>
            <tr><td style="padding:12px 28px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
                <tr>
                  <td width="\(lleno)%" height="10" style="background:#0ea5e9;border-radius:5px 0 0 5px;font-size:0;line-height:0;">&nbsp;</td>
                  <td width="\(vacio)%" height="10" style="background:#e2e8f0;border-radius:0 5px 5px 0;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
              <p style="margin:8px 0 0;font-size:14px;line-height:20px;color:#334155;">\(esc(c.zoneLine(z.withPhoto, z.fonts, z.photoPct)))</p>
              <p style="margin:6px 0 0;font-size:14px;line-height:20px;color:#64748b;">
                <a href="\(base)/zones" style="color:#0ea5e9;text-decoration:none;font-weight:600;">\(esc(c.zoneMissing(faltan)))</a>
              </p>
            </td></tr>
            """
        }

        if !digest.nearby.isEmpty {
            let rows = digest.nearby.map { n -> String in
                let place = n.region.map { " · \(esc($0))" } ?? ""
                return """
                <tr><td valign="top" style="padding:6px 8px 6px 0;font-size:16px;">\(emoji(for: n.source))</td>
                  <td style="padding:6px 0;font-size:14px;line-height:20px;color:#334155;">
                    <a href="\(base)/fonts/\(n.id)" style="color:#0f172a;font-weight:600;text-decoration:none;">\(esc(n.name))</a>\(place) · <span style="color:#64748b;">\(esc(c.addedBy)) \(esc(n.author))</span>
                  </td></tr>
                """
            }.joined(separator: "\n")

            sections += """
            <tr><td style="padding:26px 28px 0;">
              <p style="margin:0;font-size:16px;font-weight:800;color:#0f172a;">\(esc(c.nearbyTitle))</p>
              <p style="margin:4px 0 0;font-size:13px;line-height:19px;color:#64748b;">\(esc(c.nearbySubtitle))</p>
            </td></tr>
            <tr><td style="padding:12px 28px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">\(rows)</table>
            </td></tr>
            """
        }

        return """
        <!doctype html>
        <html><body style="margin:0;padding:0;background:#f1f5f9;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
          <tr><td align="center" style="padding:24px 12px;">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

              <tr><td style="padding:22px 28px;background:#0ea5e9;">
                <p style="margin:0;font-size:20px;font-weight:800;color:#ffffff;">💧 FontApp</p>
                <p style="margin:4px 0 0;font-size:14px;color:#e0f2fe;">\(esc(c.header)) · \(esc(range))</p>
              </td></tr>

              <tr><td style="padding:24px 28px 0;">
                <h1 style="margin:0;font-size:22px;line-height:28px;color:#0f172a;">\(esc(c.greeting))</h1>
                <p style="margin:10px 0 0;font-size:15px;line-height:22px;color:#475569;">\(esc(c.intro))</p>
              </td></tr>

              <tr><td style="padding:18px 28px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;">
                  <tr>
                    <td align="center" style="padding:14px 6px;width:33%;">
                      <p style="margin:0;font-size:22px;font-weight:800;color:#0f172a;">\(digest.fontsAdded)</p>
                      <p style="margin:2px 0 0;font-size:12px;color:#64748b;">\(esc(c.statFonts))</p>
                    </td>
                    <td align="center" style="padding:14px 6px;width:33%;border-left:1px solid #e2e8f0;">
                      <p style="margin:0;font-size:22px;font-weight:800;color:#0f172a;">\(digest.statusesConfirmed)</p>
                      <p style="margin:2px 0 0;font-size:12px;color:#64748b;">\(esc(c.statStatuses))</p>
                    </td>
                    <td align="center" style="padding:14px 6px;width:33%;border-left:1px solid #e2e8f0;">
                      <p style="margin:0;font-size:22px;font-weight:800;color:#0f172a;">\(digest.newsCount)</p>
                      <p style="margin:2px 0 0;font-size:12px;color:#64748b;">\(esc(c.statNews))</p>
                    </td>
                  </tr>
                </table>
              </td></tr>

              \(sections)

              <tr><td align="center" style="padding:26px 28px 6px;">
                <a href="\(base)" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:13px 28px;border-radius:8px;">\(esc(c.cta))</a>
              </td></tr>

              <tr><td style="padding:14px 28px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;">
                  <tr><td style="padding:16px 18px;">
                    <p style="margin:0;font-size:14px;line-height:21px;color:#475569;">\(esc(c.nudge))</p>
                  </td></tr>
                </table>
              </td></tr>

              <tr><td style="padding:22px 28px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;line-height:18px;color:#94a3b8;">
                  \(esc(c.footer)) <a href="\(unsubscribeURL)" style="color:#64748b;">\(esc(c.unsubscribe))</a>.
                </p>
              </td></tr>

            </table>
          </td></tr>
        </table>
        </body></html>
        """
    }

    private static func text(_ c: Copy, digest: WeeklyDigest, base: String, range: String, unsubscribeURL: String) -> String {
        var out = "\(c.header) · \(range)\n\n\(c.greeting)\n\n\(c.intro)\n\n"
        out += "\(digest.fontsAdded) \(c.statFonts) · \(digest.statusesConfirmed) \(c.statStatuses) · \(digest.newsCount) \(c.statNews)\n"
        if !digest.activity.isEmpty {
            out += "\n\(c.activityTitle)\n"
            for a in digest.activity {
                let body = a.kind == .edit ? c.editedBody : "“\(trim(a.body ?? ""))”"
                out += "- \(a.fontName): \(body) — \(a.author) · \(c.daysAgo(daysSince(a.createdAt)))\n  \(base)/fonts/\(a.fontID)\n"
            }
        }
        if let z = digest.zone, z.fonts > 0 {
            out += "\n\(c.zoneTitle(z.region))\n"
            out += "\(c.zoneLine(z.withPhoto, z.fonts, z.photoPct))\n"
            out += "\(c.zoneMissing(z.fonts - z.withPhoto)) \(base)/zones\n"
        }
        if !digest.nearby.isEmpty {
            out += "\n\(c.nearbyTitle)\n"
            for n in digest.nearby {
                out += "- \(n.name)\(n.region.map { " · \($0)" } ?? "") · \(c.addedBy) \(n.author)\n  \(base)/fonts/\(n.id)\n"
            }
        }
        out += "\n\(c.cta): \(base)\n\n\(c.nudge)\n\n\(c.footer) \(c.unsubscribe): \(unsubscribeURL)\n"
        return out
    }

    // MARK: - Piezas

    /// Distintivo de color a la derecha del nombre de la fuente.
    private static func chipHTML(for a: WeeklyDigest.Activity, c: Copy) -> String {
        func chip(_ text: String, bg: String, fg: String) -> String {
            " <span style=\"display:inline-block;margin-left:6px;padding:2px 8px;border-radius:99px;background:\(bg);color:\(fg);font-size:12px;font-weight:700;\">\(esc(text))</span>"
        }
        switch a.kind {
        case .edit: return chip(c.editLabel, bg: "#e0f2fe", fg: "#075985")
        case .report: return chip(c.reportLabel, bg: "#fef3c7", fg: "#92400e")
        case .comment:
            guard let status = a.waterStatus, let label = c.statusLabels[status] else { return "" }
            switch status {
            case "flowing": return chip(label, bg: "#dcfce7", fg: "#166534")
            case "dry": return chip(label, bg: "#fee2e2", fg: "#991b1b")
            default: return chip(label, bg: "#fef3c7", fg: "#92400e")
            }
        }
    }

    private static func emoji(for source: WaterSource?) -> String {
        switch source {
        case .tap: return "🚰"
        case .mountain: return "⛰️"
        case .spring: return "💦"
        case .well: return "🪣"
        case .fountain: return "⛲"
        default: return "💧"
        }
    }

    private static func daysSince(_ date: Date) -> Int {
        max(0, Int(Date().timeIntervalSince(date) / 86_400))
    }

    /// Las reseñas pueden ser largas; en el correo solo cabe el principio.
    private static func trim(_ s: String, limit: Int = 140) -> String {
        let clean = s.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "\n", with: " ")
        return clean.count <= limit ? clean : String(clean.prefix(limit)) + "…"
    }

    private static func dateRange(_ start: Date, _ end: Date, lang: String?) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: lang ?? "ca")
        f.dateFormat = "d MMM"
        return "\(f.string(from: start)) – \(f.string(from: end))"
    }

    private static func esc(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }

    // MARK: - Textos

    private static func copy(for lang: String?, name: String) -> Copy {
        switch lang {
        case "es":
            return Copy(
                subject: "Tu resumen semanal en FontApp 💧",
                header: "Tu resumen semanal",
                greeting: "Hola, \(name) 👋",
                intro: "Esta semana ha habido movimiento en las fuentes que has añadido o en las que has participado.",
                statFonts: "fuentes añadidas", statStatuses: "estados confirmados", statNews: "novedades para ti",
                activityTitle: "Han pasado por tus fuentes",
                activitySubtitle: "Fuentes que añadiste tú o en las que dejaste una reseña.",
                nearbyTitle: "Nuevas fuentes cerca de las tuyas",
                nearbySubtitle: "Añadidas esta semana en la zona por la que sueles moverte.",
                zoneTitle: { "Cómo va \($0)" },
                zoneSubtitle: "La foto es lo que más falta. Cada una la pone alguien que pasaba por allí.",
                zoneLine: { "\($0) de \($1) fuentes ya tienen foto (\($2) %)." },
                zoneMissing: { "Faltan \($0) por fotografiar →" },
                addedBy: "añadida por",
                editedBody: "Alguien ha editado la información de la fuente.",
                cta: "Ver el mapa",
                nudge: "¿Sales este fin de semana? Confirmar el estado de una fuente son 10 segundos y le ahorra a alguien un desvío hasta una fuente seca. Funciona sin cobertura: se envía sola al volver la señal.",
                footer: "Recibes este resumen porque tienes cuenta en FontApp. Puedes",
                unsubscribe: "dejar de recibirlo",
                statusLabels: ["flowing": "Sale agua", "trickle": "Poca agua", "dry": "Seca"],
                reportLabel: "Aviso", editLabel: "Editada",
                daysAgo: { d in d <= 0 ? "hoy" : (d == 1 ? "ayer" : "hace \(d) días") }
            )
        case "gl":
            return Copy(
                subject: "O teu resumo semanal en FontApp 💧",
                header: "O teu resumo semanal",
                greeting: "Ola, \(name) 👋",
                intro: "Esta semana houbo movemento nas fontes que engadiches ou naquelas nas que participaches.",
                statFonts: "fontes engadidas", statStatuses: "estados confirmados", statNews: "novidades para ti",
                activityTitle: "Pasaron polas túas fontes",
                activitySubtitle: "Fontes que engadiches ti ou nas que deixaches unha reseña.",
                nearbyTitle: "Novas fontes preto das túas",
                nearbySubtitle: "Engadidas esta semana na zona pola que adoitas moverte.",
                zoneTitle: { "Como vai \($0)" },
                zoneSubtitle: "A foto é o que máis falta. Cada unha ponna alguén que pasaba por alí.",
                zoneLine: { "\($0) de \($1) fontes xa teñen foto (\($2) %)." },
                zoneMissing: { "Faltan \($0) por fotografar →" },
                addedBy: "engadida por",
                editedBody: "Alguén editou a información da fonte.",
                cta: "Ver o mapa",
                nudge: "Saes esta fin de semana? Confirmar o estado dunha fonte son 10 segundos e afórralle a alguén un desvío ata unha fonte seca. Funciona sen cobertura: envíase soa ao volver o sinal.",
                footer: "Recibes este resumo porque tes conta en FontApp. Podes",
                unsubscribe: "deixar de recibilo",
                statusLabels: ["flowing": "Sae auga", "trickle": "Pouca auga", "dry": "Seca"],
                reportLabel: "Aviso", editLabel: "Editada",
                daysAgo: { d in d <= 0 ? "hoxe" : (d == 1 ? "onte" : "hai \(d) días") }
            )
        case "eu":
            return Copy(
                subject: "Zure asteko laburpena FontApp-en 💧",
                header: "Zure asteko laburpena",
                greeting: "Kaixo, \(name) 👋",
                intro: "Aste honetan mugimendua egon da gehitu dituzun edo parte hartu duzun iturrietan.",
                statFonts: "iturri gehituta", statStatuses: "egoera berretsita", statNews: "berri zuretzat",
                activityTitle: "Zure iturrietatik pasa dira",
                activitySubtitle: "Zuk gehitutako iturriak edo iritzia utzi duzunak.",
                nearbyTitle: "Iturri berriak zureen ondoan",
                nearbySubtitle: "Aste honetan gehituak zu ibiltzen zaren inguruan.",
                zoneTitle: { "\($0) nola doan" },
                zoneSubtitle: "Argazkia da gehien falta dena. Bakoitza handik pasatzen zen norbaitek jartzen du.",
                zoneLine: { "\($1) iturritik \($0)k dute jada argazkia (% \($2))." },
                zoneMissing: { "\($0) daude oraindik argazkirik gabe →" },
                addedBy: "gehitzailea:",
                editedBody: "Norbaitek iturriaren informazioa editatu du.",
                cta: "Ikusi mapa",
                nudge: "Asteburu honetan irtengo zara? Iturri baten egoera berrestea 10 segundo dira eta norbaiti iturri lehor bateraino joatea aurrezten dio. Estaldurarik gabe ere badabil: seinalea itzultzean bakarrik bidaltzen da.",
                footer: "Laburpen hau jasotzen duzu FontApp-en kontua duzulako.",
                unsubscribe: "utzi jasotzeari",
                statusLabels: ["flowing": "Ura dario", "trickle": "Ur gutxi", "dry": "Lehorra"],
                reportLabel: "Oharra", editLabel: "Editatua",
                daysAgo: { d in d <= 0 ? "gaur" : (d == 1 ? "atzo" : "duela \(d) egun") }
            )
        case "en":
            return Copy(
                subject: "Your weekly FontApp round-up 💧",
                header: "Your weekly round-up",
                greeting: "Hi, \(name) 👋",
                intro: "There's been activity this week on the fountains you added or took part in.",
                statFonts: "fountains added", statStatuses: "statuses confirmed", statNews: "updates for you",
                activityTitle: "People stopped at your fountains",
                activitySubtitle: "Fountains you added, or where you left a review.",
                nearbyTitle: "New fountains near yours",
                nearbySubtitle: "Added this week around the area you usually walk.",
                zoneTitle: { "How \($0) is doing" },
                zoneSubtitle: "Photos are what is missing most. Each one is added by someone who walked past.",
                zoneLine: { "\($0) of \($1) fountains already have a photo (\($2)%)." },
                zoneMissing: { "\($0) still to photograph →" },
                addedBy: "added by",
                editedBody: "Someone edited the fountain's details.",
                cta: "Open the map",
                nudge: "Heading out this weekend? Confirming a fountain's status takes 10 seconds and saves someone a detour to a dry one. It works with no signal: it sends itself when you're back online.",
                footer: "You're getting this round-up because you have a FontApp account. You can",
                unsubscribe: "stop receiving it",
                statusLabels: ["flowing": "Flowing", "trickle": "Trickle", "dry": "Dry"],
                reportLabel: "Heads-up", editLabel: "Edited",
                daysAgo: { d in d <= 0 ? "today" : (d == 1 ? "yesterday" : "\(d) days ago") }
            )
        default: // ca
            return Copy(
                subject: "El teu resum setmanal a FontApp 💧",
                header: "El teu resum setmanal",
                greeting: "Hola, \(name) 👋",
                intro: "Aquesta setmana hi ha hagut moviment a les fonts que has afegit o en què has participat.",
                statFonts: "fonts afegides", statStatuses: "estats confirmats", statNews: "novetats per a tu",
                activityTitle: "Han passat per les teves fonts",
                activitySubtitle: "Fonts que vas afegir tu o on vas deixar una ressenya.",
                nearbyTitle: "Fonts noves a prop de les teves",
                nearbySubtitle: "Afegides aquesta setmana a la zona per on sols moure't.",
                zoneTitle: { "Com va \($0)" },
                zoneSubtitle: "La foto és el que més falta. Cada una la posa algú que hi passava.",
                zoneLine: { "\($0) de \($1) fonts ja tenen foto (\($2) %)." },
                zoneMissing: { "En falten \($0) per fotografiar →" },
                addedBy: "afegida per",
                editedBody: "Algú ha editat la informació de la font.",
                cta: "Veure el mapa",
                nudge: "Surts aquest cap de setmana? Confirmar l'estat d'una font són 10 segons i estalvia a algú una desviació fins a una font seca. Funciona sense cobertura: s'envia sola quan torna el senyal.",
                footer: "Reps aquest resum perquè tens compte a FontApp. Pots",
                unsubscribe: "deixar de rebre'l",
                statusLabels: ["flowing": "Raja", "trickle": "Poca aigua", "dry": "Seca"],
                reportLabel: "Avís", editLabel: "Editada",
                daysAgo: { d in d <= 0 ? "avui" : (d == 1 ? "ahir" : "fa \(d) dies") }
            )
        }
    }
}
