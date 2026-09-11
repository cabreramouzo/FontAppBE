import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ubicacionBloqueada, claveAvisoTrasDenegar } from '../src/lib/geoNotice.ts'

/**
 * Caducado vs bloqueado. El mismo `PERMISSION_DENIED` significa cosas opuestas según el
 * estado del permiso, y confundirlos o asusta (dices «bloqueado» al que solo caducó, muy
 * común en iOS a diario) o atasca (no explicas los ajustes al que sí bloqueó).
 */

test('solo "denied" está bloqueado de verdad', () => {
  assert.equal(ubicacionBloqueada('denied'), true)
  assert.equal(ubicacionBloqueada('prompt'), false)   // caducado en iOS: reintentar
  assert.equal(ubicacionBloqueada('granted'), false)
})

test('ante la duda (null: sin API de permisos) NO se dice bloqueado', () => {
  assert.equal(ubicacionBloqueada(null), false)
})

test('el aviso: bloqueado manda a ajustes, lo demás invita a reintentar', () => {
  assert.equal(claveAvisoTrasDenegar('denied'), 'map.geoBlocked')
  assert.equal(claveAvisoTrasDenegar('prompt'), 'map.geoDismissed')
  assert.equal(claveAvisoTrasDenegar(null), 'map.geoDismissed')
})
