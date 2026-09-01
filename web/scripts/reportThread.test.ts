import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agrupaEnHilos } from '../src/lib/reportThread.ts'

const c = (id: string, min: number, parentID?: string) =>
  ({ id, parentID, createdAt: new Date(Date.parse('2026-09-01T12:00:00Z') + min * 60000).toISOString() })

test('los comentarios van del más nuevo al más viejo', () => {
  const h = agrupaEnHilos([c('a', 0), c('b', 10)])
  assert.deepEqual(h.map((x) => x.comentario.id), ['b', 'a'])
})

test('pero las respuestas de cada uno se leen en el orden en que ocurrieron', () => {
  const h = agrupaEnHilos([c('a', 0), c('r2', 20, 'a'), c('r1', 10, 'a')])
  assert.deepEqual(h[0].respuestas.map((x) => x.id), ['r1', 'r2'])
})

test('cada respuesta cuelga de su comentario y no de otro', () => {
  const h = agrupaEnHilos([c('a', 0), c('b', 5), c('ra', 10, 'a'), c('rb', 11, 'b')])
  const porID = Object.fromEntries(h.map((x) => [x.comentario.id, x.respuestas.map((r) => r.id)]))
  assert.deepEqual(porID, { b: ['rb'], a: ['ra'] })
})

test('una respuesta huérfana se enseña como comentario, no se pierde', () => {
  // Al borrar un comentario sus respuestas se quedan sin padre **a propósito**: son
  // palabras de otra persona. Sin esto se volverían invisibles sin que nadie las quitara.
  const h = agrupaEnHilos([c('a', 0), c('huerfana', 10, 'ya-no-existe')])
  assert.deepEqual(h.map((x) => x.comentario.id), ['huerfana', 'a'])
  assert.deepEqual(h.flatMap((x) => x.respuestas), [])
})

test('sin nada no revienta', () => {
  assert.deepEqual(agrupaEnHilos([]), [])
})
