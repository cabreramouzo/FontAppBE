// Lector mínimo del EXIF de un JPEG, sin dependencias: coordenadas GPS y fecha de toma.
// Parsea el segmento APP1 (Exif) → IFD0 → {GPS IFD, Exif SubIFD}.
//
// OJO: hay que leerlo del File ORIGINAL. Nuestra compresión con canvas
// (compressImage) reescribe el JPEG y elimina todo el EXIF, así que si se lee después
// no queda absolutamente nada.
//
// Para qué sirve la fecha: comparar cuándo dice el móvil que se hizo la foto con cuándo
// se subió. Es un dato **que afirma el cliente y no se puede verificar** —cualquier
// editor lo reescribe—, así que vale para que un moderador mire y para nada más. Y falta
// más veces de las que está: lo que pasa por mensajería llega sin EXIF.

export interface GpsCoords {
  lat: number
  lon: number
}

export interface PhotoMeta {
  gps: GpsCoords | null
  /** Cuándo dice la cámara que se hizo. `null` si la foto no lo trae. */
  takenAt: Date | null
}

export async function readPhotoMeta(file: File): Promise<PhotoMeta> {
  const vacio: PhotoMeta = { gps: null, takenAt: null }
  // Solo JPEG lleva EXIF (PNG/WebP no, en la práctica).
  if (!/jpe?g$/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return vacio
  try {
    return parseMeta(new DataView(await file.arrayBuffer())) ?? vacio
  } catch {
    return vacio
  }
}

/** Solo las coordenadas, que es lo que necesita el formulario de crear una fuente. */
export async function readGpsFromImage(file: File): Promise<GpsCoords | null> {
  return (await readPhotoMeta(file)).gps
}

function parseMeta(view: DataView): PhotoMeta | null {
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

function parseExif(view: DataView, tiff: number): PhotoMeta {
  // Orden de bytes del TIFF: "II" (little) o "MM" (big).
  const le = view.getUint16(tiff) === 0x4949
  const u16 = (o: number) => view.getUint16(o, le)
  const u32 = (o: number) => view.getUint32(o, le)

  // IFD0: dos punteros nos interesan, GPSInfo (0x8825) y el Exif SubIFD (0x8769), más
  // la fecha de modificación (0x0132) como último recurso.
  const ifd0 = tiff + u32(tiff + 4)
  let gpsIfd = 0
  let subIfd = 0
  let fechaFallback: string | null = null
  const count0 = u16(ifd0)
  for (let i = 0; i < count0; i++) {
    const e = ifd0 + 2 + i * 12
    const tag = u16(e)
    if (tag === 0x8825) gpsIfd = tiff + u32(e + 8)
    else if (tag === 0x8769) subIfd = tiff + u32(e + 8)
    else if (tag === 0x0132) fechaFallback = ascii(view, tiff + u32(e + 8), 19)
  }

  const takenAt = leeFecha(view, tiff, subIfd, u16, u32) ?? aFecha(fechaFallback, null)
  const gps = gpsIfd ? leeGps(view, tiff, gpsIfd, le, u16, u32) : null
  return { gps, takenAt }
}

/**
 * `DateTimeOriginal` (0x9003) del Exif SubIFD, con su huso (`OffsetTimeOriginal`, 0x9011)
 * si la cámara lo escribió.
 *
 * El huso importa: el EXIF guarda la **hora de pared del móvil, sin zona**, así que sin
 * el 0x9011 la misma foto puede caer hasta catorce horas a un lado u otro. Los iPhone
 * modernos lo escriben; cuando no está, se interpreta como UTC y hay que decirlo en la
 * interfaz en vez de fingir precisión que no se tiene.
 */
function leeFecha(
  view: DataView, tiff: number, subIfd: number,
  u16: (o: number) => number, u32: (o: number) => number,
): Date | null {
  if (!subIfd) return null
  let original: string | null = null
  let huso: string | null = null
  const n = u16(subIfd)
  for (let i = 0; i < n; i++) {
    const e = subIfd + 2 + i * 12
    const tag = u16(e)
    if (tag === 0x9003) original = ascii(view, tiff + u32(e + 8), 19)
    else if (tag === 0x9011) huso = ascii(view, tiff + u32(e + 8), 6)
  }
  return aFecha(original, huso)
}

/** `"2026:08:18 09:41:02"` (+ `"+02:00"`) → `Date`. */
function aFecha(s: string | null, huso: string | null): Date | null {
  if (!s) return null
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s.trim())
  if (!m) return null
  const desfase = huso && /^[+-]\d{2}:\d{2}$/.test(huso.trim()) ? huso.trim() : 'Z'
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${desfase}`)
  if (Number.isNaN(d.getTime())) return null
  // Una cámara con la hora sin poner escribe 1970 o 1980; y del futuro no viene nada.
  const año = d.getUTCFullYear()
  if (año < 1990 || d.getTime() > Date.now() + 86_400_000) return null
  return d
}

function ascii(view: DataView, off: number, max: number): string | null {
  if (off < 0 || off + max > view.byteLength) return null
  let s = ''
  for (let i = 0; i < max; i++) {
    const c = view.getUint8(off + i)
    if (c === 0) break
    s += String.fromCharCode(c)
  }
  return s || null
}

function leeGps(
  view: DataView, tiff: number, gpsIfd: number, le: boolean,
  u16: (o: number) => number, u32: (o: number) => number,
): GpsCoords | null {

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
