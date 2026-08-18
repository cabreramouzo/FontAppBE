import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readPhotoMeta } from '../src/lib/exif.ts'

/**
 * Construye un JPEG mínimo con un EXIF de verdad: SOI + APP1(Exif/TIFF) + EOI.
 *
 * A mano y sin fixtures binarios en el repo, porque lo que se prueba es el recorrido de
 * los IFD y eso se ve mejor escrito que en un `.jpg` opaco que nadie puede inspeccionar
 * en una revisión.
 */
function jpegConExif(fecha: string | null, huso: string | null): Uint8Array {
  const textos: number[] = []
  const pon = (s: string) => {
    const off = textos.length
    for (let i = 0; i < s.length; i++) textos.push(s.charCodeAt(i))
    textos.push(0)
    return off
  }
  const entradas: [number, number, number, number][] = [] // tag, tipo, cuenta, valor
  // Los textos van después de los dos IFD; se calculan sus offsets al final.
  const offFecha = fecha === null ? -1 : pon(fecha)
  const offHuso = huso === null ? -1 : pon(huso)

  const IFD0 = 8
  const SUB = IFD0 + 2 + 12 + 4              // IFD0 tiene una sola entrada
  const nSub = (offFecha >= 0 ? 1 : 0) + (offHuso >= 0 ? 1 : 0)
  const TEXTOS = SUB + 2 + 12 * nSub + 4
  if (offFecha >= 0) entradas.push([0x9003, 2, 20, TEXTOS + offFecha])
  if (offHuso >= 0) entradas.push([0x9011, 2, 7, TEXTOS + offHuso])

  const tiff = new Uint8Array(TEXTOS + textos.length)
  const v = new DataView(tiff.buffer)
  tiff[0] = 0x49; tiff[1] = 0x49                 // "II" little-endian
  v.setUint16(2, 0x2a, true)
  v.setUint32(4, IFD0, true)
  v.setUint16(IFD0, 1, true)                     // IFD0: una entrada
  v.setUint16(IFD0 + 2, 0x8769, true)            // puntero al Exif SubIFD
  v.setUint16(IFD0 + 4, 4, true); v.setUint32(IFD0 + 6, 1, true)
  v.setUint32(IFD0 + 10, SUB, true)
  v.setUint32(IFD0 + 14, 0, true)                // no hay IFD1
  v.setUint16(SUB, nSub, true)
  entradas.forEach(([tag, tipo, cuenta, val], i) => {
    const e = SUB + 2 + i * 12
    v.setUint16(e, tag, true); v.setUint16(e + 2, tipo, true)
    v.setUint32(e + 4, cuenta, true); v.setUint32(e + 8, val, true)
  })
  v.setUint32(SUB + 2 + 12 * nSub, 0, true)
  tiff.set(textos, TEXTOS)

  const cab = [0x45, 0x78, 0x69, 0x66, 0, 0]     // "Exif\0\0"
  const size = 2 + cab.length + tiff.length
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe1, (size >> 8) & 0xff, size & 0xff, ...cab, ...tiff, 0xff, 0xd9,
  ])
}

const comoFoto = (b: Uint8Array) => new File([b], 'foto.jpg', { type: 'image/jpeg' })

test('lee DateTimeOriginal con el huso que escribe el móvil', async () => {
  const m = await readPhotoMeta(comoFoto(jpegConExif('2026:08:18 09:41:02', '+02:00')))
  assert.equal(m.takenAt?.toISOString(), '2026-08-18T07:41:02.000Z')
})

test('sin huso se interpreta como UTC, que es lo que la interfaz debe advertir', async () => {
  const m = await readPhotoMeta(comoFoto(jpegConExif('2026:08:18 09:41:02', null)))
  assert.equal(m.takenAt?.toISOString(), '2026-08-18T09:41:02.000Z')
})

test('una cámara con la hora sin poner no cuela', async () => {
  // El 1980 clásico de una cámara que perdió la pila. Peor que no tener fecha sería
  // enseñársela a un moderador como si significara algo.
  assert.equal((await readPhotoMeta(comoFoto(jpegConExif('1980:01:01 00:00:00', null)))).takenAt, null)
})

test('una fecha del futuro tampoco', async () => {
  const mañana = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, ':')
  assert.equal((await readPhotoMeta(comoFoto(jpegConExif(`${mañana} 12:00:00`, null)))).takenAt, null)
})

test('lo que no trae EXIF no revienta: devuelve vacío', async () => {
  assert.deepEqual(await readPhotoMeta(comoFoto(jpegConExif(null, null))), { gps: null, takenAt: null })
  assert.deepEqual(await readPhotoMeta(comoFoto(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))), { gps: null, takenAt: null })
  assert.deepEqual(await readPhotoMeta(new File([new Uint8Array([1, 2, 3])], 'x.png', { type: 'image/png' })),
    { gps: null, takenAt: null })
})

test('basura no lanza', async () => {
  const basura = new Uint8Array(200).fill(0xff)
  assert.deepEqual(await readPhotoMeta(comoFoto(basura)), { gps: null, takenAt: null })
})
