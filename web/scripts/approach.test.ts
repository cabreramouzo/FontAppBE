import assert from 'node:assert/strict'
import test from 'node:test'
import { guia, rumbo, RADIO_GUIA_M, RADIO_LLEGADA_M } from '../src/lib/approach.ts'

// Una fuente 100 m al norte de un punto de Castellcir, y otra 100 m al este.
const YO: [number, number] = [41.7500, 2.1500]
const NORTE: [number, number] = [41.7509, 2.1500]
const ESTE: [number, number] = [41.7500, 2.15121]

test('el rumbo distingue norte de este', () => {
  assert.ok(Math.abs(rumbo(...YO, ...NORTE) - 0) < 1, 'al norte, 0°')
  assert.ok(Math.abs(rumbo(...YO, ...ESTE) - 90) < 1, 'al este, 90°')
})

test('el rumbo al sur es 180 y no -180', () => {
  const sur = rumbo(41.7509, 2.15, 41.75, 2.15)
  assert.ok(sur > 179 && sur < 181, `era ${sur}`)
})

test('lejos no se pinta nada', () => {
  assert.deepEqual(guia(RADIO_GUIA_M + 1, 5, 0, 0), { fase: 'lejos' })
})

test('mirando al norte con la fuente al este, hay que girar 90 a la derecha', () => {
  assert.deepEqual(guia(80, 5, 0, 90), { fase: 'guiando', giro: 90 })
})

test('mirando al este con la fuente al norte, el giro es 270 y nunca negativo', () => {
  // Es el mismo giro que -90, pero un ángulo negativo rota la flecha al revés en CSS.
  assert.deepEqual(guia(80, 5, 90, 0), { fase: 'guiando', giro: 270 })
})

test('sin brújula se guía igual, pero sin flecha', () => {
  assert.deepEqual(guia(80, 5, null, 90), { fase: 'guiando', giro: null })
})

test('encima de la fuente no se apunta', () => {
  assert.deepEqual(guia(RADIO_LLEGADA_M - 1, 5, 0, 90), { fase: 'llegando' })
})

test('un GPS malo adelanta la llegada, porque su flecha sería ruido', () => {
  // A 30 m con ±40 m de margen, la dirección no es información: el punto azul puede
  // estar al otro lado de la fuente. Este es el caso del parque entre edificios.
  assert.deepEqual(guia(30, 40, 0, 90), { fase: 'llegando' })
  // El mismo sitio con un GPS bueno sí se puede apuntar.
  assert.deepEqual(guia(30, 5, 0, 90), { fase: 'guiando', giro: 90 })
})

test('sin margen declarado manda el suelo fijo, no un cero optimista', () => {
  assert.deepEqual(guia(RADIO_LLEGADA_M - 1, null, 0, 90), { fase: 'llegando' })
  assert.deepEqual(guia(RADIO_LLEGADA_M + 5, null, 0, 90), { fase: 'guiando', giro: 90 })
})

test('a 10 m con buena senal se SIGUE apuntando', () => {
  // Probado sobre el terreno: con el suelo en 15 la app decia «ya estas» a 15 m, que es
  // el ancho de una plaza y todavia no has visto la fuente. Ahora manda `accuracy`.
  assert.deepEqual(guia(10, 4, 0, 90), { fase: 'guiando', giro: 90 })
})

test('pero un GPS que declara mal margen sigue mandando sobre el suelo', () => {
  assert.deepEqual(guia(10, 12, 0, 90), { fase: 'llegando' })
})

test('una distancia imposible no rompe la pantalla', () => {
  assert.deepEqual(guia(NaN, 5, 0, 90), { fase: 'lejos' })
})
