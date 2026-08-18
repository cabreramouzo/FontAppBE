import assert from 'node:assert/strict'
import { test } from 'node:test'
import { etiquetaDe, tokeniza, type Token } from '../src/lib/richText.ts'

const enlaces = (t: string) => tokeniza(t).filter((x): x is Extract<Token, { tipo: 'enlace' }> => x.tipo === 'enlace')
const texto = (t: string) => tokeniza(t).map((x) => (x.tipo === 'texto' ? x.texto : x.tipo === 'enlace' ? `[${x.href}]` : `@${x.nombre}`)).join('')

test('reconoce una dirección pegada en medio de una frase', () => {
  assert.deepEqual(enlaces('mira https://ca.wikipedia.org/wiki/Font aquí').map((e) => e.href),
    ['https://ca.wikipedia.org/wiki/Font'])
})

test('el punto final de la frase no es parte del enlace', () => {
  assert.deepEqual(enlaces('ver https://ca.wikipedia.org/wiki/Font.').map((e) => e.href),
    ['https://ca.wikipedia.org/wiki/Font'])
})

test('un paréntesis que SÍ es de la dirección se conserva', () => {
  // El caso que motivó todo esto: las de Wikipedia con desambiguación.
  assert.deepEqual(enlaces('https://es.wikipedia.org/wiki/Fuente_(arquitectura)').map((e) => e.href),
    ['https://es.wikipedia.org/wiki/Fuente_(arquitectura)'])
})

test('un paréntesis que NO es de la dirección se recorta', () => {
  assert.deepEqual(enlaces('(mira https://ca.wikipedia.org/wiki/Font)').map((e) => e.href),
    ['https://ca.wikipedia.org/wiki/Font'])
})

test('un @ dentro de una dirección no es una mención', () => {
  // Sin buscar los enlaces primero, esto partía el enlace por la mitad.
  assert.equal(texto('https://x.com/@algu'), '[https://x.com/@algu]')
})

test('una dirección de correo no es ni enlace ni mención', () => {
  assert.equal(texto('escriu a hola@fontapp.net'), 'escriu a hola@fontapp.net')
  assert.equal(texto('hola@www.fontapp.net'), 'hola@www.fontapp.net')
})

test('las menciones siguen funcionando y se pueden apagar', () => {
  assert.equal(texto('gràcies @macma'), 'gràcies @macma')
  assert.deepEqual(tokeniza('gràcies @macma').map((t) => t.tipo), ['texto', 'mencion'])
  assert.deepEqual(tokeniza('gràcies @macma', { menciones: false }).map((t) => t.tipo), ['texto'])
})

test('www. suelto se enlaza con https', () => {
  assert.deepEqual(enlaces('font a www.icgc.cat/mapa').map((e) => e.href), ['https://www.icgc.cat/mapa'])
})

test('solo http y https: ningún esquema ejecutable puede colarse', () => {
  for (const t of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'ftp://x.com/a']) {
    assert.deepEqual(enlaces(t), [], t)
  }
})

test('varias direcciones en el mismo texto', () => {
  assert.equal(enlaces('a https://a.cat b https://b.cat c').length, 2)
})

test('la etiqueta conserva el dominio entero aunque recorte la ruta', () => {
  const e = etiquetaDe('https://ca.wikipedia.org/wiki/' + 'Font_de_la_Riera_de_Sant_Cugat_del_Valles_i_rodalies')
  assert.ok(e.startsWith('ca.wikipedia.org/'), e)
  assert.ok(e.endsWith('…'), e)
  assert.ok(e.length <= 48, e)
})

test('la etiqueta se lee: sin esquema, sin www y descodificada', () => {
  assert.equal(etiquetaDe('https://www.icgc.cat/'), 'icgc.cat')
  assert.equal(etiquetaDe('https://ca.wikipedia.org/wiki/Fran%C3%A7a'), 'ca.wikipedia.org/wiki/França')
})

test('un texto sin nada devuelve un solo trozo, y el vacío ninguno', () => {
  assert.deepEqual(tokeniza('Font de tres canyes'), [{ tipo: 'texto', texto: 'Font de tres canyes' }])
  assert.deepEqual(tokeniza(''), [])
})
