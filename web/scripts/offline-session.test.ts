import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/lib/apiError.ts'
import { sesionCaducada, usuarioCache, guardaUsuarioCache, olvidaUsuarioCache } from '../src/lib/offlineSession.ts'
import type { UserResponse } from '../src/api/types.ts'

// El bug: sin cobertura, al arrancar, la app aparecía deslogueada aunque el token estaba
// intacto. Solo un 401 cierra sesión; un fallo de red la conserva.

test('solo un 401 cuenta como sesión caducada', () => {
  assert.equal(sesionCaducada(new ApiError(401, 'no auth')), true)
  assert.equal(sesionCaducada(new ApiError(0, 'sin red')), false)   // offline: NO cierra
  assert.equal(sesionCaducada(new ApiError(500, 'server')), false)
  assert.equal(sesionCaducada(new ApiError(429, 'rate')), false)
  assert.equal(sesionCaducada(new Error('otro')), false)
  assert.equal(sesionCaducada(undefined), false)
})

test('las funciones de caché no revientan sin localStorage (Node)', () => {
  // En Node no hay localStorage: deben tragarse el error, nunca propagar.
  assert.doesNotThrow(() => guardaUsuarioCache({ id: 'u1' } as UserResponse))
  assert.doesNotThrow(() => olvidaUsuarioCache())
  assert.equal(usuarioCache(), null)
})
