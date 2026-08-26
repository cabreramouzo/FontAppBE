import assert from 'node:assert/strict'
import test from 'node:test'
import {
  debeVerNovedades, esNuevoParaTi, marcaDe, marcaNovedadesVistas,
  SESIONES_CON_DISTINTIVO, VERSION_NOVEDADES,
} from '../src/lib/whatsNew.ts'

function conAlmacen() {
  const datos = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => { datos.set(k, v) },
    removeItem: (k: string) => { datos.delete(k) },
  }
  return datos
}

test('a quien acaba de llegar NO se le cuentan novedades', () => {
  // Para el la app entera es nueva. Contarle «lo nuevo» le senala lo accesorio antes que
  // lo basico, y encima tiene el dialogo de bienvenida para eso.
  conAlmacen()
  assert.equal(debeVerNovedades('ana', false), false)
})

test('a quien ya usaba la app y no tiene marca SI', () => {
  // Es el caso de la primera vez que se publica esto: sin el, el aviso no se lo comeria
  // nadie nunca, porque nadie tiene marca todavia.
  conAlmacen()
  assert.equal(debeVerNovedades('ana', true), true)
})

test('quien ya las vio no las vuelve a ver', () => {
  conAlmacen()
  marcaNovedadesVistas('ana', 5)
  assert.equal(debeVerNovedades('ana', true), false)
  assert.equal(marcaDe('ana')?.v, VERSION_NOVEDADES)
})

test('quien vio una version anterior si ve las nuevas', () => {
  conAlmacen()
  marcaNovedadesVistas('ana', 5, VERSION_NOVEDADES - 1)
  assert.equal(debeVerNovedades('ana', true), true)
})

test('el distintivo «nuevo» no le sale a quien acaba de llegar', () => {
  // Sin marca no hay nada marcado como nuevo: para el lo es todo.
  conAlmacen()
  assert.equal(esNuevoParaTi('gpx', 'ana', 1), false)
})

test('el distintivo se enciende AL LEER las novedades, no antes', () => {
  // La primera version lo hacia al reves y por eso no lo veia nadie: quedaba detras del
  // modal y se apagaba en el mismo gesto que lo cerraba. Se descubrio probandolo.
  conAlmacen()
  marcaNovedadesVistas('ana', 5, VERSION_NOVEDADES - 1)
  assert.equal(esNuevoParaTi('gpx', 'ana', 5), false, 'aun no las ha leido')
  marcaNovedadesVistas('ana', 5)
  assert.equal(esNuevoParaTi('gpx', 'ana', 5), true, 'ya las ha leido: ahora se le ensena donde')
})

test('y dura unas cuantas visitas SUYAS, no unos dias', () => {
  conAlmacen()
  marcaNovedadesVistas('ana', 5)
  assert.equal(esNuevoParaTi('gpx', 'ana', 5 + SESIONES_CON_DISTINTIVO), true, 'la ultima que cuenta')
  assert.equal(esNuevoParaTi('gpx', 'ana', 5 + SESIONES_CON_DISTINTIVO + 1), false)
})

test('una clave que ya no existe no deja un distintivo puesto para siempre', () => {
  conAlmacen()
  marcaNovedadesVistas('ana', 5)
  assert.equal(esNuevoParaTi('algo-que-se-borro', 'ana', 5), false)
})

test('cada cuenta lleva su propia marca', () => {
  conAlmacen()
  marcaNovedadesVistas('ana', 5)
  assert.equal(debeVerNovedades('ana', true), false)
  assert.equal(debeVerNovedades('bruno', true), true)
})

test('basura en el almacenamiento se trata como «sin marca»', () => {
  const datos = conAlmacen()
  datos.set('news:seen:v1:ana', 'no soy un numero')
  assert.equal(marcaDe('ana'), null)
  assert.equal(debeVerNovedades('ana', false), false, 'y sin marca, a un recien llegado no')
})
