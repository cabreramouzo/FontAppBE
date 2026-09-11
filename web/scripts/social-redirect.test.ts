import assert from 'node:assert/strict'
import { test } from 'node:test'
import { socialRedirect } from '../functions/_share.ts'

/**
 * Los enlaces cortos sociales (/twes, /iges, /waes…). Lo que se prueba aquí es justo lo que
 * rompió `/tw` cuando vivía en `_redirects`: el `Location` tiene que ser ABSOLUTO y llevar
 * el idioma y el canal, o el crawler de X no llega a la tarjeta y sale la imagen rota. Es
 * un fallo silencioso —un 302 se ve igual de bien—, y por eso conviene fijarlo.
 *
 * Se importa solo `_share.ts` (módulo hoja): `_wa.ts` reexporta esto sin extensión y el
 * runner de Node no lo resuelve. Que WhatsApp delega en `socialRedirect` se cubre probando
 * el canal 'whatsapp' aquí mismo.
 */

const destino = (res: Response) => res.headers.get('location') ?? ''

test('redirige 302 a un Location ABSOLUTO con lang y canal', () => {
  const res = socialRedirect(new Request('https://fontapp.net/twes'), 'es', 'twitter')
  assert.equal(res.status, 302)
  assert.equal(destino(res), 'https://fontapp.net/?lang=es&p=twitter')
})

test('el Location es absoluto, no relativo (el bug de /tw)', () => {
  const res = socialRedirect(new Request('https://fontapp.net/twca'), 'ca', 'twitter')
  assert.ok(destino(res).startsWith('https://'), `esperaba absoluto, fue: ${destino(res)}`)
})

test('conserva el origen de la petición (no lo fija a producción)', () => {
  const res = socialRedirect(new Request('http://localhost:5173/iges'), 'es', 'instagram')
  assert.equal(destino(res), 'http://localhost:5173/?lang=es&p=instagram')
})

test('cada canal pone su propio código de campaña', () => {
  const p = (source: string) =>
    new URL(destino(socialRedirect(new Request('https://fontapp.net/x'), 'en', source))).searchParams.get('p')
  assert.equal(p('twitter'), 'twitter')
  assert.equal(p('instagram'), 'instagram')
  assert.equal(p('whatsapp'), 'whatsapp')
})

test('el idioma del enlace viaja en ?lang (la tarjeta no cae al catalán por defecto)', () => {
  for (const lang of ['ca', 'es', 'en', 'fr', 'pt', 'it', 'gl', 'eu'] as const) {
    const url = new URL(destino(socialRedirect(new Request('https://fontapp.net/tw'), lang, 'twitter')))
    assert.equal(url.searchParams.get('lang'), lang)
  }
})
