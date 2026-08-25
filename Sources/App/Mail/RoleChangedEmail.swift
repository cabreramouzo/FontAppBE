import Vapor

/// Aviso transaccional cuando el propietario cambia el rol desde el panel.
/// Es corto a propósito: comunica el permiso nuevo y lleva a la aplicación; no es
/// una explicación completa del sistema de moderación.
enum RoleChangedEmail {
    private struct Copy {
        let subject: String
        let greeting: String
        let body: String
        let roleLabel: String
        let note: String
        let cta: String
        let footer: String
    }

    static func build(lang: String?, name: String, role: UserRole, webOrigin: String)
        -> (subject: String, html: String, text: String) {
        let copy = copy(for: lang, name: name, role: role)
        let base = webOrigin.hasSuffix("/") ? String(webOrigin.dropLast()) : webOrigin
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

        \(copy.note)

        \(copy.cta): \(base)

        \(copy.footer)
        """
        return (copy.subject, html, text)
    }

    private static func copy(for lang: String?, name: String, role: UserRole) -> Copy {
        switch (lang ?? "ca").prefix(2) {
        case "es": return Copy(subject: "Tu rol en FontApp ha cambiado", greeting: "Hola, \(name)", body: "El equipo de FontApp ha actualizado tu rol.", roleLabel: "Nuevo rol: \(roleName(role, lang: "es"))", note: "Tus permisos en la plataforma se han actualizado desde este momento.", cta: "Abrir FontApp", footer: "Recibes este correo porque el propietario de FontApp ha cambiado el rol de tu cuenta.")
        case "gl": return Copy(subject: "O teu rol en FontApp cambiou", greeting: "Ola, \(name)", body: "O equipo de FontApp actualizou o teu rol.", roleLabel: "Novo rol: \(roleName(role, lang: "gl"))", note: "Os teus permisos na plataforma quedaron actualizados desde este momento.", cta: "Abrir FontApp", footer: "Recibes este correo porque o propietario de FontApp cambiou o rol da túa conta.")
        case "eu": return Copy(subject: "FontApp-eko zure rola aldatu da", greeting: "Kaixo, \(name)", body: "FontApp taldeak zure rola eguneratu du.", roleLabel: "Rol berria: \(roleName(role, lang: "eu"))", note: "Plataformako zure baimenak une honetatik eguneratu dira.", cta: "Ireki FontApp", footer: "Mezu hau FontApp-eko jabeak zure kontuaren rola aldatu duelako jaso duzu.")
        case "en": return Copy(subject: "Your FontApp role has changed", greeting: "Hello, \(name)", body: "The FontApp team has updated your role.", roleLabel: "New role: \(roleName(role, lang: "en"))", note: "Your permissions on the platform have been updated from this moment on.", cta: "Open FontApp", footer: "You received this email because the FontApp owner changed your account role.")
        case "fr": return Copy(subject: "Votre rôle FontApp a changé", greeting: "Bonjour, \(name)", body: "L’équipe FontApp a mis à jour votre rôle.", roleLabel: "Nouveau rôle : \(roleName(role, lang: "fr"))", note: "Vos autorisations sur la plateforme sont maintenant à jour.", cta: "Ouvrir FontApp", footer: "Vous recevez cet e-mail car le propriétaire de FontApp a modifié le rôle de votre compte.")
        case "pt": return Copy(subject: "A sua função no FontApp mudou", greeting: "Olá, \(name)", body: "A equipa do FontApp atualizou a sua função.", roleLabel: "Nova função: \(roleName(role, lang: "pt"))", note: "As suas permissões na plataforma foram atualizadas a partir deste momento.", cta: "Abrir o FontApp", footer: "Recebe este email porque o proprietário do FontApp alterou a função da sua conta.")
        default: return Copy(subject: "El teu rol a FontApp ha canviat", greeting: "Hola, \(name)", body: "L’equip de FontApp ha actualitzat el teu rol.", roleLabel: "Rol nou: \(roleName(role, lang: "ca"))", note: "Els teus permisos a la plataforma s’han actualitzat des d’aquest moment.", cta: "Obrir FontApp", footer: "Reps aquest correu perquè el propietari de FontApp ha canviat el rol del teu compte.")
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
