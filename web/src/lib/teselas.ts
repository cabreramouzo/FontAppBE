/**
 * Qué teselas cubren lo que estás viendo.
 *
 * ## Para qué, y hasta dónde
 *
 * Para poder **fijar el mapa de la zona que guardas**, y solo eso: el recuadro visible a
 * dos niveles de zoom, unas decenas de imágenes. Es lo que tu móvil habría bajado igual
 * moviendo el mapa por ahí.
 *
 * **No sirve para bajarse una comarca ni un corredor de 100 km**, y no es una limitación
 * técnica sino de con qué derecho se pide: las teselas son de servidores ajenos y gratuitos
 * —OpenStreetMap, el IGN, el ICGC— y la política de uso de OSM prohíbe expresamente la
 * descarga masiva de zonas. Medido: una comarca a z12–z16 son unas **15.000 peticiones**.
 * Eso no es cachear, es raspar. El día que haga falta de verdad, la salida honesta es un
 * proveedor donde bajarse una región esté contemplado (MapTiler, Protomaps), no exprimir
 * a voluntarios.
 */

export interface Tesela {
  z: number
  x: number
  y: number
}

export interface Caja {
  minLat: number
  maxLat: number
  minLong: number
  maxLong: number
}

/** Columna de la tesela que contiene esa longitud. */
function columna(long: number, z: number): number {
  return Math.floor(((long + 180) / 360) * 2 ** z)
}

/**
 * Fila de la tesela que contiene esa latitud.
 *
 * Es la proyección de Mercator, y por eso no es simétrica con la de la columna: la fila
 * **crece hacia el sur** y el espaciado se estira según te alejas del ecuador. Copiar la
 * fórmula de la longitud aquí es el error clásico y da un mapa desplazado que solo se nota
 * lejos del ecuador.
 */
function fila(lat: number, z: number): number {
  // Se acota a los límites de Mercator: más allá de ±85,05° la tangente se dispara y la
  // fila sale fuera del mundo.
  const l = Math.min(Math.max(lat, -85.05112878), 85.05112878)
  const r = (l * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/**
 * Las teselas que cubren la caja, en `zoom` y en los `niveles` siguientes.
 *
 * Un nivel más porque acercar sin cobertura y ver blanco es la mitad de la utilidad;
 * cuesta cuatro veces más teselas, así que dos niveles es el techo razonable — el tercero
 * ya son dieciséis veces.
 */
export function teselasDe(caja: Caja, zoom: number, niveles = 2): Tesela[] {
  const out: Tesela[] = []
  for (let i = 0; i < niveles; i += 1) {
    const z = Math.round(zoom) + i
    if (z < 0 || z > 22) continue
    const max = 2 ** z - 1
    const x0 = Math.max(0, columna(caja.minLong, z))
    const x1 = Math.min(max, columna(caja.maxLong, z))
    // Ojo al orden: `maxLat` da la fila MENOR, porque las filas crecen hacia el sur.
    const y0 = Math.max(0, fila(caja.maxLat, z))
    const y1 = Math.min(max, fila(caja.minLat, z))
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) out.push({ z, x, y })
    }
  }
  return out
}

/**
 * La URL de una tesela para una plantilla de Leaflet.
 *
 * El `{s}` de los subdominios se sustituye por uno fijo **a propósito**: repartir entre
 * `a`, `b` y `c` sirve para paralelizar cuando pides muchas, y aquí lo que interesa es que
 * la URL sea **exactamente la misma** que pedirá el mapa después. Con un subdominio
 * distinto sería otra clave de caché y no acertaría nunca — el mismo fallo que ya tuvimos
 * con las coordenadas sin redondear.
 */
export function urlDeTesela(plantilla: string, t: Tesela, subdominio = 'a'): string {
  return plantilla
    .replace('{s}', subdominio)
    .replace('{z}', String(t.z))
    .replace('{x}', String(t.x))
    .replace('{y}', String(t.y))
}

/**
 * Lo que se estima que pesan, en MB.
 *
 * 6 KB por tesela es la media **medida** sobre OpenStreetMap a los zooms que se usan
 * andando: 18 KB a z10, 5,6 a z13 y 2,8 a z15.
 */
const KB_POR_TESELA = 6

export function estimaMBTeselas(n: number): string {
  return ((n * KB_POR_TESELA) / 1024).toFixed(1)
}
