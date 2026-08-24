import Vapor

/// Correo de bienvenida que se envía al darse de alta. Es el equivalente por correo
/// del pop-up de bienvenida de la web (`WelcomeDialog.tsx`): misma ilustración, mismo
/// tono y los mismos puntos, más lo que allí no cabe (offline y app en el móvil).
///
/// El HTML es deliberadamente antiguo: tablas, anchos fijos y estilos EN LÍNEA. Los
/// clientes de correo (sobre todo Outlook y Gmail) ignoran `<style>`, flexbox y grid.
/// También va una alternativa en texto plano: mejora la entregabilidad y sirve a quien
/// lee sin HTML.
enum WelcomeEmail {
    /// Textos localizados del correo.
    private struct Copy {
        let subject: String
        let greeting: String   // "Hola, {nombre}"
        let intro: String
        let bullets: [(String, String)]  // (emoji, texto)
        let offlineTitle: String
        let offlineBody: String
        let installTitle: String
        let installBody: String
        /// Pasos concretos por plataforma: el menú no está en el mismo sitio y sin
        /// decir dónde mirar (sobre todo el "Compartir" de iOS) casi nadie la instala.
        let installIOS: (label: String, steps: String)
        let installAndroid: (label: String, steps: String)
        let cta: String
        let outro: String
        let footer: String
    }

    static func build(lang: String?, name: String, webOrigin: String) -> (subject: String, html: String, text: String) {
        let c = copy(for: lang, name: name)
        let base = webOrigin.hasSuffix("/") ? String(webOrigin.dropLast()) : webOrigin
        return (c.subject, html(c, base: base), text(c, base: base))
    }

    // MARK: - HTML

    private static func html(_ c: Copy, base: String) -> String {
        let bullets = c.bullets.map { emoji, body in
            """
            <tr>
              <td valign="top" style="padding:6px 10px 6px 0;font-size:20px;line-height:24px;">\(emoji)</td>
              <td valign="top" style="padding:6px 0;font-size:15px;line-height:22px;color:#334155;">\(esc(body))</td>
            </tr>
            """
        }.joined(separator: "\n")

        return """
        <!doctype html>
        <html><body style="margin:0;padding:0;background:#f1f5f9;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
          <tr><td align="center" style="padding:24px 12px;">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

              <tr><td style="padding:0;">
                <!-- Banner ya recortado a 2:1 (welcome-email.jpg). La ilustración original
                     es vertical y en correo no hay `object-fit` fiable: se recorta en origen. -->
                <img src="\(base)/welcome-email.jpg" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
              </td></tr>

              <tr><td style="padding:24px 28px 0;">
                <h1 style="margin:0;font-size:24px;line-height:30px;color:#0f172a;">\(esc(c.greeting))</h1>
                <p style="margin:12px 0 0;font-size:15px;line-height:22px;color:#475569;">\(esc(c.intro))</p>
              </td></tr>

              <tr><td style="padding:16px 28px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">\(bullets)</table>
              </td></tr>

              <tr><td style="padding:20px 28px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border-radius:10px;">
                  <tr><td style="padding:16px 18px;">
                    <p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">\(esc(c.offlineTitle))</p>
                    <p style="margin:6px 0 0;font-size:14px;line-height:21px;color:#475569;">\(esc(c.offlineBody))</p>
                  </td></tr>
                  <tr><td style="padding:0 18px 16px;">
                    <p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">\(esc(c.installTitle))</p>
                    <p style="margin:6px 0 0;font-size:14px;line-height:21px;color:#475569;">\(esc(c.installBody))</p>
                    <p style="margin:10px 0 0;font-size:14px;line-height:21px;color:#475569;"><strong style="color:#0f172a;">\(esc(c.installIOS.label))</strong> \(esc(c.installIOS.steps))</p>
                    <p style="margin:6px 0 0;font-size:14px;line-height:21px;color:#475569;"><strong style="color:#0f172a;">\(esc(c.installAndroid.label))</strong> \(esc(c.installAndroid.steps))</p>
                  </td></tr>
                </table>
              </td></tr>

              <tr><td align="center" style="padding:24px 28px 8px;">
                <a href="\(base)" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:13px 28px;border-radius:8px;">\(esc(c.cta))</a>
              </td></tr>

              <tr><td style="padding:8px 28px 24px;">
                <p style="margin:0;font-size:14px;line-height:21px;color:#64748b;">\(esc(c.outro))</p>
              </td></tr>

              <tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;line-height:18px;color:#94a3b8;">\(esc(c.footer))</p>
              </td></tr>

            </table>
          </td></tr>
        </table>
        </body></html>
        """
    }

