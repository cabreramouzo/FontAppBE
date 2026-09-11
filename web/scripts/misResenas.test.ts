import assert from 'node:assert/strict'
import { test } from 'node:test'
import { esReciente, VENTANA_MS } from '../src/lib/misResenas.ts'

/**
 * La ventana de «reseñada hace poco» para no naguear. `apuntaResena`/`reseñadaHacePoco`
 * tocan localStorage; lo testeable es la decisión de ventana.
 */
const AHORA = 1_000_000_000_000

test('dentro de la ventana es reciente; fuera no', () => {
  assert.equal(esReciente(AHORA - 3_600_000, AHORA), true)        // hace 1 h
  assert.equal(esReciente(AHORA - VENTANA_MS + 1000, AHORA), true)
  assert.equal(esReciente(AHORA - VENTANA_MS - 1000, AHORA), false) // pasado un día
})

test('en el límite exacto cuenta como reciente', () => {
  assert.equal(esReciente(AHORA - VENTANA_MS, AHORA), true)
})

test('un timestamp en el futuro (reloj) no es reciente', () => {
  assert.equal(esReciente(AHORA + 1000, AHORA), false)
})

test('ida y vuelta: apuntar hace que salga como reciente, y caduca', async () => {
  // Stub mínimo de localStorage para probar la capa que toca almacenamiento.
  const mem = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v) },
    removeItem: (k: string) => { mem.delete(k) },
  }
  const { apuntaResena, reseñadaHacePoco } = await import('../src/lib/misResenas.ts')
  apuntaResena('font-a', AHORA)
  assert.equal(reseñadaHacePoco('font-a', AHORA + 3_600_000), true)
  assert.equal(reseñadaHacePoco('font-a', AHORA + VENTANA_MS + 1000), false)
  assert.equal(reseñadaHacePoco('font-b', AHORA), false)
})
