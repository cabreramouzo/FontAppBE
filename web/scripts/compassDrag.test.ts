import assert from 'node:assert/strict'
import test from 'node:test'
import { anguloPuntero, bearingArrastrando, esArrastre, cardinalArriba } from '../src/lib/compassDrag.ts'

/**
 * Girar el mapa arrastrando la brújula (escritorio). Trigonometría con casos límite que
 * fallan en silencio: el sentido del giro en una pantalla con la Y hacia abajo, y el salto
 * por 360°.
 */

test('el ángulo crece en sentido horario (Y de pantalla hacia abajo)', () => {
  // Centro (0,0). A la derecha = 0; abajo = +90 (horario en pantalla); arriba = -90.
  assert.equal(anguloPuntero(0, 0, 10, 0), 0)
  assert.equal(anguloPuntero(0, 0, 0, 10), 90)
  assert.equal(anguloPuntero(0, 0, 0, -10), -90)
  assert.equal(Math.abs(anguloPuntero(0, 0, -10, 0)), 180)
})

test('agarre relativo: sin mover, el bearing no cambia (no hay salto al empezar)', () => {
  assert.equal(bearingArrastrando(37, 120, 120), 37)
  assert.equal(bearingArrastrando(0, -90, -90), 0)
})

test('gira lo mismo que el puntero: +30° de puntero, +30° de bearing', () => {
  assert.equal(bearingArrastrando(10, 0, 30), 40)
  assert.equal(bearingArrastrando(350, 0, 30), 20) // envuelve por 360, no da 380
})

test('envuelve por los dos lados', () => {
  assert.equal(bearingArrastrando(10, 30, 0), 340)   // -20 -> 340
  assert.equal(bearingArrastrando(0, 170, -170), 20) // el puntero cruza 180: +20 neto
})

test('clic vs arrastre por umbral', () => {
  assert.equal(esArrastre(0, 0), false)
  assert.equal(esArrastre(2, 2), false)      // ~2.8 px, tembleque de clic
  assert.equal(esArrastre(4, 0), true)
  assert.equal(esArrastre(0, 10), true)
})

test('la letra dice qué cardinal está arriba (arriba = 360 - bearing)', () => {
  assert.equal(cardinalArriba(0), 'N')     // norte arriba
  assert.equal(cardinalArriba(90), 'W')    // el mapa girado a bearing 90 deja el oeste arriba
  assert.equal(cardinalArriba(180), 'S')
  assert.equal(cardinalArriba(270), 'E')
})

test('la letra redondea al cardinal más cercano y envuelve', () => {
  assert.equal(cardinalArriba(30), 'N')    // arriba 330, más cerca de N
  assert.equal(cardinalArriba(100), 'W')   // arriba 260, más cerca de W (270)
  assert.equal(cardinalArriba(360), 'N')   // 360 -> arriba 0 -> N, no un índice fuera de rango
  assert.equal(cardinalArriba(-90), 'E')   // bearing negativo normaliza igual
})