    private static func text(_ c: Copy, base: String) -> String {
        var out = "\(c.greeting)\n\n\(c.intro)\n\n"
        out += c.bullets.map { "- \($0.1)" }.joined(separator: "\n")
        out += "\n\n\(c.offlineTitle)\n\(c.offlineBody)\n\n\(c.installTitle)\n\(c.installBody)\n"
        out += "\(c.installIOS.label) \(c.installIOS.steps)\n\(c.installAndroid.label) \(c.installAndroid.steps)\n"
        out += "\n\(c.cta): \(base)\n\n\(c.outro)\n\n\(c.footer)\n"
        return out
    }

    /// Escapa el texto que se interpola en el HTML (el nombre lo escribe el usuario).
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
                subject: "¡Bienvenido/a a FontApp! 💧",
                greeting: "¡Bienvenido/a, \(name)! 👋",
                intro: "FontApp es una red cooperativa de fuentes de agua: entre todos mantenemos al día si una fuente mana, si el agua es potable y cuándo se comprobó por última vez.",
                bullets: [
                    ("🗺️", "Explora el mapa y busca fuentes por nombre o lugar."),
                    ("💧", "Consulta su estado: si sale agua, potabilidad y última confirmación."),
                    ("➕", "Añade fuentes nuevas y comparte fotos."),
                    ("⭐", "Deja reseñas y confirma el estado para que todos lo sepan."),
                    ("💧", "Gana gotas: cada aportación suma para subir de nivel y conseguir insignias."),
                ],
                offlineTitle: "🛰️ Funciona sin cobertura",
                offlineBody: "En el monte casi nunca hay señal. Puedes consultar el mapa que ya has visitado sin conexión, y si añades una fuente o una reseña sin datos, se guarda en el móvil y se envía sola en cuanto vuelve la red (en Android, incluso con la app cerrada). Nada se pierde.",
                installTitle: "📲 Instálala en el móvil",
                installBody: "FontApp se instala como una app desde el propio navegador, sin tienda de aplicaciones: se abre a pantalla completa, ocupa muy poco y tienes la ubicación y la cámara a mano para añadir una fuente en el momento.",
                installIOS: ("iPhone y iPad (Safari):", "abre fontapp.net, pulsa el botón Compartir (el cuadrado con la flecha hacia arriba, abajo en el centro), baja hasta «Añadir a pantalla de inicio» y confirma con «Añadir»."),
                installAndroid: ("Android (Chrome):", "abre fontapp.net y toca el aviso de instalar que aparece abajo; si no sale, entra en el menú ⋮ (arriba a la derecha) y elige «Instalar aplicación» o «Añadir a pantalla de inicio»."),
                cta: "Empezar a explorar",
                outro: "Gracias por sumarte. Cada estado que confirmas puede ahorrarle a alguien un desvío de varios kilómetros hasta una fuente seca.",
                footer: "Recibes este correo porque te has dado de alta en FontApp. Si no has sido tú, ignóralo."
            )
        case "gl":
            return Copy(
                subject: "Benvido/a a FontApp! 💧",
                greeting: "Benvido/a, \(name)! 👋",
                intro: "FontApp é unha rede cooperativa de fontes de auga: entre todos mantemos ao día se unha fonte mana, se a auga é potable e cando se comprobou por última vez.",
                bullets: [
                    ("🗺️", "Explora o mapa e busca fontes por nome ou lugar."),
                    ("💧", "Consulta o seu estado: se sae auga, potabilidade e última confirmación."),
                    ("➕", "Engade fontes novas e comparte fotos."),
                    ("⭐", "Deixa reseñas e confirma o estado para que todos o saiban."),
                    ("💧", "Gaña pingas: cada achega suma para subir de nivel e conseguir insignias."),
                ],
                offlineTitle: "🛰️ Funciona sen cobertura",
                offlineBody: "No monte case nunca hai sinal. Podes consultar sen conexión o mapa que xa visitaches e, se engades unha fonte ou unha reseña sen datos, gárdase no móbil e envíase soa en canto volve a rede (en Android, mesmo coa app pechada). Non se perde nada.",
                installTitle: "📲 Instálaa no móbil",
                installBody: "FontApp instálase como unha app desde o propio navegador, sen tenda de aplicacións: ábrese a pantalla completa, ocupa moi pouco e tes a localización e a cámara a man para engadir unha fonte no momento.",
                installIOS: ("iPhone e iPad (Safari):", "abre fontapp.net, preme o botón Compartir (o cadrado coa frecha cara arriba, abaixo no centro), baixa ata «Engadir á pantalla de inicio» e confirma con «Engadir»."),
                installAndroid: ("Android (Chrome):", "abre fontapp.net e toca o aviso de instalar que aparece abaixo; se non sae, entra no menú ⋮ (arriba á dereita) e escolle «Instalar aplicación» ou «Engadir á pantalla de inicio»."),
                cta: "Comezar a explorar",
                outro: "Grazas por sumarte. Cada estado que confirmas pode aforrarlle a alguén un desvío de varios quilómetros ata unha fonte seca.",
                footer: "Recibes este correo porque te deches de alta en FontApp. Se non fuches ti, ignórao."
            )
        case "eu":
            return Copy(
                subject: "Ongi etorri FontApp-era! 💧",
                greeting: "Ongi etorri, \(name)! 👋",
                intro: "FontApp ur-iturrien sare kooperatibo bat da: denon artean eguneratzen dugu iturri batek ura duen, ura edangarria den eta noiz egiaztatu zen azkenekoz.",
                bullets: [
                    ("🗺️", "Arakatu mapa eta bilatu iturriak izenez edo lekuz."),
                    ("💧", "Ikusi egoera: ura ateratzen den, edangarritasuna eta azken berrespena."),
                    ("➕", "Gehitu iturri berriak eta partekatu argazkiak."),
                    ("⭐", "Utzi iritziak eta berretsi egoera denek jakin dezaten."),
                    ("💧", "Irabazi tantak: ekarpen bakoitzak maila igotzeko eta dominak lortzeko balio du."),
                ],
                offlineTitle: "🛰️ Estaldurarik gabe ere badabil",
                offlineBody: "Mendian ia inoiz ez dago seinalerik. Dagoeneko bisitatu duzun mapa konexiorik gabe kontsulta dezakezu eta, daturik gabe iturri bat edo iritzi bat gehitzen baduzu, mugikorrean gordetzen da eta sarea itzultzean bakarrik bidaltzen da (Android-en, appa itxita egonda ere). Ez da ezer galtzen.",
                installTitle: "📲 Instalatu mugikorrean",
                installBody: "FontApp app gisa instalatzen da nabigatzailetik bertatik, aplikazio-dendarik gabe: pantaila osoan irekitzen da, oso leku gutxi hartzen du eta kokapena eta kamera eskura dituzu iturri bat unean bertan gehitzeko.",
                installIOS: ("iPhone eta iPad (Safari):", "ireki fontapp.net, sakatu Partekatu botoia (gora doan gezia duen laukia, behean erdian), jaitsi «Gehitu hasierako pantailara» aukeraraino eta berretsi «Gehitu» sakatuta."),
                installAndroid: ("Android (Chrome):", "ireki fontapp.net eta sakatu behean agertzen den instalatzeko oharra; agertzen ez bada, joan ⋮ menura (goian eskuinean) eta aukeratu «Instalatu aplikazioa» edo «Gehitu hasierako pantailara»."),
                cta: "Hasi arakatzen",
                outro: "Eskerrik asko batzeagatik. Berresten duzun egoera bakoitzak norbaiti kilometro batzuetako bidea aurreztu diezaioke iturri lehor bateraino.",
                footer: "Mezu hau jasotzen duzu FontApp-en izena eman duzulako. Zu izan ez bazara, ez ikusi egin."
            )
        case "en":
            return Copy(
                subject: "Welcome to FontApp! 💧",
                greeting: "Welcome, \(name)! 👋",
                intro: "FontApp is a cooperative network of water fountains: together we keep track of whether a fountain is flowing, whether the water is drinkable and when it was last checked.",
                bullets: [
                    ("🗺️", "Explore the map and search fountains by name or place."),
                    ("💧", "Check their status: whether water flows, potability and last confirmation."),
                    ("➕", "Add new fountains and share photos."),
                    ("⭐", "Leave reviews and confirm the status so everyone knows."),
                    ("💧", "Earn drops: every contribution counts towards levelling up and winning badges."),
                ],
                offlineTitle: "🛰️ Works without signal",
                offlineBody: "There's rarely coverage up in the hills. You can browse the map you've already visited offline, and if you add a fountain or a review with no data, it's saved on your phone and sent by itself as soon as the network is back (on Android, even with the app closed). Nothing is lost.",
                installTitle: "📲 Install it on your phone",
                installBody: "FontApp installs as an app straight from your browser, no app store: it opens full screen, takes up very little space, and keeps your location and camera at hand to add a fountain on the spot.",
                installIOS: ("iPhone and iPad (Safari):", "open fontapp.net, tap the Share button (the square with an up arrow, bottom centre), scroll down to \"Add to Home Screen\" and confirm with \"Add\"."),
                installAndroid: ("Android (Chrome):", "open fontapp.net and tap the install prompt at the bottom; if it doesn't show, open the ⋮ menu (top right) and pick \"Install app\" or \"Add to Home screen\"."),
                cta: "Start exploring",
                outro: "Thanks for joining. Every status you confirm can save someone a several-kilometre detour to a dry fountain.",
                footer: "You're getting this email because you signed up for FontApp. If it wasn't you, just ignore it."
            )
        case "pt":
            return Copy(
                subject: "Bem-vindo/a ao FontApp! 💧",
                greeting: "Bem-vindo/a, \(name)! 👋",
                intro: "O FontApp é uma rede colaborativa de fontes de água: juntos mantemos atualizado se uma fonte tem água, se a água é potável e quando foi verificada pela última vez.",
                bullets: [
                    ("🗺️", "Explora o mapa e procura fontes por nome ou local."),
                    ("💧", "Consulta o estado: se tem água, a potabilidade e a última confirmação."),
                    ("➕", "Adiciona novas fontes e partilha fotografias."),
                    ("⭐", "Deixa avaliações e confirma o estado para que todos saibam."),
                    ("💧", "Ganha gotas: cada contribuição conta para subir de nível e conquistar emblemas."),
                ],
                offlineTitle: "🛰️ Funciona sem rede",
                offlineBody: "Na serra raramente há rede. Podes consultar offline o mapa que já visitaste e, se adicionares uma fonte ou avaliação sem ligação, fica guardada no telemóvel e é enviada automaticamente quando a rede regressa (no Android, mesmo com a aplicação fechada). Nada se perde.",
                installTitle: "📲 Instala-a no telemóvel",
                installBody: "O FontApp instala-se como uma aplicação diretamente a partir do navegador, sem loja de aplicações: abre em ecrã inteiro, ocupa muito pouco espaço e mantém a localização e a câmara à mão para adicionares uma fonte no momento.",
                installIOS: ("iPhone e iPad (Safari):", "abre fontapp.net, toca no botão Partilhar (o quadrado com a seta para cima, em baixo ao centro), desce até «Adicionar ao ecrã principal» e confirma em «Adicionar»."),
                installAndroid: ("Android (Chrome):", "abre fontapp.net e toca no aviso de instalação em baixo; se não aparecer, abre o menu ⋮ (em cima à direita) e escolhe «Instalar aplicação» ou «Adicionar ao ecrã principal»."),
                cta: "Começar a explorar",
                outro: "Obrigado por te juntares. Cada estado que confirmas pode poupar a alguém um desvio de vários quilómetros até uma fonte seca.",
                footer: "Recebes este email porque te registaste no FontApp. Se não foste tu, ignora-o."
            )
        default: // ca (idioma por defecto de la app)
            return Copy(
                subject: "Benvingut/da a FontApp! 💧",
                greeting: "Benvingut/da, \(name)! 👋",
                intro: "FontApp és una xarxa cooperativa de fonts d'aigua: entre tots mantenim al dia si una font raja, si l'aigua és potable i quan es va comprovar per última vegada.",
                bullets: [
                    ("🗺️", "Explora el mapa i cerca fonts per nom o per lloc."),
                    ("💧", "Consulta'n l'estat: si surt aigua, potabilitat i última confirmació."),
                    ("➕", "Afegeix fonts noves i comparteix-ne fotos."),
                    ("⭐", "Deixa ressenyes i confirma l'estat perquè tothom ho sàpiga."),
                    ("💧", "Guanya gotes: cada aportació suma per pujar de nivell i aconseguir insígnies."),
                ],
                offlineTitle: "🛰️ Funciona sense cobertura",
                offlineBody: "A muntanya gairebé mai hi ha senyal. Pots consultar sense connexió el mapa que ja has visitat i, si afegeixes una font o una ressenya sense dades, es desa al mòbil i s'envia sola quan torna la xarxa (a Android, fins i tot amb l'app tancada). No es perd res.",
                installTitle: "📲 Instal·la-la al mòbil",
                installBody: "FontApp s'instal·la com una app des del mateix navegador, sense botiga d'aplicacions: s'obre a pantalla completa, ocupa molt poc i tens la ubicació i la càmera a mà per afegir una font al moment.",
                installIOS: ("iPhone i iPad (Safari):", "obre fontapp.net, prem el botó Compartir (el quadrat amb la fletxa cap amunt, a baix al centre), baixa fins a «Afegeix a la pantalla d'inici» i confirma amb «Afegeix»."),
                installAndroid: ("Android (Chrome):", "obre fontapp.net i toca l'avís d'instal·lació que apareix a baix; si no surt, entra al menú ⋮ (a dalt a la dreta) i tria «Instal·la l'aplicació» o «Afegeix a la pantalla d'inici»."),
                cta: "Comença a explorar",
                outro: "Gràcies per sumar-t'hi. Cada estat que confirmes pot estalviar a algú una desviació de diversos quilòmetres fins a una font seca.",
                footer: "Reps aquest correu perquè t'has donat d'alta a FontApp. Si no has estat tu, ignora'l."
            )
        }
    }
}
