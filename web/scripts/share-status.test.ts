import assert from 'node:assert/strict'
import { test } from 'node:test'
import { estadoTarjeta, frescuraRelativa, STATUS_META } from '../functions/_meta.ts'

const AHORA = Date.parse('2026-09-14T12:00:00Z')
const haceDias = (n: number) => new Date(AHORA - n * 86_400_000).toISOString()

test('la frescura relativa corta hoy/ayer/días/meses', () => {
  assert.equal(frescuraRelativa(haceDias(0), 'es', AHORA), 'hoy')
  assert.equal(frescuraRelativa(haceDias(1), 'es', AHORA), 'ayer')
  assert.equal(frescuraRelativa(haceDias(2), 'es', AHORA), 'hace 2 días')
  assert.equal(frescuraRelativa(haceDias(59), 'es', AHORA), 'hace 59 días')
  // A partir de 60 días pasa a meses (60/30 = 2).
  assert.equal(frescuraRelativa(haceDias(60), 'es', AHORA), 'hace 2 meses')
})

test('una fecha inválida no inventa una frescura', () => {
  assert.equal(frescuraRelativa('no-es-fecha', 'es', AHORA), '')
})

test('el estado lidera con emoji, etiqueta y frescura', () => {
  assert.equal(
    estadoTarjeta({ lastWaterStatus: 'flowing', lastUpdate: haceDias(2), statusConflict: false }, 'es', AHORA),
    '💧 Sale agua · hace 2 días',
  )
  assert.equal(
    estadoTarjeta({ lastWaterStatus: 'dry', lastUpdate: haceDias(1), statusConflict: false }, 'ca', AHORA),
    '🚱 Seca · ahir',
  )
})

test('el conflicto manda sobre el último parte', () => {
  assert.equal(
    estadoTarjeta({ lastWaterStatus: 'flowing', lastUpdate: haceDias(1), statusConflict: true }, 'es', AHORA),
    '⚠️ Datos contradictorios',
  )
})

test('sin parte, o con «unknown», es «sin comprobar» y sin fecha', () => {
  assert.equal(
    estadoTarjeta({ lastWaterStatus: null, lastUpdate: null, statusConflict: false }, 'es', AHORA),
    'Sin comprobar todavía',
  )
  // `unknown` (alguien miró y no supo) NO arrastra fecha: «sin comprobar · hace 2 días»
  // sería contradictorio.
  assert.equal(
    estadoTarjeta({ lastWaterStatus: 'unknown', lastUpdate: haceDias(2), statusConflict: false }, 'es', AHORA),
    'Sin comprobar todavía',
  )
})

test('los ocho idiomas tienen las etiquetas de estado y frescura', () => {
  for (const lang of Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]) {
    const m = STATUS_META[lang]
    for (const k of ['flowing', 'trickle', 'dry', 'broken', 'gone', 'conflict', 'unchecked', 'today', 'yesterday'] as const) {
      assert.ok(m[k]?.trim(), `${lang}.${k}`)
    }
    assert.ok(m.days.includes('{n}'), `${lang}.days lleva {n}`)
    assert.ok(m.months.includes('{n}'), `${lang}.months lleva {n}`)
  }
})
