import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideNavegando, velocidadMs, rumboEntre, VEL_NAV_ON, VEL_NAV_OFF } from '../src/lib/navMode.ts'

test('sin rumbo válido nunca hay flecha, por rápido que vayas', () => {
  assert.equal(decideNavegando(30, null, false), false)
  assert.equal(decideNavegando(30, null, true), false)
})

test('histéresis: enciende por encima de ON, no por debajo', () => {
  assert.equal(decideNavegando(VEL_NAV_ON + 0.1, 90, false), true)
  assert.equal(decideNavegando(VEL_NAV_ON - 0.1, 90, false), false)
})

test('histéresis: una vez encendido aguanta hasta bajar de OFF', () => {
  // Entre OFF y ON, encendido se queda encendido (no parpadea en un semáforo lento).
  assert.equal(decideNavegando((VEL_NAV_ON + VEL_NAV_OFF) / 2, 90, true), true)
  assert.equal(decideNavegando(VEL_NAV_OFF - 0.1, 90, true), false)
})

test('velocidad: la del GPS manda; si no, la media del tramo', () => {
  assert.equal(velocidadMs(12, 999, 1), 12)
  assert.equal(velocidadMs(null, 30, 3), 10)
  assert.equal(velocidadMs(NaN, 30, 3), 10)
  assert.equal(velocidadMs(-1, 30, 3), 10) // negativa = no disponible
  assert.equal(velocidadMs(null, 30, 0), 0)
})

test('rumbo: norte y este bien orientados', () => {
  // Moverse al norte (misma longitud, más latitud) → ~0°.
  const norte = rumboEntre([41.0, 2.0], [41.01, 2.0])!
  assert.ok(norte < 5 || norte > 355, `norte=${norte}`)
  // Moverse al este → ~90°.
  const este = rumboEntre([41.0, 2.0], [41.0, 2.01])!
  assert.ok(Math.abs(este - 90) < 5, `este=${este}`)
})

test('rumbo: null si el movimiento es menor que el mínimo (temblor del GPS)', () => {
  // ~1 m de desplazamiento: por debajo de los 8 m, no hay rumbo.
  assert.equal(rumboEntre([41.0, 2.0], [41.00001, 2.0]), null)
})
