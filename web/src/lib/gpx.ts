/**
 * Construye un GPX de waypoints con las fuentes.
 *
 * ## Para que
 *
 * Lo pidio un usuario que va en bici de montana: planifica en Strava o Wikiloc y rueda con
 * el GPS en el manillar. **No va a sacar el movil en mitad de una bajada**, asi que una app
 * de fuentes que solo existe en el telefono no le sirve donde le hace falta. Lo que le
 * resuelve el problema es que las fuentes esten en el aparato con el que ya va.
 *
 * De ahi que esto sea lo primero de todo lo del GPX y no lo ultimo: importar un recorrido
 * es mas vistoso, pero exportar es lo unico que funciona **sobre la bici**.
 *
 * ## Por que en el navegador y no en el servidor
 *
 * Las fuentes ya estan cargadas en el mapa que estas mirando, asi que no hay nada que
 * pedir: cero endpoints nuevos, cero coste de servidor, y funciona **sin cobertura** con lo
 * que el service worker ya tiene cacheado, que es justo cuando estas en el monte
 * preparando la ruta del dia siguiente.
 */

/** Un punto tal y como se escribe en el fichero. */
export interface PuntoGPX {
  lat: number
  lon: number
  nombre: string
  /** Estado del agua, tipo, frescura: lo que ayude a decidir si desviarse. */
  descripcion?: string
}

/**
 * Tope de waypoints por fichero.
 *
 * **No es un limite tecnico nuestro, es de los aparatos.** Muchos Garmin admiten del orden
 * de mil o dos mil waypoints en total y algunos truncan la importacion **en silencio**, asi
 * que soltarle 3.000 puntos (lo que cabe en una vista de mapa de una ciudad) acaba en un
 * fichero que el aparato acepta a medias o en una pantalla ilegible de iconos superpuestos.
 * Con 500 va sobrado cualquier ruta de un dia: un recorrido de 60 km pasa cerca de unas
 * decenas.
 */
export const MAX_WAYPOINTS = 500

/**
 * Escapa para XML.
 *
 * Los nombres vienen de OpenStreetMap y de gente escribiendo en un formulario, asi que
 * pueden traer cualquier cosa. Sin esto, un `&` o unas comillas en un toponimo producen un
 * fichero que el aparato **rechaza entero**: no falla una fuente, fallan las quinientas.
 */
function esc(s: string): string {
  return s
    // Los caracteres de control son ilegales en XML 1.0 y no hay forma de escaparlos: se
    // quitan. Se hace ANTES que las entidades, o se comeria los `&` recien escritos.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Siete decimales son ~1 cm: la convencion del formato, y corta el ruido del float. */
function coord(n: number): string {
  return n.toFixed(7)
}

export function construyeGPX(puntos: PuntoGPX[]): string {
  const wpts = puntos.slice(0, MAX_WAYPOINTS).map((p) => [
    `  <wpt lat="${coord(p.lat)}" lon="${coord(p.lon)}">`,
    `    <name>${esc(p.nombre)}</name>`,
    p.descripcion ? `    <desc>${esc(p.descripcion)}</desc>` : null,
    // `sym` es el icono con el que el aparato lo pinta. "Drinking Water" es el nombre del
    // simbolo de Garmin, y es la diferencia entre ver gotas de agua en la pantalla del GPS
    // o quinientas banderitas iguales que no dicen nada.
    '    <sym>Drinking Water</sym>',
    '    <type>Water Source</type>',
    '  </wpt>',
  ].filter(Boolean).join('\n')).join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="FontApp"',
    '     xmlns="http://www.topografix.com/GPX/1/1"',
    '     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    wpts,
    '</gpx>',
    '',
  ].filter((l) => l !== '').join('\n')
}

/** Nombre del fichero, con la fecha: se descargan varios y hay que distinguirlos. */
export function nombreFichero(hoy = new Date()): string {
  return `fontapp-${hoy.toISOString().slice(0, 10)}.gpx`
}
