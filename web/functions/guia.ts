import { escribeMetaGuia } from './_guia'
import type { Env } from './_meta'

export const onRequestGet: PagesFunction<Env> = (ctx) => escribeMetaGuia(ctx, '/guia')
