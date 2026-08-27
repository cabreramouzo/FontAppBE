import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { cercanasEn, dentroDe, type ZonaOffline } from '../src/lib/zonaOffline.ts'

/** Lo mínimo que mira el cálculo, más un id para poder afirmar el orden. */
interface Fuente { id: string; latitude: number; longitude: number }
const f = (id: string, latitude: number, longitude: number): Fuente => ({ id, latitude, longitude })

const zona: ZonaOffline<Fuente> = {
  minLat: 41.70, maxLat: 41.80, minLong: 2.10, maxLong: 2.25,
  cuando: '2026-08-27T00:00:00Z',
  fuentes: [
    f('lejos', 41.79, 2.24),
    f('cerca', 41.7505, 2.1605),
    f('media', 41.755, 2.165),
  ],
}

test('ordena por distancia, como haría el servidor', () => {
  assert.deepEqual(cercanasEn(zona, 41.75, 2.16).map((x) => x.id), ['cerca', 'media', 'lejos'])
})

test('respeta el tope pedido', () => {
  assert.equal(cercanasEn(zona, 41.75, 2.16, 2).length, 2)
})

test('fuera de la zona no devuelve NADA, en vez de mentir', () => {
  // Con la zona de Girona guardada y el móvil en Cádiz, sin esto saldrían las fuentes de
  // Girona ordenadas por distancia — todas a 900 km. Parece que funciona, y es lo peor.
  assert.deepEqual(cercanasEn(zona, 36.53, -6.29), [])
  assert.equal(dentroDe(zona, 36.53, -6.29), false)
})

test('los bordes de la caja cuentan como dentro', () => {
  assert.equal(dentroDe(zona, 41.70, 2.10), true)
  assert.equal(dentroDe(zona, 41.80, 2.25), true)
  assert.equal(dentroDe(zona, 41.8001, 2.25), false)
})

test('una zona sin fuentes no revienta', () => {
  assert.deepEqual(cercanasEn({ ...zona, fuentes: [] }, 41.75, 2.16), [])
})

test('la distancia es real y no una resta de grados', () => {
  // Un grado de longitud mide bastante menos que uno de latitud a 41°: comparando
  // coordenadas a pelo, la de al lado saldría más lejos que la de arriba.
  const z: ZonaOffline<Fuente> = { ...zona, fuentes: [f('norte', 41.7590, 2.1600), f('este', 41.7500, 2.1690)] }
  // «norte» está a 0,009° de latitud (~1,0 km) y «este» a 0,009° de longitud (~0,75 km).
  assert.deepEqual(cercanasEn(z, 41.75, 2.16).map((x) => x.id), ['este', 'norte'])
})
