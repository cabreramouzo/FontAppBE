import { whatsappRedirect } from './_wa'
export const onRequest: PagesFunction = ({ request }) => whatsappRedirect(request, 'en')
