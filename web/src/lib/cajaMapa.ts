/**
 * La caja que se le pide al servidor, redondeada a una rejilla.
 *
 * ## El problema
 *
 * El service worker cachea **por URL exacta**, y la petición del mapa llevaba la caja en
 * flotantes completos de Leaflet **más el tamaño en píxeles del viewport**:
 *
 *     /fonts/map?minLat=41.750123456789&…&width=390&height=844
 *
 * Con eso, un solo píxel de diferencia de alto es otra URL. Y la altura cambia sola: la
 * franja de avisos (`--alto-avisos`) aparece y desaparece, la barra del navegador se
 * pliega, el teclado se abre. Resultado: reabrir la app sin cobertura en la misma vista
 * fallaba el caché y **el mapa salía en blanco**. Pasó de verdad.
 *
 * ## Se redondea HACIA FUERA
 *
 * El mínimo hacia abajo y el máximo hacia arriba, nunca al más cercano. La caja pedida
 * tiene que **cubrir** lo que se ve: redondeando al más cercano, un borde podría quedarse
 * por dentro y aparecería una franja del mapa sin fuentes, que es un fallo silencioso —
 * ninguna petición falla, simplemente faltan puntos.
 *
 * El precio es pedir de más: como mucho un paso por lado. Con `PASO_PX` = 128 eso es un
 * 25 % más de ancho en el peor caso, y a cambio los desplazamientos pequeños reutilizan la
 * respuesta en vez de volver a pedir.
 *
 * ## La rejilla se mide en PÍXELES, no en grados
 *
 * Un paso fijo en grados sería enorme con el mapa muy cerca y ridículo con el mapa lejos.
 * Derivándolo del zoom, la celda mide siempre lo mismo **en pantalla**, así que la
 * proporción de lo que se pide de más es la misma en cualquier zoom. Y no depende del
 * tamaño del viewport, que es justo lo que se quiere estabilizar.
 */

/** Media tesela. Ver arriba: fija el 25 % de margen en el peor caso. */
const PASO_PX = 128

/**
 * El lado de la celda del servidor, en píxeles.
 *
 * `FontController.mapItems` calcula sus columnas con `ceil(width / 70)`. Cuantizando aquí
 * a múltiplos de 70, el servidor obtiene **exactamente** las mismas columnas que con el
 * ancho real, así que la respuesta no cambia y la URL deja de moverse con cada píxel.
 *
 * Si algún día cambia allí, esto no se rompe: solo dejaría de ser una equivalencia exacta
 * y pasaría a ser un redondeo cualquiera, que para el caché sigue valiendo.
 */
const CELDA_PX = 70

export interface CajaMapa {
  minLat: number
  maxLat: number
  minLong: number
  maxLong: number
  width: number
  height: number
}

/** Los grados que ocupa un píxel a ese zoom, en la proyección de Leaflet. */
function gradosPorPixel(zoom: number): number {
  return 360 / (256 * 2 ** zoom)
}

export function cajaRedondeada(
  b: { minLat: number; maxLat: number; minLong: number; maxLong: number },
  size: { width: number; height: number },
  zoom: number,
): CajaMapa {
  const paso = PASO_PX * gradosPorPixel(zoom)
  // Un zoom absurdo daría un paso 0 o infinito y con él una caja inservible. Ante la duda,
  // la caja tal cual: pedir de más es recuperable, pedir mal no.
  if (!Number.isFinite(paso) || paso <= 0) {
    return { ...b, width: Math.max(1, Math.round(size.width)), height: Math.max(1, Math.round(size.height)) }
  }
  const abajo = (n: number) => Math.floor(n / paso) * paso
  const arriba = (n: number) => Math.ceil(n / paso) * paso
  return {
    minLat: abajo(b.minLat),
    maxLat: arriba(b.maxLat),
    minLong: abajo(b.minLong),
    maxLong: arriba(b.maxLong),
    width: Math.max(CELDA_PX, Math.ceil(size.width / CELDA_PX) * CELDA_PX),
    height: Math.max(CELDA_PX, Math.ceil(size.height / CELDA_PX) * CELDA_PX),
  }
}

/** Los parámetros de la URL, siempre con los mismos decimales para que la cadena no baile. */
export function paramsDeCaja(c: CajaMapa): URLSearchParams {
  // Seis decimales son ~11 cm: de sobra, y fija la longitud de la cadena. Sin esto,
  // `String(41.75)` y `String(41.750000000000004)` serían URLs distintas para la misma caja.
  const g = (n: number) => n.toFixed(6)
  return new URLSearchParams({
    minLat: g(c.minLat),
    maxLat: g(c.maxLat),
    minLong: g(c.minLong),
    maxLong: g(c.maxLong),
    width: String(c.width),
    height: String(c.height),
  })
}
