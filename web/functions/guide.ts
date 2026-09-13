import { escribeMetaGuia } from './_guia'
import type { Env } from './_meta'

// El alias inglés consolida su canónica en `/guia` mientras el cuerpo no exista en inglés.
export const onRequestGet: PagesFunction<Env> = (ctx) => escribeMetaGuia(ctx, '/guia')
