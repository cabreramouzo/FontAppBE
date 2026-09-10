import type { ShareLang } from './_meta'
import { socialRedirect } from './_share'

/** Enlaces cortos de WhatsApp. Delega en `socialRedirect`; ver allí el porqué. */
export function whatsappRedirect(request: Request, lang: ShareLang): Response {
  return socialRedirect(request, lang, 'whatsapp')
}
