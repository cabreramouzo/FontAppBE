import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formateaTamano } from '../src/lib/tamanos.ts'

/**
 * `Intl` separa cifra y unidad con un espacio **fino no separable** en varios idiomas
 * (U+202F en francés), que es la tipografía correcta y no un detalle a corregir. Se
 * normaliza solo para poder escribir el esperado con un espacio normal.
 */
const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ')

const MB = 1024 ** 2
const GB = 1024 ** 3

test('varios miles de MB se dicen en GB', () => {
  // El fallo reportado: la cuota salía como «39186.8 MB libres», que no significa nada
  // para nadie. Es el caso normal, no un extremo: cualquier móvil da decenas de GB.
  assert.equal(norm(formateaTamano(41_090_000_000, 'es')), '38,3 GB')
  assert.equal(norm(formateaTamano(2 * GB, 'es')), '2 GB')
})

test('el corte va justo en 1.024 MB, no en 1.000', () => {
  assert.match(formateaTamano(1023 * MB, 'es'), /MB$/)
  assert.match(formateaTamano(1024 * MB, 'es'), /GB$/)
})

test('por debajo de un mega se dice en KB', () => {
  // Con MB siempre, una instalación recién hecha diría «0,0 MB» y parecería estropeada.
  assert.equal(norm(formateaTamano(300 * 1024, 'es')), '300 kB')
  assert.match(formateaTamano(0, 'es'), /0 kB/)
})

test('el separador decimal es el del idioma', () => {
  assert.equal(norm(formateaTamano(134.8 * MB, 'es')), '134,8 MB')
  assert.equal(norm(formateaTamano(134.8 * MB, 'en')), '134.8 MB')
})

test('en francés son «Mo» y «Go», y eso lo pone Intl y no el diccionario', () => {
  // Por esto la unidad NO se escribe en los ocho diccionarios: sería una lista paralela
  // que se separa del corte de unidad a la primera.
  assert.equal(norm(formateaTamano(134.8 * MB, 'fr')), '134,8 Mo')
  assert.equal(norm(formateaTamano(38.3 * GB, 'fr')), '38,3 Go')
})

test('un idioma que Intl no conozca no tumba la pantalla', () => {
  assert.match(formateaTamano(5 * MB, 'xx-inventado'), /MB/)
})
