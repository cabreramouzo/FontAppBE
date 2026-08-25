/**
 * Leer un GPX y cruzarlo con las fuentes: "cuántas hay en mi ruta".
 *
 * ## Todo pasa en el navegador, y no es una comodidad
 *
 * Un GPX no es un fichero cualquiera: es **por dónde se mueve una persona**, y la mayoría
 * empiezan y acaban en la puerta de su casa. Subirlo convertiría a FontApp en custodio de
 * datos de localización, con lo que eso arrastra —retención, borrado, responsabilidad si
 * un día hay una filtración— y no hace ninguna falta: el fichero se lee aquí y **no sale
 * del dispositivo**. Al servidor solo se le pregunta por la caja que envuelve el
 * recorrido, que es exactamente lo mismo que ya se le pregunta al mover el mapa por esa
 * zona, y es una ruta pública que no guarda nada.
 *
 * ## Por qué un lector propio y no `DOMParser`
 *
 * `DOMParser` es lo natural en un navegador y **no existe en Node**, así que con él esta
 * lógica no se podría probar sin meter una dependencia o un DOM de mentira. Los puntos de
 * un GPX son de lo más regular que hay en XML —una etiqueta con dos atributos— así que un
 * lector acotado a eso es honesto y se prueba de verdad. Lo que NO se hace es intentar
 * leer XML general con expresiones regulares: aquí solo se buscan `trkpt` y `rtept`.
 */

/** Un punto del recorrido. `ele` es la altitud en metros, si el fichero la trae. */
export interface PuntoRuta {
  lat: number
  lon: number
  ele: number | null
}

/** Radio del corredor por defecto, en metros. */
export const CORREDOR_M = 250

/** El corredor más ancho que se puede elegir. Fija cuánto se ensancha la caja. */
export const CORREDOR_MAX_M = 1000

/**
 * Separación mínima entre puntos tras simplificar, en metros.
 *
 * Un GPX de un Garmin puede traer decenas de miles de puntos (uno por segundo), y cruzarlos
 * todos contra miles de fuentes es un producto que se nota en el móvil. A 25 m el trazado
 * no cambia de forma para lo que aquí se mide —distancias de cientos de metros— y el coste
 * baja un orden de magnitud.
 */
export const PASO_MIN_M = 25

/**
 * Lee los puntos de un GPX: track (`trkpt`) y ruta (`rtept`).
 *
 * `wpt` se ignora a propósito: son los waypoints sueltos del fichero, no el trazado, y
 * mezclarlos convertiría el punto de inicio marcado a mano en parte del recorrido.
 */
