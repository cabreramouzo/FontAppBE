/**
 * La casilla de ~100 m en la que estás.
 *
 * ## Para qué, y por qué en un solo sitio
 *
 * «Cerca de ti» pedía `/fonts/near?lat=41.7512834&long=2.1634091`: las coordenadas crudas
 * del GPS. Andando, **cada petición lleva una URL distinta**, y el service worker cachea
 * por URL exacta — así que sin cobertura no acierta **nunca**. No es «funciona si has
 * mirado la zona antes»: es que no funciona.
 *
 * El mapa ya decidía *cuándo* volver a pedir por casilla de tres decimales, pero mandaba
 * las coordenadas sin redondear. Redondear también las que van en la URL —exactamente lo
 * que ya hace `/activity`: «se redondean **y se consulta con las redondeadas**»— convierte
 * una caché que no acierta jamás en una que acierta siempre dentro de la misma casilla. Y
 * de paso dos personas en el mismo sitio comparten respuesta en el servidor.
 *
 * La clave y las coordenadas salen de **la misma función** a propósito. Tenerlas en dos
 * sitios es cómo estaba el fallo: una decidía cuándo pedir y la otra qué pedir, y no
 * hablaban entre ellas.
 *
 * ## Tres decimales
 *
 * Un milésimo de grado son ~111 m de latitud, y menos en longitud según subes. Es el paso
 * que ya usaba el mapa para no pedir en cada latido del GPS, y a esa escala la lista de
 * las 25 más cercanas no cambia: lo que cambia es el orden de las que están al mismo paso,
 * y de eso se encarga quien la pinta ordenando por la distancia de verdad.
 *
 * **No sirve para todo.** El aviso de «ya hay una fuente a menos de 25 m» al crear una
 * necesita la posición exacta; redondearla ahí lo haría inútil. Por eso esto se aplica en
 * el sitio que lo necesita y no dentro de `nearbyFonts`.
 */
export interface Casilla {
  /** Latitud redondeada, tal cual va en la URL. */
  lat: string
  /** Longitud redondeada, tal cual va en la URL. */
  long: string
  /** Identifica la casilla: sirve de dependencia para no repedir dentro de la misma. */
  clave: string
}

/** ~111 m de latitud. Ver arriba por qué tres y no cuatro. */
const DECIMALES = 3

function redondea(n: number): string {
  // `Math.round` antes del `toFixed` normaliza el cero negativo: sin esto, una longitud
  // de -0,0004 daría «-0.000» y la de +0,0004 «0.000» — dos claves y dos entradas de
  // caché para la misma consulta.
  const factor = 10 ** DECIMALES
  return (Math.round(n * factor) / factor).toFixed(DECIMALES)
}

export function casillaDe(lat: number, long: number): Casilla {
  const a = redondea(lat)
  const b = redondea(long)
  return { lat: a, long: b, clave: `${a},${b}` }
}
