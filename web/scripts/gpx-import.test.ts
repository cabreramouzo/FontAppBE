import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cajaDe, fuentesEnRuta, largoKm, leeGPX, simplifica, CORREDOR_M,
} from '../src/lib/gpxImport.ts'

/** Un GPX minimo pero realista: dos puntos de track con altitud. */
const GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="Garmin">
  <metadata><name>Ruta</name></metadata>
  <wpt lat="0" lon="0"><name>inicio marcado a mano</name></wpt>
  <trk><name>Ruta</name><trkseg>
    <trkpt lat="41.7500000" lon="2.1500000"><ele>720.4</ele><time>2026-08-01T08:00:00Z</time></trkpt>
    <trkpt lat="41.7500000" lon="2.1600000"><ele>735.0</ele></trkpt>
  </trkseg></trk>
</gpx>`

test('lee los puntos del track con su altitud', () => {
  const pts = leeGPX(GPX)
  assert.equal(pts.length, 2)
  assert.deepEqual(pts[0], { lat: 41.75, lon: 2.15, ele: 720.4 })
})

test('los waypoints sueltos NO son parte del trazado', () => {
  // El <wpt lat="0" lon="0"> del fichero es una marca del usuario. Si entrara, la ruta
  // pasaria por el golfo de Guinea y todas las distancias saldrian mal.
  assert.ok(!leeGPX(GPX).some((p) => p.lat === 0 && p.lon === 0))
})

test('acepta rtept, que es lo que exportan algunos planificadores', () => {
  const pts = leeGPX('<gpx><rte><rtept lat="1" lon="2"/><rtept lat="1.1" lon="2"/></rte></gpx>')
  assert.equal(pts.length, 2)
  assert.equal(pts[0].ele, null)
})

test('el orden de los atributos no importa, ni las comillas simples', () => {
  const pts = leeGPX("<gpx><trkpt lon='2.15' lat='41.75'></trkpt></gpx>")
  assert.deepEqual(pts, [{ lat: 41.75, lon: 2.15, ele: null }])
})

test('un fichero que no es un GPX devuelve cero puntos, no un error', () => {
  assert.deepEqual(leeGPX('esto es una foto, no un gpx'), [])
  assert.deepEqual(leeGPX(''), [])
})

test('coordenadas imposibles se descartan en vez de envenenar la ruta', () => {
  assert.deepEqual(leeGPX('<gpx><trkpt lat="999" lon="0"/><trkpt lat="41" lon="2"/></gpx>').length, 1)
})

test('simplificar conserva el primero y el ultimo', () => {
  const pts = [
    { lat: 41.75, lon: 2.15, ele: null },
    { lat: 41.750001, lon: 2.15, ele: null },
    { lat: 41.7501, lon: 2.15, ele: null },
  ]
  const s = simplifica(pts, 25)
  assert.equal(s.length, 2, 'el punto de en medio esta a 11 cm del primero')
  assert.deepEqual(s[0], pts[0])
  assert.deepEqual(s[s.length - 1], pts[pts.length - 1], 'perder el ultimo acortaria la ruta')
})

test('el largo del recorrido sale en km', () => {
  // Un grado de longitud a 41.75 de latitud son ~82,9 km; 0,01 grados son ~830 m.
  const km = largoKm(leeGPX(GPX))
  assert.ok(km > 0.7 && km < 0.9, `eran ${km} km`)
})

test('la caja se ensancha POR DEFECTO, o las fuentes de al lado no se piden nunca', () => {
  // Este es el fallo que se vio probandolo entero: con la caja pegada al trazado, una
  // ruta recta de este a oeste da altura CERO y no devuelve ni una fuente, y una ruta
  // normal pierde en silencio las de los bordes.
  //
  // Se llama SIN margen a proposito. La primera version de este test pasaba 1000 a mano y
  // por eso no habria cazado el fallo: lo que estaba mal era el valor por defecto, que es
  // el que usa la pantalla.
  const c = cajaDe(leeGPX(GPX))
  assert.ok(c.maxLat - 41.75 > 0.008, 'un km al norte son ~0,009 grados')
  assert.ok(41.75 - c.minLat > 0.008)
  assert.ok(c.minLong < 2.15 && c.maxLong > 2.16)
})

test('el margen en longitud crece con la latitud, porque el grado se encoge', () => {
  const ecuador = cajaDe([{ lat: 0, lon: 0, ele: null }], 1000)
  const norte = cajaDe([{ lat: 60, lon: 0, ele: null }], 1000)
  assert.ok(norte.maxLong > ecuador.maxLong * 1.9,
            'a 60 grados un km son el doble de grados de longitud que en el ecuador')
})

test('cerca del polo el margen no se va al infinito', () => {
  const polo = cajaDe([{ lat: 89.9, lon: 0, ele: null }], 1000)
  assert.ok(Number.isFinite(polo.maxLong) && polo.maxLong < 1, `era ${polo.maxLong}`)
})

const RUTA = leeGPX(GPX)

test('una fuente pegada al trazado entra, con su desvio y su kilometro', () => {
  // ~111 m al norte del punto medio del recorrido.
  const f = { latitude: 41.751, longitude: 2.155, id: 'a' }
  const [r] = fuentesEnRuta([f], RUTA)
  assert.ok(r, 'deberia entrar en el corredor')
  assert.ok(Math.abs(r.desvioM - 111) < 12, `desvio ${r.desvioM} m`)
  assert.ok(r.kmRuta > 0.3 && r.kmRuta < 0.5, `km ${r.kmRuta}`)
})

test('una fuente lejos del trazado no entra aunque este en la caja', () => {
  // Dentro del bounding box no significa "en la ruta": es la diferencia entre esto y
  // pedir las fuentes de un rectangulo.
  const lejos = { latitude: 41.76, longitude: 2.155, id: 'b' }
  assert.deepEqual(fuentesEnRuta([lejos], RUTA), [])
})

test('el corredor se mide en metros de verdad, no en grados', () => {
  // El desvio va en LONGITUD y a latitud alta, que es el unico caso donde se nota: un
  // grado de longitud a 60 grados mide la mitad que en el ecuador. Con la fuente al norte
  // de un tramo este-oeste el error no aparece —la distancia es pura latitud— y la
  // primera version de este test caia justo en ese agujero: pasaba igual con el coseno
  // quitado, o sea que no probaba nada.
  const norteSur = leeGPX('<gpx><trkpt lat="59.995" lon="0"/><trkpt lat="60.005" lon="0"/></gpx>')
  const f = { latitude: 60, longitude: 0.0036, id: 'c' }  // ~200 m al este
  const [r] = fuentesEnRuta([f], norteSur, CORREDOR_M)
  assert.ok(r, 'a 200 m tiene que entrar en un corredor de 250')
  // Sin el coseno saldrian ~400 m y la fuente quedaria fuera del corredor.
  assert.ok(Math.abs(r.desvioM - 200) < 25, `desvio ${r.desvioM} m`)
})

test('salen ordenadas por kilometro de ruta, que es como se pedalea', () => {
  const a = { latitude: 41.7502, longitude: 2.1580, id: 'tarde' }
  const b = { latitude: 41.7502, longitude: 2.1520, id: 'pronto' }
  assert.deepEqual(fuentesEnRuta([a, b], RUTA).map((r) => r.fuente.id), ['pronto', 'tarde'])
})

test('la altitud que se da es la del RECORRIDO, no la de la fuente', () => {
  // La fuente no tiene altitud en la base. Decir "12 m por debajo" seria inventarselo.
  const [r] = fuentesEnRuta([{ latitude: 41.7505, longitude: 2.152, id: 'a' }], RUTA)
  assert.equal(r.eleRutaM, 720.4)
})

test('una ruta de un solo punto no rompe nada', () => {
  assert.deepEqual(fuentesEnRuta([{ latitude: 41.75, longitude: 2.15, id: 'a' }],
                                 [{ lat: 41.75, lon: 2.15, ele: null }]), [])
})
