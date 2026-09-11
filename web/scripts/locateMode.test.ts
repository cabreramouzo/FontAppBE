import assert from 'node:assert/strict'
import test from 'node:test'
import {
  modoTrasToque,
  MODO_TRAS_GESTO,
  sigueUbicacion,
  orientaAlRumbo,
  botonRelleno,
  iconoDeModo,
  anguloConoEnPantalla,
  bearingRumboArriba,
  type ModoUbicacion,
} from '../src/lib/locateMode.ts'

/**
 * El botón de ubicación de tres estados de Mapas de iOS. Todo lo que se prueba aquí falla
 * en silencio en un test de humo y solo se nota andando: el ciclo, qué modo te sigue, y
 * sobre todo que «rumbo arriba» deje el cono recto — un signo cambiado lo gira 90°/180° y
 * el test de humo pasa igual.
 */

test('tres toques desde libre dan los tres estados en orden, como iOS', () => {
  // Es la secuencia de las tres capturas del usuario: hueca → rellena → navegación.
  let m: ModoUbicacion = 'off'
  m = modoTrasToque(m); assert.equal(m, 'follow')
  m = modoTrasToque(m); assert.equal(m, 'heading')
})

test('a partir de seguir, el botón alterna follow ↔ heading y NUNCA cae en off', () => {
  // Salir del seguimiento es cosa de mover el mapa, no del botón: un toque no puede
  // dejarte sin seguir, o el estado sería inalcanzable a mano.
  let m: ModoUbicacion = 'heading'
  for (let i = 0; i < 6; i++) {
    m = modoTrasToque(m)
    assert.notEqual(m, 'off')
  }
  assert.equal(modoTrasToque('heading'), 'follow')
  assert.equal(modoTrasToque('follow'), 'heading')
})

test('mover el mapa suelta el seguimiento (vuelve a off)', () => {
  assert.equal(MODO_TRAS_GESTO, 'off')
})

test('sigue tu posición en follow y heading, no en off', () => {
  assert.equal(sigueUbicacion('off'), false)
  assert.equal(sigueUbicacion('follow'), true)
  assert.equal(sigueUbicacion('heading'), true)
})

test('solo heading orienta el mapa a tu rumbo', () => {
  assert.equal(orientaAlRumbo('off'), false)
  assert.equal(orientaAlRumbo('follow'), false)
  assert.equal(orientaAlRumbo('heading'), true)
})

test('el botón se rellena en cuanto te sigue', () => {
  assert.equal(botonRelleno('off'), false)
  assert.equal(botonRelleno('follow'), true)
  assert.equal(botonRelleno('heading'), true)
})

test('cada estado tiene su icono: hueca, rellena, navegación', () => {
  assert.equal(iconoDeModo('off'), 'hollow')
  assert.equal(iconoDeModo('follow'), 'filled')
  assert.equal(iconoDeModo('heading'), 'navigation')
})

test('con el mapa sin girar, el cono apunta a tu rumbo', () => {
  assert.equal(anguloConoEnPantalla(0, 0), 0)     // norte, arriba
  assert.equal(anguloConoEnPantalla(90, 0), 90)   // este, a la derecha
  assert.equal(anguloConoEnPantalla(270, 0), 270) // oeste, a la izquierda
})

test('con el mapa girado, el cono descuenta el giro y sigue apuntando al rumbo real', () => {
  // Sin descontar `bearing`, el cono apuntaría al norte de la PANTALLA y no al real.
  assert.equal(anguloConoEnPantalla(90, 90), 0)   // mapa mirando al este: el este va arriba
  assert.equal(anguloConoEnPantalla(0, 90), 270)  // norte real queda a la izquierda
  assert.equal(anguloConoEnPantalla(10, 350), 20) // envuelve por 360, no da -340
})

test('rumbo arriba: el giro elegido deja el cono recto (0) para cualquier rumbo', () => {
  // La invariante que sostiene el modo heading: girar el mapa a `bearingRumboArriba` y
  // pintar el cono a `heading - bearing` tiene que dar 0. Un signo cambiado en cualquiera
  // de las dos fórmulas rompe esto — y solo esto, porque el resto compila igual.
  for (const heading of [0, 1, 37, 90, 180, 233, 359, 360, 725, -30]) {
    const bearing = bearingRumboArriba(heading)
    assert.equal(anguloConoEnPantalla(heading, bearing), 0, `rumbo ${heading}`)
  }
})

test('bearingRumboArriba normaliza a [0, 360)', () => {
  assert.equal(bearingRumboArriba(0), 0)
  assert.equal(bearingRumboArriba(370), 10)
  assert.equal(bearingRumboArriba(-30), 330)
})
