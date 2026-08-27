/**
 * Mirar y vaciar lo que la app ocupa en el móvil.
 *
 * Hace falta porque el caché **fijado** es lo único de la app que crece sin techo y sin
 * puerta de salida: no lo recorta el LRU y no lo caduca la marca de las teselas, a
 * propósito —para eso existe—, así que quien guarde cinco zonas con sus fotos y su mapa no
 * tenía ninguna forma de recuperar ese espacio salvo desinstalar la app.
 *
 * Los cachés los gestiona el service worker y no la página: la Cache API que consulta
 * `fetch` es la suya, y lo que la página borrara por su cuenta no lo vería nadie.
 *
 * **Lo que NUNCA se ofrece vaciar**, y es la mitad importante del diseño:
 * · el **shell**, o la app dejaría de arrancar sin cobertura, que es lo contrario de lo
 *   que viene a hacer esta pantalla;
 * · la **bandeja de salida**, que son aportaciones sin enviar — lo único aquí que no se
 *   puede recuperar de ninguna manera.
 * La lista blanca vive en el service worker, así que un mensaje con un nombre cualquiera
 * tampoco puede tocarlos.
 */
const ESPERA_MS = 10_000

/** Los cachés que se pueden mirar y vaciar. El orden es el que se pinta. */
export const PARTES = ['fijado', 'teselas', 'fotos', 'api'] as const
export type Parte = (typeof PARTES)[number]

export type Recuento = Record<Parte, number>

const VACIO: Recuento = { fijado: 0, teselas: 0, fotos: 0, api: 0 }

async function pregunta<T>(mensaje: object, vacio: T): Promise<T> {
  const sw = navigator.serviceWorker?.controller
  // Sin service worker —pestaña de desarrollo, primera visita antes de que tome el
  // control, navegador sin soporte— no hay caché que gestionar y no es un error.
  if (!sw) return vacio
  return new Promise<T>((resolve) => {
    const canal = new MessageChannel()
    const reloj = setTimeout(() => resolve(vacio), ESPERA_MS)
    canal.port1.onmessage = (e) => {
      clearTimeout(reloj)
      resolve((e.data as T) ?? vacio)
    }
    try {
      sw.postMessage(mensaje, [canal.port2])
    } catch {
      clearTimeout(reloj)
      resolve(vacio)
    }
  })
}

export function mideAlmacen(): Promise<Recuento> {
  return pregunta<Recuento>({ tipo: 'medir' }, VACIO).then((r) => ({ ...VACIO, ...r }))
}

export function vaciaParte(cual: Parte): Promise<boolean> {
  return pregunta<{ vaciado?: boolean }>({ tipo: 'vaciar', cual }, {}).then((r) => r.vaciado === true)
}

/**
 * Lo que ocupa la app, en bytes crudos.
 *
 * Sale de `navigator.storage.estimate()` y **no de sumar los cuerpos de los cachés**: eso
 * obligaría a leer hasta 3.000 teselas para pintar una cifra, y en un móvil se nota. El
 * precio es que la cifra es del **origen entero** —cachés, IndexedDB y `localStorage`
 * juntos— y aproximada, así que se enseña como total y nunca repartida por partes: decir
 * «las fotos ocupan 14 MB» con este dato sería inventárselo.
 *
 * `libre` es lo que el **navegador** le deja guardar a esta app, no el espacio libre del
 * teléfono. Son cosas distintas y por eso se dice «disponibles» y no «libres».
 *
 * Devuelve `null` cuando el navegador no lo dice (Safari lo ha ocultado en algunas
 * versiones), y entonces no se pinta la línea en vez de enseñar un cero que es mentira.
 */
export async function ocupado(): Promise<{ usado: number; libre: number | null } | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    if (!e || typeof e.usage !== 'number') return null
    return {
      usado: e.usage,
      libre: typeof e.quota === 'number' ? Math.max(0, e.quota - e.usage) : null,
    }
  } catch {
    return null
  }
}
