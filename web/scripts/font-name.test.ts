import assert from 'node:assert/strict'
import test from 'node:test'
import { nombreFuente, rotulo } from '../src/lib/fontName.ts'

const es = (key: string) => ({
  'source.tap': 'Fuente urbana',
  'source.spring': 'Manantial',
  'font.unnamed': 'Fuente sin nombre',
}[key] ?? key)

test('un topónimo se conserva aunque la interfaz esté en otro idioma', () => {
  assert.equal(nombreFuente({ name: 'Pilgrimskällan', source: 'spring' }, es), 'Pilgrimskällan')
})

test('una importada sin topónimo se rotula por tipo en el idioma del lector', () => {
  assert.equal(nombreFuente({ name: null, source: 'tap' }, es), 'Fuente urbana')
  assert.equal(nombreFuente({ name: null, source: 'spring' }, es), 'Manantial')
})

test('sin topónimo ni tipo se usa una ausencia traducida, nunca null', () => {
  assert.equal(nombreFuente({ name: null, source: null }, es), 'Fuente sin nombre')
  assert.equal(rotulo(null, es), 'Fuente sin nombre')
})
