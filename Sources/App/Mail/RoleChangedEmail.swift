import Vapor

/// Aviso transaccional cuando el propietario cambia el rol desde el panel.
/// Describe los permisos efectivos del rol para que el nombramiento no llegue sin
/// contexto. La lista debe mantenerse alineada con `UserRole` y sus comprobaciones.
enum RoleChangedEmail {
    private struct Copy {
        let subject: String
        let greeting: String
        let body: String
        let roleLabel: String
        let permissionsTitle: String
        let permissions: [String]
        let note: String
        let cta: String
        let footer: String
    }

    static func build(lang: String?, name: String, role: UserRole, webOrigin: String)
        -> (subject: String, html: String, text: String) {
        let copy = copy(for: lang, name: name, role: role)
        let base = webOrigin.hasSuffix("/") ? String(webOrigin.dropLast()) : webOrigin
        let permissionItems = copy.permissions
            .map { "<li style=\"margin:0 0 8px;\">\(esc($0))</li>" }
            .joined()
        let html = """
        <!doctype html>
        <html><body style="margin:0;padding:0;background:#f1f5f9;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
          <tr><td align="center" style="padding:24px 12px;">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <tr><td style="padding:28px;">
                <div style="font-size:24px;line-height:30px;font-weight:700;color:#0f172a;">🛡️ \(esc(copy.greeting))</div>
                <p style="font-size:15px;line-height:22px;color:#334155;">\(esc(copy.body))</p>
                <div style="margin:18px 0;padding:14px 16px;background:#f8fafc;border-left:3px solid #8b5cf6;font-size:17px;font-weight:700;color:#0f172a;">\(esc(copy.roleLabel))</div>
                <p style="margin:20px 0 10px;font-size:15px;line-height:22px;font-weight:700;color:#0f172a;">\(esc(copy.permissionsTitle))</p>
                <ul style="margin:0 0 18px;padding-left:22px;font-size:14px;line-height:21px;color:#334155;">\(permissionItems)</ul>
                <p style="font-size:14px;line-height:21px;color:#64748b;">\(esc(copy.note))</p>
                <div style="text-align:center;padding-top:12px;"><a href="\(esc(base))" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:8px;">\(esc(copy.cta))</a></div>
              </td></tr>
              <tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;line-height:18px;color:#94a3b8;">\(esc(copy.footer))</td></tr>
            </table>
          </td></tr>
        </table></body></html>
        """
        let text = """
        \(copy.greeting)

        \(copy.body)

        \(copy.roleLabel)

        \(copy.permissionsTitle)
        \(copy.permissions.map { "• \($0)" }.joined(separator: "\n"))

        \(copy.note)

        \(copy.cta): \(base)

        \(copy.footer)
        """
        return (copy.subject, html, text)
    }

