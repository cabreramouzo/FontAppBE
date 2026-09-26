import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fuentesTrasFalloDeRed, zonaCubreLaVista } from '../src/lib/mapFallback.ts'

// El bug: al perder cobertura sin zona guardada, el mapa se vaciaba de golpe. Un refresco
// fallido NO puede borrar los marcadores que ya se veían.

test('sin zona guardada, un fallo de red conserva las fuentes que ya estaban', () => {
  const previas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.equal(fuentesTrasFalloDeRed(previas, null), previas) // misma referencia: no repinta
})

test('con zona guardada, el fallo cae a las fuentes de la zona', () => {
  const previas = [{ id: 'a' }]
  const deZona = [{ id: 'x' }, { id: 'y' }]
  assert.equal(fuentesTrasFalloDeRed(previas, deZona), deZona)
})

test('nunca reduce a vacío lo que ya se veía, ni con null ni con []', () => {
  const previas = [{ id: 'a' }]
  assert.equal(fuentesTrasFalloDeRed(previas, null), previas)
  // El agujero real: con zona guardada pero fuera de su caja, `enCaja` da [] — y eso NO
  // puede vaciar el mapa. Antes `[] ?? previas` devolvía [] y borraba los marcadores.
  assert.equal(fuentesTrasFalloDeRed(previas, []), previas)
})

const moianes = { minLat: 41.75, maxLat: 41.85, minLong: 2.05, maxLong: 2.2 }

test('the saved zone does not stand in for the whole world', () => {
  assert.equal(zonaCubreLaVista(moianes, { minLat: -90, maxLat: 90, minLong: -180, maxLong: 180 }), false)
})

test('the saved zone stands in when the view is inside it', () => {
  assert.equal(zonaCubreLaVista(moianes, { minLat: 41.78, maxLat: 41.82, minLong: 2.08, maxLong: 2.15 }), true)
})

test('a zone that only grazes the view does not stand in', () => {
  assert.equal(zonaCubreLaVista(moianes, { minLat: 41.84, maxLat: 42.2, minLong: 2.1, maxLong: 2.6 }), false)
  assert.equal(zonaCubreLaVista(moianes, { minLat: 10, maxLat: 11, minLong: 10, maxLong: 11 }), false)
})
