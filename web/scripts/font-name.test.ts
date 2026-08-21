import assert from 'node:assert/strict'
import test from 'node:test'
import { nombreFuente, rotulo } from '../src/lib/fontName.ts'

const es = (key: string) => ({
  'font.unnamed': 'Fuente sin nombre',
}[key] ?? key)

test('un topónimo se conserva aunque la interfaz esté en otro idioma', () => {
  assert.equal(nombreFuente({ name: 'Pilgrimskällan', source: 'spring' }, es), 'Pilgrimskällan')
})

test('una importada sin topónimo no inventa ubicación ni conexión a red', () => {
  assert.equal(nombreFuente({ name: null, source: 'tap' }, es), 'Fuente sin nombre')
  assert.equal(nombreFuente({ name: null, source: 'spring' }, es), 'Fuente sin nombre')
})

test('sin topónimo ni tipo se usa una ausencia traducida, nunca null', () => {
  assert.equal(nombreFuente({ name: null, source: null }, es), 'Fuente sin nombre')
  assert.equal(rotulo(null, es), 'Fuente sin nombre')
})
