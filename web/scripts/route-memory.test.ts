import assert from 'node:assert/strict'
import test from 'node:test'
import {
  diasDesde, MAX_PUNTOS, olvidaRuta, recuerdaRuta, rutaRecordada,
} from '../src/lib/routeMemory.ts'

function conAlmacen() {
  const datos = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => { datos.set(k, v) },
    removeItem: (k: string) => { datos.delete(k) },
  }
  return datos
}

const RUTA = {
  nombre: 'Volta pel Moianes',
  cuando: '2026-08-20T09:00:00.000Z',
  puntos: [{ lat: 41.75, lon: 2.15, ele: 700 }, { lat: 41.75, lon: 2.16, ele: 720 }],
}

test('la ruta vuelve tal cual, que es lo que evita tener que buscar el fichero otra vez', () => {
  conAlmacen()
  recuerdaRuta(RUTA, 'ana')
  assert.deepEqual(rutaRecordada('ana'), RUTA)
})

test('cada cuenta recuerda la suya: en un movil prestado no sale la ruta del otro', () => {
  conAlmacen()
  recuerdaRuta(RUTA, 'ana')
  assert.equal(rutaRecordada('bruno'), null)
  assert.equal(rutaRecordada('anonymous'), null)
})

test('olvidar la borra de verdad', () => {
  conAlmacen()
  recuerdaRuta(RUTA, 'ana')
  olvidaRuta('ana')
  assert.equal(rutaRecordada('ana'), null)
})

test('una ruta larguisima se recorta en vez de llenar el almacenamiento', () => {
  // localStorage lo comparte con la bandeja de salida, que guarda aportaciones SIN enviar:
  // eso es lo unico aqui que no se puede perder.
  conAlmacen()
  const larga = { ...RUTA, puntos: Array.from({ length: MAX_PUNTOS + 500 }, (_, i) => ({ lat: 41 + i / 100000, lon: 2, ele: null })) }
  recuerdaRuta(larga, 'ana')
  assert.equal(rutaRecordada('ana')?.puntos.length, MAX_PUNTOS)
})

test('si el almacenamiento esta lleno se dice que no, y no revienta la pantalla', () => {
  conAlmacen()
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceeded') }
  assert.equal(recuerdaRuta(RUTA, 'ana'), false)
})

test('basura guardada no se convierte en una ruta imposible', () => {
  const datos = conAlmacen()
  datos.set('route:last:v1:ana', 'esto no es JSON')
  assert.equal(rutaRecordada('ana'), null)
  datos.set('route:last:v1:ana', JSON.stringify({ nombre: 'x', cuando: '2026-08-20T09:00:00Z', puntos: [] }))
  assert.equal(rutaRecordada('ana'), null, 'una ruta de cero puntos no es una ruta')
})

test('un punto con coordenadas de mentira se descarta antes de hacer cuentas con el', () => {
  // Un lat en texto no da error: da distancias absurdas mucho despues, y entonces el
  // fallo parece del calculo y no del dato.
  const datos = conAlmacen()
  datos.set('route:last:v1:ana', JSON.stringify({
    ...RUTA,
    puntos: [...RUTA.puntos, { lat: '41.75', lon: 2.15, ele: null }, { lat: 999, lon: 0, ele: null }],
  }))
  assert.equal(rutaRecordada('ana')?.puntos.length, 2)
})

test('los dias se cuentan hacia atras y nunca salen negativos', () => {
  const ahora = Date.parse('2026-08-26T09:00:00Z')
  assert.equal(diasDesde('2026-08-24T09:00:00Z', ahora), 2)
  assert.equal(diasDesde('2026-08-26T08:00:00Z', ahora), 0)
  assert.equal(diasDesde('2026-09-01T00:00:00Z', ahora), 0, 'un reloj mal puesto no da -6 dias')
})
