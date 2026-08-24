import test from 'node:test'
import assert from 'node:assert/strict'
import { celebrationStorageKey } from '../src/lib/celebrationStorage.ts'

test('el historial de celebraciones pertenece al usuario, no al navegador', () => {
  assert.notEqual(
    celebrationStorageKey('level:seen', 'usuario-a'),
    celebrationStorageKey('level:seen', 'usuario-b'),
  )
  assert.equal(celebrationStorageKey('badges:seen', 'usuario-a'), 'badges:seen:usuario-a')
})
