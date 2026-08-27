import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { subidaEntre, tramosSecos, type PuntoPerfil } from '../src/lib/gpxImport.ts'
import { constaAgua } from '../src/lib/confidence.ts'

test('los huecos cubren el recorrido entero, extremos incluidos', () => {
  const t = tramosSecos([4, 10], 30)
  assert.deepEqual(t.map((x) => [x.desdeKm, x.hastaKm]), [[0, 4], [4, 10], [10, 30]])
  assert.equal(t.reduce((a, x) => a + x.largoKm, 0), 30, 'la suma tiene que dar la ruta entera')
})

// Una rampa: sube 100 m en el primer km, baja 100 en el segundo, sube 200 en el tercero.
const perfil: PuntoPerfil[] = [
  { km: 0, ele: 1000 }, { km: 1, ele: 1100 }, { km: 2, ele: 1000 }, { km: 3, ele: 1200 },
]

test('suma el desnivel POSITIVO, no la resta de los extremos', () => {
  // De 0 a 3 la resta daría 200. Lo que se pedalea son 300.
  assert.equal(subidaEntre(perfil, 0, 3), 300)
})

test('una bajada no resta', () => {
  assert.equal(subidaEntre(perfil, 1, 2), 0)
})

test('interpola los extremos en vez de saltar al vértice más cercano', () => {
  // Medio kilómetro de una rampa de 100 m/km son 50 m. Redondeando al vértice saldría 0
  // o 100, y en una pendiente fuerte un tramo corto se inventaría decenas de metros.
  assert.equal(subidaEntre(perfil, 0.5, 1), 50)
  assert.equal(subidaEntre(perfil, 0, 0.5), 50)
})

test('sin perfil —un GPX sin altitudes— devuelve cero y no revienta', () => {
  assert.equal(subidaEntre([], 0, 10), 0)
})

test('un tramo invertido o vacío da cero', () => {
  assert.equal(subidaEntre(perfil, 2, 2), 0)
  assert.equal(subidaEntre(perfil, 3, 1), 0)
})

const ayer = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
const haceUnAño = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString()

test('consta agua: reciente, con agua y respaldada', () => {
  assert.equal(constaAgua({ lastWaterStatus: 'flowing', lastUpdate: ayer, latestConfirmations: 1 }), true)
  assert.equal(constaAgua({ lastWaterStatus: 'trickle', lastUpdate: ayer }), true)
})

test('una fuente SECA no cuenta como agua, aunque el dato sea fresquísimo', () => {
  // Éste era el fallo del tramo seco: contaba todas las fuentes por igual, así que un
  // hueco «con agua» podía estar hecho de fuentes que constan secas.
  assert.equal(constaAgua({ lastWaterStatus: 'dry', lastUpdate: ayer, latestConfirmations: 3 }), false)
  assert.equal(constaAgua({ lastWaterStatus: 'broken', lastUpdate: ayer }), false)
  assert.equal(constaAgua({ lastWaterStatus: 'gone', lastUpdate: ayer }), false)
})

test('lo antiguo, lo nunca comprobado y lo contradictorio no cuentan', () => {
  assert.equal(constaAgua({ lastWaterStatus: 'flowing', lastUpdate: haceUnAño }), false, 'antigua')
  assert.equal(constaAgua({}), false, 'nunca comprobada')
  assert.equal(constaAgua({ lastWaterStatus: 'flowing', lastUpdate: ayer, recentStatusConflict: true }), false, 'contradictoria')
})
