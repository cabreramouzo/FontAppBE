import assert from 'node:assert/strict'
import { test } from 'node:test'
import { desmontaFoto, fotoDe, tieneFoto } from '../src/lib/outboxPhoto.ts'

// El bug: en iOS un Blob leído de IndexedDB muere al cerrarse la transacción — imagen
// rota en el visor y subida atascada. Se guardan los bytes y se reconstruye el Blob.

test('tieneFoto detecta bytes nuevos y Blob antiguo, y su ausencia', () => {
  assert.equal(tieneFoto({ photoBytes: new ArrayBuffer(4) }), true)
  assert.equal(tieneFoto({ photo: new Blob(['x']) }), true)
  assert.equal(tieneFoto({}), false)
})

test('desmontaFoto → fotoDe conserva bytes y tipo (ida y vuelta)', async () => {
  const original = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/jpeg' })
  const guardado = await desmontaFoto(original)
  assert.ok(guardado.photoBytes instanceof ArrayBuffer)
  assert.equal(guardado.photoType, 'image/jpeg')

  const reconstruido = fotoDe(guardado)!
  assert.equal(reconstruido.type, 'image/jpeg')
  assert.equal(reconstruido.size, 5)
  assert.deepEqual(new Uint8Array(await reconstruido.arrayBuffer()), new Uint8Array([1, 2, 3, 4, 5]))
})

test('fotoDe prefiere los bytes al Blob antiguo, y cae a él si no hay bytes', () => {
  const viejo = new Blob(['viejo'])
  // Con bytes, se ignora el `photo` (que en iOS estaría muerto).
  const desdeBytes = fotoDe({ photoBytes: new Uint8Array([9]).buffer, photoType: 'image/png', photo: viejo })!
  assert.equal(desdeBytes.type, 'image/png')
  assert.equal(desdeBytes.size, 1)
  // Sin bytes (elemento antiguo), se usa el Blob de siempre.
  assert.equal(fotoDe({ photo: viejo }), viejo)
  assert.equal(fotoDe({}), undefined)
})

test('un tipo vacío cae a image/jpeg, no a cadena vacía', async () => {
  const sinTipo = new Blob([new Uint8Array([1])]) // type ''
  const { photoType } = await desmontaFoto(sinTipo)
  assert.equal(photoType, 'image/jpeg')
  assert.equal(fotoDe({ photoBytes: new ArrayBuffer(1) })!.type, 'image/jpeg')
})
