import { useEffect, useState } from 'react'
import { photoExif, type PhotoExifMeta } from '../api/client'

/**
 * Lo que el móvil escribió dentro de una foto. **Solo para admins.**
 *
 * ## Por qué agrupa las peticiones
 *
 * Una ficha con diez reseñas tiene once fotos, y once peticiones para pintar once líneas
 * de texto sería absurdo. Cada componente pide la suya y todas las que caen en el mismo
 * tick se van juntas. Es el mismo patrón de `lib/asks.ts`: estado en el módulo y sin
 * proveedor, porque las fotos aparecen en sitios sueltos del árbol —y la galería ni
 * siquiera está montada hasta que la abres— y envolverlos a todos no daría nada.
 *
 * La caché es de por vida de la página: este dato no cambia nunca. Se escribe una vez al
 * subir la foto y ya está.
 */
const cache = new Map<string, PhotoExifMeta | null>()
const cola = new Set<string>()
const oyentes = new Set<() => void>()
let programado = false

/** El UUID del nombre del fichero, que es lo único estable de la dirección. */
export function photoIDde(url: string): string | null {
  const ultimo = url.split('/').pop() ?? ''
  const sinExt = ultimo.split('.')[0]
  return /^[0-9a-f-]{36}$/i.test(sinExt) ? sinExt.toLowerCase() : null
}

function programa() {
  if (programado) return
  programado = true
  queueMicrotask(async () => {
    programado = false
    const ids = [...cola]
    cola.clear()
    if (ids.length === 0) return
    try {
      const filas = await photoExif(ids)
      const porID = new Map(filas.map((f) => [f.photoID.toLowerCase(), f]))
      // Los que no vuelven se cachean como `null`: son fotos subidas antes de que esto
      // existiera, y hay que dejar de preguntar por ellas.
      for (const id of ids) cache.set(id, porID.get(id) ?? null)
    } catch {
      for (const id of ids) cache.set(id, null)
    }
    for (const f of oyentes) f()
  })
}

export function usePhotoExif(url: string | null | undefined, activo: boolean): PhotoExifMeta | null {
  const id = activo && url ? photoIDde(url) : null
  const [, refresca] = useState(0)

  useEffect(() => {
    if (!id || cache.has(id)) return
    const oyente = () => refresca((n) => n + 1)
    oyentes.add(oyente)
    cola.add(id)
    programa()
    return () => { oyentes.delete(oyente) }
  }, [id])

  return id ? cache.get(id) ?? null : null
}
