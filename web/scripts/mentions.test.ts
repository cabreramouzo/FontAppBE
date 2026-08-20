import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { insertaMencion, mencionEnCurso } from '../src/lib/mentions.ts'

/** Atajo: `|` marca dónde está el cursor. */
function en(conCursor: string) {
  const caret = conCursor.indexOf('|')
  return mencionEnCurso(conCursor.replace('|', ''), caret)
}

test('detecta lo que se está escribiendo tras una arroba', () => {
  assert.equal(en('avisa a @ma|')?.prefijo, 'ma')
  assert.equal(en('@ma|')?.prefijo, 'ma')
  assert.equal(en('@|')?.prefijo, '')
})

test('un correo NO abre sugerencias', () => {
  // El mismo caso que ya obligó al `(?<![\w@.])` en el parser: sin él, escribir
  // `hola@fon` ofrecería mencionar a «fon».
  assert.equal(en('escribe a hola@fon|'), null)
  assert.equal(en('a@b.c@de|'), null)
})

test('no sugiere si el cursor está dentro de una palabra ya escrita', () => {
  // Sustituir ahí cortaría «ria» por la mitad.
  assert.equal(en('hola @ma|ria que tal'), null)
})

test('coge la última mención, no la primera', () => {
  assert.equal(en('@ana y también @be|')?.prefijo, 'be')
})

test('sustituye solo la mención y deja el cursor detrás', () => {
  const texto = 'avisa a @ma'
  const m = mencionEnCurso(texto, texto.length)!
  const out = insertaMencion(texto, m, 'maria_r')
  assert.equal(out.texto, 'avisa a @maria_r ')
  assert.equal(out.caret, out.texto.length)
})

test('sustituye en medio de la frase sin comerse lo de detrás', () => {
  const texto = 'avisa a @ma y ya está'
  const m = mencionEnCurso(texto.slice(0, 11), 11)!
  const out = insertaMencion(texto, m, 'maria_r')
  assert.equal(out.texto, 'avisa a @maria_r  y ya está')
  assert.equal(out.texto.slice(0, out.caret), 'avisa a @maria_r ')
})
