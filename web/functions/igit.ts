import { socialRedirect } from './_share'
export const onRequest: PagesFunction = ({ request }) => socialRedirect(request, 'it', 'instagram')