export function leeGPX(texto: string): PuntoRuta[] {
  const puntos: PuntoRuta[] = []
  // Cada `trkpt`/`rtept` con sus atributos, y lo que hay hasta su cierre (donde vive `ele`).
  const re = /<(trkpt|rtept)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(texto)) !== null) {
    const attrs = m[2]
    const dentro = m[4] ?? ''
    const lat = Number(/\blat\s*=\s*["']([^"']+)["']/.exec(attrs)?.[1])
    const lon = Number(/\blon\s*=\s*["']([^"']+)["']/.exec(attrs)?.[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue
    const eleTexto = /<ele>\s*([-\d.eE+]+)\s*<\/ele>/.exec(dentro)?.[1]
    const ele = eleTexto !== undefined && Number.isFinite(Number(eleTexto)) ? Number(eleTexto) : null
    puntos.push({ lat, lon, ele })
  }
  return puntos
}

const R = 6371000

/** Metros entre dos puntos, con la proyección plana local: a esta escala sobra. */
function metros(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180
  const x = (bLon - aLon) * rad * Math.cos(((aLat + bLat) / 2) * rad)
  const y = (bLat - aLat) * rad
  return Math.sqrt(x * x + y * y) * R
}

/** Quita los puntos que están a menos de `paso` del último que se conservó. */
export function simplifica(puntos: PuntoRuta[], paso = PASO_MIN_M): PuntoRuta[] {
  if (puntos.length === 0) return []
  const out = [puntos[0]]
  for (const p of puntos.slice(1, -1)) {
    const u = out[out.length - 1]
    if (metros(u.lat, u.lon, p.lat, p.lon) >= paso) out.push(p)
  }
  // El último se conserva siempre: es el final del recorrido y perderlo acorta la ruta.
  if (puntos.length > 1) out.push(puntos[puntos.length - 1])
  return out
}

/**
 * La caja que envuelve el recorrido, **ensanchada**. Es lo único que se le pide al servidor.
 *
 * El margen no es un adorno: sin él se piden solo las fuentes que caen dentro del trazado,
 * y una fuente que está **al lado** de la ruta queda fuera de la caja y no se pide nunca.
 * Con un recorrido recto es evidente —la caja tiene altura cero y no sale ni una— pero con
 * uno normal el fallo es peor porque es silencioso: se pierden las de los bordes y el
 * resumen dice «8 fuentes» cuando eran doce. Se descubrió probándolo de punta a punta; los
 * tests del corredor pasaban, porque el corredor estaba bien y lo que faltaba era pedirlas.
 *
 * Se ensancha con el corredor **más grande** que se puede elegir, no con el actual: así
 * cambiar el desplegable no obliga a volver a preguntar al servidor.
 */
export function cajaDe(puntos: PuntoRuta[], margenM = CORREDOR_MAX_M) {
  const lats = puntos.map((p) => p.lat)
  const lons = puntos.map((p) => p.lon)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLong = Math.min(...lons), maxLong = Math.max(...lons)
  const dLat = margenM / 111_320
  // Un grado de longitud se encoge con la latitud; el `max` evita dividir por casi cero
  // cerca de los polos, donde el coseno tiende a 0 y el margen se iría al infinito.
  const dLon = margenM / (111_320 * Math.max(0.05, Math.cos(((minLat + maxLat) / 2) * Math.PI / 180)))
  return {
    minLat: minLat - dLat, maxLat: maxLat + dLat,
    minLong: minLong - dLon, maxLong: maxLong + dLon,
  }
}

/** Longitud total del recorrido, en km. */
export function largoKm(puntos: PuntoRuta[]): number {
  let total = 0
  for (let i = 1; i < puntos.length; i += 1) {
    total += metros(puntos[i - 1].lat, puntos[i - 1].lon, puntos[i].lat, puntos[i].lon)
  }
  return total / 1000
}

/** Lo que se sabe de una fuente respecto al recorrido. */
export interface EnRuta<T> {
  fuente: T
  /** Distancia al trazado, en metros. */
  desvioM: number
  /** En qué kilómetro del recorrido queda. Ordena la lista como se pedalea. */
  kmRuta: number
  /** Altitud del RECORRIDO en ese punto, si el fichero la trae. */
  eleRutaM: number | null
}

/**
 * Distancia de un punto al segmento a-b, en metros, y en qué fracción del segmento cae.
 *
 * Se trabaja en metros planos locales, no en grados: un grado de longitud mide la mitad en
 * el Pirineo que en el ecuador, y comparar grados haría el corredor más estrecho cuanto más
 * al norte, que es justo donde están las rutas de montaña.
 */
function alSegmento(pLat: number, pLon: number, aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = Math.PI / 180
  const k = Math.cos(aLat * rad)
  const ax = 0, ay = 0
  const bx = (bLon - aLon) * rad * k * R, by = (bLat - aLat) * rad * R
  const px = (pLon - aLon) * rad * k * R, py = (pLat - aLat) * rad * R
  const dx = bx - ax, dy = by - ay
  const largo2 = dx * dx + dy * dy
  const tt = largo2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / largo2
  const t = Math.max(0, Math.min(1, tt))
  const cx = ax + t * dx, cy = ay + t * dy
  return { distancia: Math.hypot(px - cx, py - cy), t }
}

/**
 * Las fuentes que caen dentro del corredor, **ordenadas por kilómetro de ruta**.
 *
 * Por kilómetro y no por distancia al trazado a propósito: quien mira esto está decidiendo
 * dónde llenar el bidón, y eso se decide en el orden en que se pedalea, no por cuál está
 * tres metros más cerca.
 */
export function fuentesEnRuta<T extends { latitude: number; longitude: number }>(
  fuentes: T[],
  ruta: PuntoRuta[],
  corredorM = CORREDOR_M,
): EnRuta<T>[] {
  if (ruta.length < 2) return []
  // Distancia acumulada hasta el inicio de cada segmento, calculada una vez.
  const acumulado: number[] = [0]
  for (let i = 1; i < ruta.length; i += 1) {
    acumulado.push(acumulado[i - 1] + metros(ruta[i - 1].lat, ruta[i - 1].lon, ruta[i].lat, ruta[i].lon))
  }

  const out: EnRuta<T>[] = []
  for (const f of fuentes) {
    let mejor = Infinity
    let mejorI = -1
    let mejorT = 0
    for (let i = 1; i < ruta.length; i += 1) {
      const a = ruta[i - 1]
      const b = ruta[i]
      // Descarte barato antes de la cuenta buena: sin esto es un producto de millones.
      if (Math.abs(a.lat - f.latitude) * 111000 > corredorM + 2000
          && Math.abs(b.lat - f.latitude) * 111000 > corredorM + 2000) continue
      const { distancia, t } = alSegmento(f.latitude, f.longitude, a.lat, a.lon, b.lat, b.lon)
      if (distancia < mejor) { mejor = distancia; mejorI = i; mejorT = t }
    }
    if (mejorI < 0 || mejor > corredorM) continue
    const a = ruta[mejorI - 1]
    const b = ruta[mejorI]
    const largoSeg = acumulado[mejorI] - acumulado[mejorI - 1]
    out.push({
      fuente: f,
      desvioM: Math.round(mejor),
      kmRuta: (acumulado[mejorI - 1] + largoSeg * mejorT) / 1000,
      // La altitud es la DEL RECORRIDO en ese punto, no la de la fuente: la fuente no
      // tiene altitud en la base, así que no se puede decir cuánto hay que bajar hasta
      // ella. Prometerlo sería inventarse un dato.
      eleRutaM: a.ele ?? b.ele ?? null,
    })
  }
  return out.sort((x, y) => x.kmRuta - y.kmRuta)
}
