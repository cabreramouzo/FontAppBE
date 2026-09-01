import test from 'node:test'
import assert from 'node:assert/strict'
import { abrePorRol, motivosDe, requisitosGenerales } from '../src/lib/capabilityBlockers.ts'
import type { Capacidad, Informe } from '../src/lib/capabilityBlockers.ts'

const sano: Informe = {
  activeDays: 20, requiredActiveDays: 8, blockedBy: [], gamificationOptOut: false,
  postingRestrictedUntil: null, capabilitiesEnabled: true, definitivePoints: true,
}
const foto: Capacidad = { key: 'addSecondaryPhoto', level: 'brook', missingGotes: 0, requiresDefinitivePoints: false }
const mover: Capacidad = { key: 'relocateAnyFont', level: 'stream', missingGotes: 0, requiresDefinitivePoints: true }

test('el caso reportado: gotas de sobra y pocos días, y AHORA se dice', () => {
  const r = { ...sano, activeDays: 2, blockedBy: ['activeDays'] }
  assert.deepEqual(motivosDe(foto, r), [{ clave: 'days', faltan: 6 }])
})

test('sin nada general fallando, el motivo son las gotas de su nivel', () => {
  const alto = { ...foto, level: 'waterfall', missingGotes: 3050 }
  assert.deepEqual(motivosDe(alto, sano), [{ clave: 'gotes', level: 'waterfall', faltan: 3050 }])
})

test('las dos puertas se dicen, no solo la primera', () => {
  // Enseñando solo la primera, la capacidad más alta decía «le faltan 6 días» y se
  // callaba las 3.050 gotas: quien lo lea concluye que en seis días la tendrá.
  const r = { ...sano, activeDays: 2, blockedBy: ['activeDays'] }
  const alto = { ...foto, level: 'waterfall', missingGotes: 3050 }
  assert.deepEqual(motivosDe(alto, r), [
    { clave: 'days', faltan: 6 },
    { clave: 'gotes', level: 'waterfall', faltan: 3050 },
  ])
})

test('los puntos provisionales solo cierran las que destruyen trabajo ajeno', () => {
  const r = { ...sano, definitivePoints: false }
  assert.deepEqual(motivosDe(mover, r), [{ clave: 'provisional' }])
  // La foto es aditiva: con puntos provisionales sigue abierta, así que su motivo no
  // puede ser la época. Cruzar esto es el error fácil.
  assert.deepEqual(motivosDe(foto, r), [])
})

test('manda lo que hay que arreglar primero, no lo más llamativo', () => {
  // Con las aportaciones restringidas, decirle «le faltan 3.050 gotas» manda a trabajar
  // en lo que no toca.
  const r = { ...sano, activeDays: 1, postingRestrictedUntil: '2030-01-01T00:00:00Z' }
  assert.equal(motivosDe({ ...foto, missingGotes: 3050 }, r)[0].clave, 'restricted')
})

test('el sistema apagado gana a todo: no dice nada de esta persona', () => {
  assert.equal(motivosDe(foto, { ...sano, capabilitiesEnabled: false, activeDays: 0 })[0].clave, 'systemOff')
})

test('los requisitos generales llevan los números de los días', () => {
  const req = requisitosGenerales({ ...sano, activeDays: 3 })
  const dias = req.find((x) => x.clave === 'days')
  assert.equal(dias?.cumple, false)
  assert.deepEqual(dias?.detalle, { have: 3, need: 8 })
})

test('los puntos definitivos no se listan como requisito general cuando lo son', () => {
  assert.ok(!requisitosGenerales(sano).some((x) => x.clave === 'definitive'))
  assert.ok(requisitosGenerales({ ...sano, definitivePoints: false }).some((x) => x.clave === 'definitive'))
})

test('a un admin el rol se lo abre todo, así que los requisitos no aplican', () => {
  // Sin esto el panel enseñaba siete chips verdes junto a «✗ 0 de 8 días»: dos verdades
  // que juntas se leen como una contradicción.
  assert.equal(abrePorRol('admin'), true)
  assert.equal(abrePorRol('owner'), true)
  assert.equal(abrePorRol('moderator'), false, 'moderar es sobre personas, no sobre el mapa')
  assert.equal(abrePorRol('user'), false)
})
