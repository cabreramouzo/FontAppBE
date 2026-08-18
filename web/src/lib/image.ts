import { readPhotoMeta } from './exif'

/**
 * Redimensiona la imagen a `maxDim` px de lado máximo y la recomprime a JPEG.
 * Reduce mucho el peso de subida. Se hace en el cliente (sin dependencias de servidor).
 * Si algo falla, devuelve el fichero original.
 */
// 1280 px y calidad 0,72: una foto de una font se ve igual de bien en un móvil y pesa
// entre tres y cuatro veces menos que a 1600/0,8 (que dejaba ficheros de más de 1 MB,
// y cada MB se paga en R2). Por encima de 1280 no se gana nada visible en pantalla.
export async function compressImage(file: File, maxDim = 1280, quality = 0.72): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (!blob || blob.size >= file.size) return file // no la re-encodes si no ayuda

    const name = file.name.replace(/\.\w+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

/** Lo que sabemos de una foto que aún no se ha tocado. */
export interface PhotoUploadMeta {
  takenAt?: string
  lat?: number
  lon?: number
}

/**
 * Deja una foto lista para subir: comprimida, y con su EXIF ya leído.
 *
 * Existe para que **el orden no sea una decisión de quien la llama**. `compressImage`
 * reencoda con canvas y eso borra todos los metadatos, así que leerlos después devuelve
 * siempre vacío — un fallo que no rompe nada, no da ningún error y solo se nota meses
 * después cuando resulta que ninguna foto tiene fecha. Aquí el orden correcto es el
 * único posible.
 */
export async function prepararFoto(file: File): Promise<{ photo: File; meta: PhotoUploadMeta }> {
  const exif = await readPhotoMeta(file)
  const meta: PhotoUploadMeta = {}
  if (exif.takenAt) meta.takenAt = exif.takenAt.toISOString()
  if (exif.gps) { meta.lat = exif.gps.lat; meta.lon = exif.gps.lon }
  return { photo: await compressImage(file), meta }
}
