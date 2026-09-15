import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fuentesTrasFalloDeRed } from '../src/lib/mapFallback.ts'

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
