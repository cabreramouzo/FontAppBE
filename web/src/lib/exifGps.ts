// Lector mínimo de coordenadas GPS del EXIF de un JPEG, sin dependencias.
// Parsea el segmento APP1 (Exif) → IFD0 → GPS IFD, y devuelve {lat, lon} en
// grados decimales (WGS84), o null si la foto no lleva GPS.
//
// OJO: hay que leerlo del File ORIGINAL. Nuestra compresión con canvas
// (compressImage) reescribe el JPEG y elimina todo el EXIF.

export interface GpsCoords {
  lat: number
  lon: number
}

export async function readGpsFromImage(file: File): Promise<GpsCoords | null> {
  // Solo JPEG lleva EXIF con GPS (PNG/WebP no, en la práctica).
  if (!/jpe?g$/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return null
  try {
    const buf = await file.arrayBuffer()
    return parseGps(new DataView(buf))
  } catch {
    return null
  }
}

function parseGps(view: DataView): GpsCoords | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null // no es JPEG (SOI)

  // Recorre los segmentos hasta encontrar APP1 (0xFFE1) con cabecera "Exif\0\0".
  let offset = 2
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset)
    if ((marker & 0xff00) !== 0xff00) break
    const size = view.getUint16(offset + 2)
    if (marker === 0xffe1) {
      const exifStart = offset + 4
      if (view.getUint32(exifStart) === 0x45786966) { // "Exif"
        return parseExif(view, exifStart + 6) // salta "Exif\0\0"
      }
    }
    if (marker === 0xffda) break // SOS: empieza la imagen, no hay más metadatos
    offset += 2 + size
  }
  return null
}

function parseExif(view: DataView, tiff: number): GpsCoords | null {
  // Orden de bytes del TIFF: "II" (little) o "MM" (big).
  const le = view.getUint16(tiff) === 0x4949
  const u16 = (o: number) => view.getUint16(o, le)
  const u32 = (o: number) => view.getUint32(o, le)

  // IFD0: busca el tag GPSInfo (0x8825) que apunta al GPS IFD.
  const ifd0 = tiff + u32(tiff + 4)
  let gpsIfd = 0
  const count0 = u16(ifd0)
  for (let i = 0; i < count0; i++) {
    const e = ifd0 + 2 + i * 12
    if (u16(e) === 0x8825) { gpsIfd = tiff + u32(e + 8); break }
  }
  if (!gpsIfd) return null

  // GPS IFD: latitud (0x0002)+ref (0x0001), longitud (0x0004)+ref (0x0003).
  let lat: number | null = null, lon: number | null = null
  let latRef = 'N', lonRef = 'E'
  const gpsCount = u16(gpsIfd)
  for (let i = 0; i < gpsCount; i++) {
    const e = gpsIfd + 2 + i * 12
    const tag = u16(e)
    const valOff = e + 8
    if (tag === 0x0001) latRef = String.fromCharCode(view.getUint8(valOff))
    else if (tag === 0x0003) lonRef = String.fromCharCode(view.getUint8(valOff))
    else if (tag === 0x0002) lat = rationalDMS(view, tiff + u32(valOff), le)
    else if (tag === 0x0004) lon = rationalDMS(view, tiff + u32(valOff), le)
  }
  if (lat == null || lon == null) return null

  if (latRef === 'S') lat = -lat
  if (lonRef === 'W') lon = -lon
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

// Lee 3 racionales (grados, minutos, segundos) y los convierte a grados decimales.
function rationalDMS(view: DataView, off: number, le: boolean): number {
  const rat = (o: number) => {
    const num = view.getUint32(o, le)
    const den = view.getUint32(o + 4, le)
    return den === 0 ? 0 : num / den
  }
  const deg = rat(off)
  const min = rat(off + 8)
  const sec = rat(off + 16)
  return deg + min / 60 + sec / 3600
}
