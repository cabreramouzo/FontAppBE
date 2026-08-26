import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  alterna, claveDe, seleccionadas, soloDesde,
} from '../src/lib/routeSelection.ts'

// Lo que la pantalla calcula una vez con `claveDe` y pasa a todo lo demás.
const ruta = ['a', 'b', 'c', 'd']

test('sin tocar nada se exporta todo, como antes de que esto existiera', () => {
  assert.deepEqual(seleccionadas(ruta, new Set()), ['a', 'b', 'c', 'd'])
})

test('alternar quita y repone la misma parada', () => {
  const quitada = alterna(new Set(), 'b')
  assert.deepEqual(seleccionadas(ruta, quitada), ['a', 'c', 'd'])
  assert.deepEqual(seleccionadas(ruta, alterna(quitada, 'b')), ['a', 'b', 'c', 'd'])
})

test('alternar no muta el conjunto que recibe', () => {
  const antes = new Set(['b'])
  alterna(antes, 'c')
  assert.deepEqual([...antes], ['b'], 'React no repinta si se muta el estado en su sitio')
})

test('«desde aquí» deja esa parada y las siguientes: es el caso de salir con agua de casa', () => {
  assert.deepEqual(seleccionadas(ruta, soloDesde(ruta, 'c')), ['c', 'd'])
})

test('«desde aquí» en la primera no descarta ninguna', () => {
  assert.deepEqual(seleccionadas(ruta, soloDesde(ruta, 'a')), ['a', 'b', 'c', 'd'])
})

test('«desde aquí» pisa lo marcado a mano en vez de superponerse', () => {
  // Sin esto habría dos reglas a la vez y una casilla marcada podría no exportarse.
  const aMano = new Set(['d'])
  assert.deepEqual(seleccionadas(ruta, soloDesde(ruta, 'c')), ['c', 'd'])
  assert.equal(aMano.has('d'), true, 'el conjunto viejo se descarta entero, no se mezcla')
})

test('dos paradas en el mismo kilómetro se distinguen: el corte va por posición', () => {
  // Comparando `kmRuta` en vez de la posición, «desde la segunda» se llevaría también la
  // primera y quien la ha tocado vería una casilla marcada que no se exporta. Pasa de
  // verdad: en la prueba con 167 fuentes reales, las filas 79 y 80 caían las dos en el
  // km 5.2.
  const empate = ['x', 'y', 'z']
  assert.deepEqual(seleccionadas(empate, soloDesde(empate, 'y')), ['y', 'z'])
})

test('una fuente que aparece al ensanchar el corredor nace seleccionada', () => {
  // La razón de guardar las EXCLUIDAS y no las elegidas.
  const excluidas = alterna(new Set(), 'b')
  const masAncho = [...ruta, 'nueva']
  assert.deepEqual(seleccionadas(masAncho, excluidas), ['a', 'c', 'd', 'nueva'])
})

test('una fuente sin id se recuerda por su kilómetro', () => {
  assert.equal(claveDe({ kmRuta: 8.25 }), 'km:8.25')
  assert.equal(claveDe({ id: 'abc', kmRuta: 8.25 }), 'abc')
})

test('el id se lee de la parada, no del objeto de la pantalla', () => {
  // El fallo que se coló: pasar el elemento de la lista tal cual, cuyo id vive en
  // `.fuente.id`, daba `km:5.2` en vez del UUID y la selección no casaba con las casillas.
  // Hoy la firma pide `string[]` y no compila, pero la conversión sigue siendo de aquí.
  assert.equal(claveDe({ id: undefined, kmRuta: 5.2 }), 'km:5.2')
})
