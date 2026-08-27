/**
 * Una zona guardada para andar sin cobertura.
 *
 * ## Por qué no basta con el caché del service worker
 *
 * El caché va por URL exacta, y la lista de cercanas se pide con **tu casilla** de ~111 m.
 * Guardar una zona de 10 km cubriendo todas sus casillas serían miles de peticiones: es
 * inviable, y además absurdo, porque todas devolverían trozos de la misma lista de fuentes.
 *
 * Aquí se guarda **el dato** una vez —las fuentes de la caja— y la lista de cercanas se
 * calcula en el móvil. Es lo mismo que hace el servidor: ordenar por distancia.
 *
 * ## Los datos sin el mapa
 *
 * No se guardan teselas a propósito. Medido: una tesela pesa 3-18 KB y las fuentes de una
 * caja grande, 924 KB — o sea que toda una comarca cuesta como unas 150 teselas. Y sobre
 * todo, **la app puede contestar su pregunta sin mapa**: la lista de cercanas ordena por
 * distancia y la flecha de los últimos metros lleva hasta la fuente. Ninguna de las dos
 * pinta teselas. Guardar el mapa además es otra conversación — son servidores ajenos y
 * gratuitos a los que no hay que pedirles miles de imágenes de golpe.
 *
 * ## IndexedDB y no `localStorage`
 *
 * Por lo mismo que la ruta recordada: `localStorage` lo comparte con la **bandeja de
 * salida**, que guarda aportaciones sin enviar — lo único aquí que no se puede perder. Una
 * zona son cientos de KB y llenarlo sería tirar lo de la bandeja.
 */
/** Lo mínimo que necesita el cálculo. Genérico para no arrastrar aquí los tipos de la API:
 *  este módulo lo cargan los tests sin DOM, y un solo import de más lo rompe. */
export interface ConCoordenadas {
  latitude: number
  longitude: number
}

export interface ZonaOffline<F extends ConCoordenadas = ConCoordenadas> {
  /** La caja que se pidió, para poder decir si estás dentro de ella. */
  minLat: number
  maxLat: number
  minLong: number
  maxLong: number
  /** Cuándo se guardó, en ISO. Lo que se dice al usuario: los datos caducan. */
  cuando: string
  fuentes: F[]
}

/** Metros entre dos puntos (haversine). Copiado a propósito: este módulo no depende de nada. */
function metros(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000
  const r = Math.PI / 180
  const dLat = (bLat - aLat) * r
  const dLon = (bLon - aLon) * r
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/**
 * ¿Cae este punto dentro de la zona guardada?
 *
 * Hace falta para no mentir: con la zona de Girona guardada y el móvil en Cádiz, la lista
 * saldría con las fuentes de Girona ordenadas por distancia — todas a 900 km. Es peor que
 * no enseñar nada, porque parece que funciona.
 */
export function dentroDe(zona: ZonaOffline<never> | ZonaOffline, lat: number, long: number): boolean {
  return lat >= zona.minLat && lat <= zona.maxLat && long >= zona.minLong && long <= zona.maxLong
}

/**
 * Las `n` fuentes más cercanas de la zona guardada, ordenadas por distancia.
 *
 * Lo mismo que devuelve `/fonts/near`, calculado en el móvil. Devuelve `[]` si estás fuera
 * de la zona: ver `dentroDe`.
 */
export function cercanasEn<F extends ConCoordenadas>(
  zona: ZonaOffline<F>, lat: number, long: number, n = 25,
): F[] {
  if (!dentroDe(zona, lat, long)) return []
  return zona.fuentes
    .map((f) => ({ f, d: metros(lat, long, f.latitude, f.longitude) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.f)
}

/**
 * Las fuentes de la zona que caen dentro de una caja.
 *
 * Para pintar el mapa sin cobertura. Devuelve `[]` si la caja pedida se sale de lo
 * guardado en más de lo razonable — mejor un mapa vacío que uno que enseña las fuentes de
 * otro valle porque son las únicas que hay.
 */
export function enCaja<F extends ConCoordenadas>(
  zona: ZonaOffline<F>,
  caja: { minLat: number; maxLat: number; minLong: number; maxLong: number },
): F[] {
  // Si no se solapan, no hay nada honesto que enseñar.
  if (caja.maxLat < zona.minLat || caja.minLat > zona.maxLat
      || caja.maxLong < zona.minLong || caja.minLong > zona.maxLong) return []
  return zona.fuentes.filter(
    (f) => f.latitude >= caja.minLat && f.latitude <= caja.maxLat
        && f.longitude >= caja.minLong && f.longitude <= caja.maxLong,
  )
}

/** Una fuente concreta de la zona guardada, o `null`. Para la ficha sin cobertura. */
export function fuenteDe<F extends ConCoordenadas & { id?: string | null }>(
  zona: ZonaOffline<F>,
  id: string,
): F | null {
  return zona.fuentes.find((f) => f.id === id) ?? null
}

/**
 * Lo que se estima que pesan `n` fotos, en MB con un decimal.
 *
 * 489 KB es la media **medida en producción** (91 ficheros, 43,5 MB) y no un número a
 * ojo. Es una estimación y se dice que lo es: el tamaño real se enseña después de bajarlas.
 */
const KB_POR_FOTO = 489

export function estimaMB(n: number): string {
  return ((n * KB_POR_FOTO) / 1024).toFixed(1)
}

/** Bytes a MB con un decimal, para decir lo que de verdad ha ocupado. */
export function megas(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1)
}
