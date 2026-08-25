import assert from 'node:assert/strict'
import test from 'node:test'
import { construyeGPX, nombreFichero, MAX_WAYPOINTS } from '../src/lib/gpx.ts'

const uno = { lat: 41.75, lon: 2.15, nombre: 'Font de la Teula', descripcion: 'Sale agua' }

test('el fichero tiene la cabecera y el cierre que espera un GPS', () => {
  const gpx = construyeGPX([uno])
  assert.match(gpx, /^<\?xml version="1\.0" encoding="UTF-8"\?>/)
  assert.match(gpx, /<gpx version="1\.1" creator="FontApp"/)
  assert.match(gpx, /xmlns="http:\/\/www\.topografix\.com\/GPX\/1\/1"/)
  assert.ok(gpx.trimEnd().endsWith('</gpx>'))
})

test('cada fuente lleva el simbolo de agua, no una banderita generica', () => {
  assert.match(construyeGPX([uno]), /<sym>Drinking Water<\/sym>/)
})

test('las coordenadas van con la precision del formato y sin ruido de float', () => {
  const gpx = construyeGPX([{ lat: 41.1 + 0.2, lon: 2.15, nombre: 'x' }])
  assert.match(gpx, /lat="41\.3000000"/, '41.1+0.2 no puede salir como 41.300000000000004')
  assert.match(gpx, /lon="2\.1500000"/)
})

test('un & en el toponimo no rompe el fichero entero', () => {
  // Sin escapar, el aparato rechaza el GPX completo: no falla una fuente, fallan todas.
  const gpx = construyeGPX([{ lat: 1, lon: 2, nombre: 'Riu & Font <b>"vella"</b>' }])
  assert.match(gpx, /<name>Riu &amp; Font &lt;b&gt;&quot;vella&quot;&lt;\/b&gt;<\/name>/)
})

test('los caracteres de control se quitan, porque en XML no se pueden escapar', () => {
  const gpx = construyeGPX([{ lat: 1, lon: 2, nombre: 'Font rara \u0007' }])
  assert.match(gpx, /<name>Font rara <\/name>/)
})

test('quitar los caracteres de control no se come las entidades recien escritas', () => {
  // El orden importa: limpiando despues de escapar, "&amp;" perderia trozos.
  assert.match(construyeGPX([{ lat: 1, lon: 2, nombre: 'A & B' }]), /<name>A &amp; B<\/name>/)
})

test('sin descripcion no se escribe una etiqueta vacia', () => {
  assert.ok(!construyeGPX([{ lat: 1, lon: 2, nombre: 'x' }]).includes('<desc>'))
})

test('se corta en el tope, que es un limite de los aparatos y no nuestro', () => {
  const muchas = Array.from({ length: MAX_WAYPOINTS + 50 }, (_, i) => ({ lat: i / 1000, lon: 0, nombre: `f${i}` }))
  assert.equal((construyeGPX(muchas).match(/<wpt /g) ?? []).length, MAX_WAYPOINTS)
})

test('sin fuentes sigue siendo un GPX valido y no una cadena rota', () => {
  const gpx = construyeGPX([])
  assert.match(gpx, /<gpx /)
  assert.ok(gpx.trimEnd().endsWith('</gpx>'))
  assert.ok(!gpx.includes('<wpt'))
})

test('el nombre del fichero lleva la fecha, que es lo que distingue dos descargas', () => {
  assert.equal(nombreFichero(new Date('2026-08-26T10:00:00Z')), 'fontapp-2026-08-26.gpx')
})
