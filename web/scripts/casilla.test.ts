import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { casillaDe } from '../src/lib/casilla.ts'

test('la clave y las coordenadas de la URL salen de la misma cuenta', () => {
  // Éste es el fallo que había: una cosa decidía cuándo pedir y otra qué pedir.
  const c = casillaDe(41.7512834, 2.1634091)
  assert.equal(c.clave, `${c.lat},${c.long}`)
})

test('moverse dentro de la casilla no cambia la URL', () => {
  // Lo que hace que la caché acierte: 30 m de paseo no generan una petición nueva.
  const a = casillaDe(41.7512, 2.1634)
  const b = casillaDe(41.75126, 2.16344)
  assert.deepEqual(a, b)
})

test('cambiar de casilla sí cambia la URL', () => {
  assert.notEqual(casillaDe(41.7512, 2.1634).clave, casillaDe(41.7522, 2.1634).clave)
})

test('el cero negativo no crea dos casillas para el mismo sitio', () => {
  // Sin normalizar, `(-0.0004).toFixed(3)` da «-0.000» y `(0.0004).toFixed(3)` da «0.000»:
  // dos entradas de caché y dos consultas al servidor para la misma pregunta.
  assert.equal(casillaDe(0, -0.0004).long, '0.000')
  assert.equal(casillaDe(-0.0004, 0).lat, '0.000')
})

test('las coordenadas negativas se redondean bien', () => {
  const c = casillaDe(40.41678, -3.70379)
  assert.equal(c.lat, '40.417')
  assert.equal(c.long, '-3.704')
})

test('siempre tres decimales, para que la URL sea idéntica carácter a carácter', () => {
  // «2.1» y «2.100» son el mismo número y URLs distintas: el caché no las une.
  assert.equal(casillaDe(41, 2).lat, '41.000')
  assert.equal(casillaDe(41, 2).long, '2.000')
})
