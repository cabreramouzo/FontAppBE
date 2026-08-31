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

test('un GPS malo deja de apuntar, pero eso NO es haber llegado', () => {
  // **El fallo reportado desde el bosque**: bajo copa el móvil declara ±40 m, y con un
  // solo corte `max(suelo, precisión)` la app decía «ya estás» a treinta metros de la
  // fuente. Dejar de apuntar y haber llegado son dos cosas distintas.
  //
  // A 30 m con ±40 m la dirección no es información —el punto azul puede estar al otro
  // lado de la fuente— así que no se apunta; pero tampoco se ha llegado.
  assert.deepEqual(guia(30, 40, 0, 90), { fase: 'cerca', distanciaM: 30 })
  // El mismo sitio con un GPS bueno sí se puede apuntar.
  assert.deepEqual(guia(30, 5, 0, 90), { fase: 'guiando', giro: 90 })
})

test('llegar es una distancia real y no depende de lo que el GPS diga de sí mismo', () => {
  // Con mala señal sabes MENOS, así que hay que ser más prudente al afirmar que has
  // llegado, no menos. Estos dos van al mismo sitio con márgenes opuestos.
  assert.deepEqual(guia(3, 40, 0, 90), { fase: 'llegando' })
  assert.deepEqual(guia(3, 2, 0, 90), { fase: 'llegando' })
  // Y bajar el suelo no habría arreglado el caso del bosque: ahí el suelo no manda.
  assert.equal(guia(30, 40, 0, 90).fase, 'cerca')
})

test('sin margen declarado manda el suelo fijo, no un cero optimista', () => {
  assert.deepEqual(guia(RADIO_LLEGADA_M - 1, null, 0, 90), { fase: 'llegando' })
  assert.deepEqual(guia(RADIO_LLEGADA_M + 5, null, 0, 90), { fase: 'guiando', giro: 90 })
})

test('a 10 m con buena senal se SIGUE apuntando', () => {
  // Probado sobre el terreno: con el suelo en 15 la app decia «ya estas» a 15 m, que es
  // el ancho de una plaza y todavia no has visto la fuente.
  assert.deepEqual(guia(10, 4, 0, 90), { fase: 'guiando', giro: 90 })
})

test('a 10 m con margen de 12 no se apunta, pero se dice que estás cerca', () => {
  assert.deepEqual(guia(10, 12, 0, 90), { fase: 'cerca', distanciaM: 10 })
})

test('una distancia imposible no rompe la pantalla', () => {
  assert.deepEqual(guia(NaN, 5, 0, 90), { fase: 'lejos' })
})
