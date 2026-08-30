import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accionRapida, DIAS_PARA_CONFIRMAR } from '../src/lib/quickReview.ts'

const AHORA = Date.parse('2026-08-30T12:00:00Z')
const haceDias = (d: number) => new Date(AHORA - d * 86_400_000).toISOString()

const base = {
  estado: 'flowing',
  lastWaterStatus: 'flowing',
  lastCommentID: 'c1',
  lastReportAt: haceDias(0),
}

test('el mismo estado sobre un parte reciente confirma en vez de repetirlo', () => {
  assert.deepEqual(accionRapida(base, AHORA), { tipo: 'confirmar', commentID: 'c1' })
})

test('decir otra cosa siempre es un parte nuevo, por reciente que sea el anterior', () => {
  // Un desacuerdo no se puede colar como respaldo: es justo la contradicción que
  // `confidenceOf` tiene que poder ver.
  assert.deepEqual(accionRapida({ ...base, estado: 'dry' }, AHORA), { tipo: 'resena' })
})

test('el corte va donde acaba el tramo plano de la curva de frescura', () => {
  // Dentro: repetir paga 5 gotas y confirmar 10, así que confirmar es mejor señal y mejor
  // pagado. Fuera: la curva sube hasta 70 por una fuente olvidada, y convertir eso en una
  // confirmación de 10 sería degradar la aportación que más paga la app.
  assert.equal(accionRapida({ ...base, lastReportAt: haceDias(DIAS_PARA_CONFIRMAR) }, AHORA).tipo, 'confirmar')
  assert.equal(accionRapida({ ...base, lastReportAt: haceDias(DIAS_PARA_CONFIRMAR + 1) }, AHORA).tipo, 'resena')
})

test('sin parte anterior identificado no hay nada que confirmar', () => {
  assert.equal(accionRapida({ ...base, lastCommentID: null }, AHORA).tipo, 'resena')
  assert.equal(accionRapida({ ...base, lastWaterStatus: null }, AHORA).tipo, 'resena')
  assert.equal(accionRapida({ ...base, lastReportAt: null }, AHORA).tipo, 'resena')
})

test('una fecha ilegible o futura no cuela como reciente', () => {
  assert.equal(accionRapida({ ...base, lastReportAt: 'ayer por la tarde' }, AHORA).tipo, 'resena')
  // Reloj del móvil adelantado: `dias` sale negativo y pasaría el corte por abajo.
  assert.equal(accionRapida({ ...base, lastReportAt: haceDias(-3) }, AHORA).tipo, 'resena')
})
