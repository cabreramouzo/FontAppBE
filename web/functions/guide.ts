import { escribeMetaGuia } from './_guia'
import type { Env } from './_meta'

// El alias inglés: su propia canónica y meta en inglés (el cuerpo de la guía ya existe en
// inglés). Se enlaza con `/guia` por hreflang, no por canónica compartida.
export const onRequestGet: PagesFunction<Env> = (ctx) => escribeMetaGuia(ctx, '/guide', 'en')
