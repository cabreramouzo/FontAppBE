/**
 * Guardar cosas a salvo del descarte del caché.
 *
 * El service worker recorta sus cachés por orden de llegada, así que lo que preparas hoy
 * se lo lleva mañana un rato de curiosear por otra zona. Esto pide guardar unas URLs en un
 * caché aparte del que **no se borra nada** para hacer sitio.
 *
 * Tiene que hacerlo el service worker y no la página: la Cache API que consulta `fetch` es
 * la suya, y lo que la página guardara por su cuenta no lo vería nadie.
 *
 * Devuelve **cuántas se han guardado de verdad**, no un booleano de cortesía: sin red no se
 * fija nada, y quien llame tiene que poder decir la verdad en vez de prometer que la zona
 * está lista.
 */
const ESPERA_MS = 15_000

export interface Fijado {
  /** Cuántas se han guardado de verdad. Cero si no hay service worker o falló la red. */
  guardadas: number
  /** Lo que ocupan, medido del cuerpo. Es lo que se le enseña a la persona. */
  bytes: number
}

export async function fijaParaOffline(urls: string[], msPorFichero = 3_000): Promise<Fijado> {
  const vacio: Fijado = { guardadas: 0, bytes: 0 }
  if (urls.length === 0) return vacio
  const sw = navigator.serviceWorker?.controller
  // Sin service worker —pestaña normal en desarrollo, primera visita antes de que tome el
  // control, navegador sin soporte— no hay caché que gestionar y no es un error.
  if (!sw) return vacio
  return new Promise<Fijado>((resolve) => {
    const canal = new MessageChannel()
    // El plazo crece con lo que se pide: guardar 200 fotos por una red de montaña no cabe
    // en los 15 s que bastaban para una respuesta de la API. Con un plazo fijo, una zona
    // grande daría siempre «0 guardadas» aunque estuviera bajándose bien.
    const reloj = setTimeout(() => resolve(vacio), Math.max(ESPERA_MS, urls.length * msPorFichero))
    canal.port1.onmessage = (e) => {
      clearTimeout(reloj)
      const d = e.data as Partial<Fijado> | undefined
      resolve({
        guardadas: typeof d?.guardadas === 'number' ? d.guardadas : 0,
        bytes: typeof d?.bytes === 'number' ? d.bytes : 0,
      })
    }
    try {
      sw.postMessage({ tipo: 'fijar', urls }, [canal.port2])
    } catch {
      clearTimeout(reloj)
      resolve(vacio)
    }
  })
}
