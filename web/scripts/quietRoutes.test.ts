import assert from 'node:assert/strict'
import { test } from 'node:test'
import { permiteInterrupciones, RUTAS_SIN_INTERRUPCIONES } from '../src/lib/quietRoutes.ts'

/**
 * En qué rutas NO se interrumpe. Fallo silencioso por los dos lados: si /install deja de
 * estar en la lista, el tutorial vuelve a saltarle a quien pediste ayuda para instalar; si
 * se cuela una ruta principal, el mapa se queda mudo sin bienvenida ni nada.
 */

test('/install no interrumpe (tutorial, ubicación, encuesta…)', () => {
  assert.equal(permiteInterrupciones('/install'), false)
})

test('las rutas normales sí interrumpen', () => {
  for (const r of ['/', '/activity', '/zones', '/me', '/fonts/abc', '/gpx']) {
    assert.equal(permiteInterrupciones(r), true, r)
  }
})

test('la lista contiene /install', () => {
  assert.ok(RUTAS_SIN_INTERRUPCIONES.includes('/install'))
})
