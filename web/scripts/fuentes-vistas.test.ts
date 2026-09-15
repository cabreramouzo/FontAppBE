import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mezclaVistas } from '../src/lib/fuentesVistas.ts'
import type { FontSummary } from '../src/api/types.ts'

const f = (id: string): FontSummary => ({ id } as FontSummary)

test('fusiona las nuevas sobre las previas conservando ambas', () => {
  const out = mezclaVistas({ a: f('a') }, [f('b'), f('c')])
  assert.deepEqual(Object.keys(out).sort(), ['a', 'b', 'c'])
})

test('una fuente vista otra vez se actualiza, no se duplica', () => {
  const vieja = { id: 'a', name: 'vieja' } as FontSummary
  const nueva = { id: 'a', name: 'nueva' } as FontSummary
  const out = mezclaVistas({ a: vieja }, [nueva])
  assert.equal(Object.keys(out).length, 1)
  assert.equal((out.a as { name: string }).name, 'nueva')
})

test('capa al tope quedándose con las más recientes', () => {
  const prev = { viejo: f('viejo') }
  const out = mezclaVistas(prev, [f('n1'), f('n2')], 2)
  // 'viejo' es el menos reciente y cae; quedan las dos nuevas.
  assert.deepEqual(Object.keys(out).sort(), ['n1', 'n2'])
})

test('ignora fuentes sin id y la lista vacía no rompe', () => {
  const out = mezclaVistas({ a: f('a') }, [{ } as FontSummary])
  assert.deepEqual(Object.keys(out), ['a'])
  assert.deepEqual(mezclaVistas({}, []), {})
})
