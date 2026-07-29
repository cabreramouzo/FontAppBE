/**
 * Redimensiona la imagen a `maxDim` px de lado máximo y la recomprime a JPEG.
 * Reduce mucho el peso de subida. Se hace en el cliente (sin dependencias de servidor).
 * Si algo falla, devuelve el fichero original.
 */
export async function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<File> {
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