    private static func copy(for lang: String?, name: String, role: UserRole) -> Copy {
        let language = String((lang ?? "ca").prefix(2))
        let permissions = permissions(for: role, lang: language)
        switch language {
        case "es": return Copy(subject: "Tu rol en FontApp ha cambiado", greeting: "Hola, \(name)", body: "El equipo de FontApp te ha asignado un nuevo rol.", roleLabel: "Nuevo rol: \(roleName(role, lang: "es"))", permissionsTitle: "¿Qué puedes hacer ahora?", permissions: permissions, note: "Usa estos permisos con cuidado: las acciones de moderación quedan registradas para proteger a la comunidad.", cta: "Abrir FontApp", footer: "Recibes este correo porque el propietario de FontApp ha cambiado el rol de tu cuenta.")
        case "gl": return Copy(subject: "O teu rol en FontApp cambiou", greeting: "Ola, \(name)", body: "O equipo de FontApp asignouche un novo rol.", roleLabel: "Novo rol: \(roleName(role, lang: "gl"))", permissionsTitle: "Que podes facer agora?", permissions: permissions, note: "Usa estes permisos con coidado: as accións de moderación quedan rexistradas para protexer a comunidade.", cta: "Abrir FontApp", footer: "Recibes este correo porque o propietario de FontApp cambiou o rol da túa conta.")
        case "eu": return Copy(subject: "FontApp-eko zure rola aldatu da", greeting: "Kaixo, \(name)", body: "FontApp taldeak rol berri bat esleitu dizu.", roleLabel: "Rol berria: \(roleName(role, lang: "eu"))", permissionsTitle: "Zer egin dezakezu orain?", permissions: permissions, note: "Erabili baimen hauek arduraz: moderazio-ekintzak erregistratu egiten dira komunitatea babesteko.", cta: "Ireki FontApp", footer: "Mezu hau FontApp-eko jabeak zure kontuaren rola aldatu duelako jaso duzu.")
        case "en": return Copy(subject: "Your FontApp role has changed", greeting: "Hello, \(name)", body: "The FontApp team has assigned you a new role.", roleLabel: "New role: \(roleName(role, lang: "en"))", permissionsTitle: "What can you do now?", permissions: permissions, note: "Please use these permissions carefully: moderation actions are logged to protect the community.", cta: "Open FontApp", footer: "You received this email because the FontApp owner changed your account role.")
        case "fr": return Copy(subject: "Votre rôle FontApp a changé", greeting: "Bonjour, \(name)", body: "L’équipe FontApp vous a attribué un nouveau rôle.", roleLabel: "Nouveau rôle : \(roleName(role, lang: "fr"))", permissionsTitle: "Que pouvez-vous faire maintenant ?", permissions: permissions, note: "Utilisez ces autorisations avec précaution : les actions de modération sont enregistrées afin de protéger la communauté.", cta: "Ouvrir FontApp", footer: "Vous recevez cet e-mail car le propriétaire de FontApp a modifié le rôle de votre compte.")
        case "pt": return Copy(subject: "A sua função no FontApp mudou", greeting: "Olá, \(name)", body: "A equipa do FontApp atribuiu-lhe uma nova função.", roleLabel: "Nova função: \(roleName(role, lang: "pt"))", permissionsTitle: "O que pode fazer agora?", permissions: permissions, note: "Utilize estas permissões com cuidado: as ações de moderação ficam registadas para proteger a comunidade.", cta: "Abrir o FontApp", footer: "Recebe este email porque o proprietário do FontApp alterou a função da sua conta.")
        default: return Copy(subject: "El teu rol a FontApp ha canviat", greeting: "Hola, \(name)", body: "L’equip de FontApp t’ha assignat un rol nou.", roleLabel: "Rol nou: \(roleName(role, lang: "ca"))", permissionsTitle: "Què pots fer ara?", permissions: permissions, note: "Fes servir aquests permisos amb cura: les accions de moderació queden registrades per protegir la comunitat.", cta: "Obrir FontApp", footer: "Reps aquest correu perquè el propietari de FontApp ha canviat el rol del teu compte.")
        }
    }

