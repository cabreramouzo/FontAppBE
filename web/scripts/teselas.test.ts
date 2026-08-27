import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { estimaMBTeselas, teselasDe, urlDeTesela } from '../src/lib/teselas.ts'

const moianes = { minLat: 41.74, maxLat: 41.76, minLong: 2.15, maxLong: 2.18 }

test('la tesela de un punto conocido es la de siempre', () => {
  // Comprobado contra la fórmula estándar de la slippy map: 41,75 / 2,16 a z13.
  const [t] = teselasDe({ minLat: 41.75, maxLat: 41.75, minLong: 2.16, maxLong: 2.16 }, 13, 1)
  assert.deepEqual(t, { z: 13, x: 4145, y: 3048 })
})

test('las filas crecen hacia el SUR, no al revés', () => {
  // Copiar aquí la fórmula de la longitud es el error clásico y da un mapa desplazado que
  // solo se nota lejos del ecuador. Con `maxLat` arriba, la fila tiene que ser la MENOR.
  const norte = teselasDe({ minLat: 41.80, maxLat: 41.80, minLong: 2.16, maxLong: 2.16 }, 13, 1)[0]
  const sur = teselasDe({ minLat: 41.70, maxLat: 41.70, minLong: 2.16, maxLong: 2.16 }, 13, 1)[0]
  assert.ok(norte.y < sur.y, `el norte debería tener la fila menor: ${norte.y} vs ${sur.y}`)
})

test('cubre la caja entera y no solo una esquina', () => {
  const ts = teselasDe(moianes, 13, 1)
  const xs = ts.map((t) => t.x)
  const ys = ts.map((t) => t.y)
  const esquinaNO = teselasDe({ ...moianes, minLat: moianes.maxLat, maxLong: moianes.minLong }, 13, 1)[0]
  const esquinaSE = teselasDe({ ...moianes, maxLat: moianes.minLat, minLong: moianes.maxLong }, 13, 1)[0]
  assert.ok(Math.min(...xs) <= esquinaNO.x && Math.max(...xs) >= esquinaSE.x)
  assert.ok(Math.min(...ys) <= esquinaNO.y && Math.max(...ys) >= esquinaSE.y)
})

test('un nivel más cuesta cuatro veces, y por eso el techo son dos', () => {
  // Medido sobre esta caja: 2 → 8 → 20. No es exactamente ×4 porque la caja es pequeña
  // y las teselas del nivel de abajo caen a caballo de los bordes, pero el orden es ése:
  // por eso el techo son dos niveles y no tres.
  assert.equal(teselasDe(moianes, 13, 1).length, 2)
  assert.equal(teselasDe(moianes, 13, 2).length, 8)
  assert.equal(teselasDe(moianes, 13, 3).length, 20)
})

test('no se sale del mundo en los polos ni con zoom absurdo', () => {
  for (const t of teselasDe({ minLat: -89, maxLat: 89, minLong: -179, maxLong: 179 }, 3, 1)) {
    assert.ok(t.x >= 0 && t.x < 8 && t.y >= 0 && t.y < 8, `fuera del mundo: ${JSON.stringify(t)}`)
  }
  assert.deepEqual(teselasDe(moianes, 99, 1), [])
})

test('la URL sale idéntica a la que pedirá el mapa', () => {
  // Si el subdominio bailara, sería otra clave de caché y no acertaría NUNCA: el mismo
  // fallo que ya tuvimos con las coordenadas sin redondear.
  const plantilla = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  const u = urlDeTesela(plantilla, { z: 13, x: 4145, y: 3048 })
  assert.equal(u, 'https://a.tile.openstreetmap.org/13/4145/3048.png')
  assert.equal(u, urlDeTesela(plantilla, { z: 13, x: 4145, y: 3048 }))
})

test('una plantilla sin {s} se deja tal cual', () => {
  assert.equal(
    urlDeTesela('https://tile.opentopomap.org/{z}/{x}/{y}.png', { z: 5, x: 1, y: 2 }),
    'https://tile.opentopomap.org/5/1/2.png',
  )
})

test('la estimación sale de los pesos medidos, no de un número a ojo', () => {
  // Medido sobre OSM: 18 KB a z10, 5,6 a z13, 2,8 a z15 → 6 KB de media.
  assert.equal(estimaMBTeselas(0), '0.0')
  assert.equal(estimaMBTeselas(170), '1.0')
})
