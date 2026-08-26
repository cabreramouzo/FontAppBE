import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { coordenadaEnKm, kilometrajes, largoKm, type PuntoRuta } from '../src/lib/gpxImport.ts'

/** Un tramo recto hacia el este por el ecuador: fácil de razonar a mano. */
const recta: PuntoRuta[] = [
  { lat: 0, lon: 0, ele: null },
  { lat: 0, lon: 0.1, ele: null },
  { lat: 0, lon: 0.2, ele: null },
]

test('el kilometraje empieza en cero y acaba en el largo total', () => {
  const kms = kilometrajes(recta)
  assert.equal(kms[0], 0)
  // El mismo haversine que `largoKm`, o el punto del mapa se separaría del del perfil.
  assert.ok(Math.abs(kms[kms.length - 1] - largoKm(recta)) < 1e-9)
})

test('interpola entre vértices en vez de saltar al más cercano', () => {
  const kms = kilometrajes(recta)
  const mitadDelPrimerTramo = kms[1] / 2
  const p = coordenadaEnKm(recta, kms, mitadDelPrimerTramo)
  // Justo en medio: si devolviera el vértice más cercano saldría 0 o 0.1, no 0.05.
  assert.ok(p !== null && Math.abs(p.lon - 0.05) < 1e-6, `esperaba lon≈0,05 y salió ${p?.lon}`)
})

test('fuera de rango se queda en los extremos y nunca devuelve NaN', () => {
  const kms = kilometrajes(recta)
  assert.deepEqual(coordenadaEnKm(recta, kms, -5), { lat: 0, lon: 0 })
  assert.deepEqual(coordenadaEnKm(recta, kms, 9999), { lat: 0, lon: 0.2 })
})

test('un recorrido con puntos repetidos nunca devuelve NaN', () => {
  // Los grabadores parados dejan el mismo punto repetido, y eso crea tramos de longitud
  // cero. Se barre el recorrido entero en vez de mirar un kilómetro suelto.
  //
  // AVISO: esto NO cubre la guarda `tramo > 0` de `coordenadaEnKm`. Al intentar
  // provocarla se ve que hoy es inalcanzable — los cortes de los extremos atrapan el caso
  // de «todo el recorrido en el mismo punto», y con duplicados en medio la bisección
  // empuja `lo` más allá de los valores iguales. La guarda se queda como red por si algún
  // día se tocan esos cortes, pero que quede escrito que ningún test la protege.
  const repetido: PuntoRuta[] = [
    { lat: 41, lon: 2, ele: null },
    { lat: 41, lon: 2, ele: null },
    { lat: 41, lon: 2.01, ele: null },
    { lat: 41, lon: 2.01, ele: null },
    { lat: 41.01, lon: 2.02, ele: null },
  ]
  const kms = kilometrajes(repetido)
  const total = kms[kms.length - 1]
  for (let i = 0; i <= 50; i += 1) {
    const p = coordenadaEnKm(repetido, kms, (total * i) / 50)
    assert.ok(p !== null && Number.isFinite(p.lat) && Number.isFinite(p.lon), `NaN en el paso ${i}`)
  }
})

test('una ruta vacía o de un solo punto no revienta', () => {
  assert.equal(coordenadaEnKm([], [], 1), null)
  const uno: PuntoRuta[] = [{ lat: 41, lon: 2, ele: null }]
  assert.deepEqual(coordenadaEnKm(uno, kilometrajes(uno), 1), { lat: 41, lon: 2 })
})

test('avanza monótonamente a lo largo del recorrido', () => {
  // Lo que se ve al arrastrar: el punto no puede retroceder si el dedo avanza.
  const kms = kilometrajes(recta)
  let previo = -1
  for (let i = 0; i <= 20; i += 1) {
    const p = coordenadaEnKm(recta, kms, (kms[kms.length - 1] * i) / 20)
    assert.ok(p !== null && p.lon >= previo, `retrocedió en el paso ${i}`)
    previo = p.lon
  }
})