    private static func permissions(for role: UserRole, lang: String) -> [String] {
        let copy: (user: String, moderator: [String], admin: [String], owner: String)
        switch lang {
        case "es": copy = ("Usar las funciones normales de FontApp y gestionar tu propio contenido.", ["Revisar la cola de moderación y las denuncias de la comunidad.", "Ocultar fuentes falsas, abusivas o spam y restaurarlas si fue un error.", "Moderar reseñas, incidencias y fotos publicadas por otras personas."], ["Incluye todos los permisos de moderador.", "Gestionar fuentes: corregir ubicaciones, fotos y cambios, y revertir ediciones.", "Resolver solicitudes administrativas y consultar estadísticas e historial interno."], "También puedes asignar roles y gestionar los ajustes globales de FontApp.")
        case "gl": copy = ("Usar as funcións normais de FontApp e xestionar o teu propio contido.", ["Revisar a cola de moderación e as denuncias da comunidade.", "Ocultar fontes falsas, abusivas ou spam e restauralas se foi un erro.", "Moderar recensións, incidencias e fotos publicadas por outras persoas."], ["Inclúe todos os permisos de moderador.", "Xestionar fontes: corrixir localizacións, fotos e cambios, e reverter edicións.", "Resolver solicitudes administrativas e consultar estatísticas e historial interno."], "Tamén podes asignar roles e xestionar os axustes globais de FontApp.")
        case "eu": copy = ("FontApp-en ohiko funtzioak erabili eta zure edukia kudeatu.", ["Moderazio-ilara eta komunitatearen salaketak berrikusi.", "Iturri faltsuak, iraingarriak edo spama ezkutatu, eta akatsa bada leheneratu.", "Beste pertsonek argitaratutako iruzkinak, gorabeherak eta argazkiak moderatu."], ["Moderatzailearen baimen guztiak barne hartzen ditu.", "Iturriak kudeatu: kokapenak, argazkiak eta aldaketak zuzendu, eta edizioak leheneratu.", "Administrazio-eskaerak ebatzi eta estatistikak nahiz barne-historiala kontsultatu."], "Rolak esleitu eta FontApp-en ezarpen orokorrak ere kudea ditzakezu.")
        case "en": copy = ("Use FontApp's standard features and manage your own content.", ["Review the moderation queue and community reports.", "Hide fake, abusive or spam fountains and restore them when a mistake was made.", "Moderate reviews, incident reports and photos posted by other people."], ["Includes every moderator permission.", "Manage fountains: correct locations, photos and changes, and revert edits.", "Resolve administrative requests and access statistics and internal history."], "You can also assign roles and manage FontApp's global settings.")
        case "fr": copy = ("Utiliser les fonctions habituelles de FontApp et gérer votre propre contenu.", ["Examiner la file de modération et les signalements de la communauté.", "Masquer les fontaines fausses, abusives ou indésirables, et les restaurer en cas d’erreur.", "Modérer les avis, incidents et photos publiés par d’autres personnes."], ["Inclut toutes les autorisations de modérateur.", "Gérer les fontaines : corriger les emplacements, photos et modifications, et annuler des éditions.", "Traiter les demandes administratives et consulter les statistiques et l’historique interne."], "Vous pouvez également attribuer des rôles et gérer les paramètres globaux de FontApp.")
        case "pt": copy = ("Utilizar as funções normais do FontApp e gerir o seu próprio conteúdo.", ["Rever a fila de moderação e as denúncias da comunidade.", "Ocultar fontes falsas, abusivas ou spam e restaurá-las em caso de erro.", "Moderar avaliações, incidentes e fotografias publicadas por outras pessoas."], ["Inclui todas as permissões de moderador.", "Gerir fontes: corrigir localizações, fotografias e alterações, e reverter edições.", "Resolver pedidos administrativos e consultar estatísticas e histórico interno."], "Também pode atribuir funções e gerir as definições globais do FontApp.")
        default: copy = ("Fer servir les funcions normals de FontApp i gestionar el teu contingut.", ["Revisar la cua de moderació i les denúncies de la comunitat.", "Amagar fonts falses, abusives o brossa i restaurar-les si ha estat un error.", "Moderar ressenyes, incidències i fotos publicades per altres persones."], ["Inclou tots els permisos de moderador.", "Gestionar fonts: corregir ubicacions, fotos i canvis, i revertir edicions.", "Resoldre sol·licituds administratives i consultar estadístiques i historial intern."], "També pots assignar rols i gestionar els ajustos globals de FontApp.")
        }
        switch role {
        case .user: return [copy.user]
        case .moderator: return copy.moderator
        case .admin: return copy.admin
        case .owner: return copy.admin + [copy.owner]
        }
    }

    private static func roleName(_ role: UserRole, lang: String) -> String {
        switch (lang, role) {
        case ("es", .user): return "Usuario"
        case ("es", .moderator): return "Moderador"
        case ("es", .admin): return "Administrador"
        case ("gl", .user): return "Usuario"
        case ("gl", .moderator): return "Moderador"
        case ("gl", .admin): return "Administrador"
        case ("eu", .user): return "Erabiltzailea"
        case ("eu", .moderator): return "Moderatzailea"
        case ("eu", .admin): return "Administratzailea"
        case ("en", .user): return "User"
        case ("en", .moderator): return "Moderator"
        case ("en", .admin): return "Administrator"
        case ("fr", .user): return "Utilisateur"
        case ("fr", .moderator): return "Modérateur"
        case ("fr", .admin): return "Administrateur"
        case ("pt", .user): return "Utilizador"
        case ("pt", .moderator): return "Moderador"
        case ("pt", .admin): return "Administrador"
        case (_, .user): return "Usuari"
        case (_, .moderator): return "Moderador"
        case (_, .admin): return "Administrador"
        case (_, .owner): return "Propietari"
        }
    }

    private static func esc(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }
}
