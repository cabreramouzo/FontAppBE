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

export async function fijaParaOffline(urls: string[]): Promise<number> {
  if (urls.length === 0) return 0
  const sw = navigator.serviceWorker?.controller
  // Sin service worker —pestaña normal en desarrollo, primera visita antes de que tome el
  // control, navegador sin soporte— no hay caché que gestionar y no es un error.
  if (!sw) return 0
  return new Promise<number>((resolve) => {
    const canal = new MessageChannel()
    // Si el service worker no contesta no se puede dejar la promesa colgada para siempre:
    // quien llama probablemente esté enseñando un indicador de progreso.
    const reloj = setTimeout(() => resolve(0), ESPERA_MS)
    canal.port1.onmessage = (e) => {
      clearTimeout(reloj)
      resolve(typeof e.data?.guardadas === 'number' ? e.data.guardadas : 0)
    }
    try {
      sw.postMessage({ tipo: 'fijar', urls }, [canal.port2])
    } catch {
      clearTimeout(reloj)
      resolve(0)
    }
  })
}
