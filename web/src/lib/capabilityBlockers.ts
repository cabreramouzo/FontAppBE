/**
 * Por qué está cerrada **cada** capacidad, una por una.
 *
 * La primera versión del panel decía «tiene las gotas de sobra; falla otro requisito», y
 * eso deja al administrador donde estaba: sabe que algo falla y no cuál. Aquí se resuelve
 * la cadena entera, en el mismo orden en que la resuelve `Capabilities.of`, para que cada
 * chip gris diga su motivo sin que nadie tenga que correlacionar nada.
 *
 * Las capacidades tienen **dos clases de puerta** y conviene no confundirlas: unas son
 * generales —los días, la mala conducta, la restricción, el opt-out, el sistema apagado—
 * y cierran todo a la vez; la otra es propia de cada capacidad, las gotas de su nivel.
 * Por eso el panel enseña las generales una sola vez arriba y el motivo concreto en cada
 * chip: repetir «le faltan seis días» siete veces es ruido, pero callarlo es el fallo que
 * esto viene a arreglar.
 */

/** Lo mínimo del informe que hace falta aquí. No se importa de `api/types`: este módulo
 *  es puro y lo cargan los tests de Node, que no admiten imports relativos sin extensión. */
export type Informe = {
  activeDays: number
  requiredActiveDays: number
  blockedBy: string[]
  gamificationOptOut: boolean
  postingRestrictedUntil?: string | null
  capabilitiesEnabled: boolean
  definitivePoints: boolean
}

export type Capacidad = {
  key: string
  level: string
  missingGotes: number
  requiresDefinitivePoints: boolean
}

export type Motivo =
  | { clave: 'systemOff' }
  | { clave: 'restricted' }
  | { clave: 'optedOut' }
  | { clave: 'provisional' }
  | { clave: 'misconduct' }
  | { clave: 'days'; faltan: number }
  | { clave: 'gotes'; level: string; faltan: number }

/**
 * Los motivos por los que esta capacidad concreta está cerrada.
 *
 * Devuelve **hasta dos** y no uno, y esa fue una corrección sobre la marcha: enseñando
 * solo el primero, la capacidad más alta decía «le faltan 6 días» y se callaba que además
 * le faltan 3.050 gotas. Quien lo lea concluiría que dentro de seis días la tendrá, y no
 * es verdad. Son puertas independientes y hay que ver las dos.
 *
 * El general va primero porque es **lo que hay que arreglar antes**: decirle «le faltan
 * 3.050 gotas» a alguien con las aportaciones restringidas manda a trabajar en lo que no
 * toca. Por lo demás el orden replica el de `Capabilities.of`.
 */
export function motivosDe(cap: Capacidad, r: Informe): Motivo[] {
  const motivos: Motivo[] = []
  const general = generalDe(cap, r)
  if (general) motivos.push(general)
  if (cap.missingGotes > 0) motivos.push({ clave: 'gotes', level: cap.level, faltan: cap.missingGotes })
  return motivos
}

/** La puerta que cierra todo a la vez, si hay alguna. */
function generalDe(cap: Capacidad, r: Informe): Motivo | null {
  if (!r.capabilitiesEnabled) return { clave: 'systemOff' }
  if (r.postingRestrictedUntil || r.blockedBy.includes('restricted')) return { clave: 'restricted' }
  if (r.gamificationOptOut || r.blockedBy.includes('optedOut')) return { clave: 'optedOut' }
  // Ésta es la única que depende de la capacidad y no de la persona: con puntos
  // provisionales solo se cierran las que destruyen trabajo ajeno.
  if (cap.requiresDefinitivePoints && !r.definitivePoints) return { clave: 'provisional' }
  if (r.blockedBy.includes('recentlyVoided')) return { clave: 'misconduct' }
  if (r.activeDays < r.requiredActiveDays) {
    return { clave: 'days', faltan: r.requiredActiveDays - r.activeDays }
  }
  return null
}

/**
 * ¿Lo abre todo el rol, por encima de cualquier requisito?
 *
 * `Capabilities.of` empieza con «un admin ya lo puede todo por su rol; el nivel no le
 * añade ni le quita nada», así que para un admin la lista de requisitos **no aplica**.
 * Sin esto el panel enseñaba los siete chips verdes y, encima, «✗ 0 de 8 días»: dos cosas
 * ciertas que juntas se leen como una contradicción, y quien lo mire acaba dudando del
 * panel entero justo cuando ha venido a resolver una duda.
 */
export function abrePorRol(role: string): boolean {
  return role === 'admin' || role === 'owner'
}

/** Los requisitos generales, con si se cumplen o no. Se pintan una vez, arriba. */
export type Requisito = { clave: string; cumple: boolean; detalle?: Record<string, string | number> }

export function requisitosGenerales(r: Informe): Requisito[] {
  const req: Requisito[] = [
    { clave: 'system', cumple: r.capabilitiesEnabled },
    { clave: 'notRestricted', cumple: !r.postingRestrictedUntil },
    { clave: 'game', cumple: !r.gamificationOptOut },
    {
      clave: 'days',
      cumple: r.activeDays >= r.requiredActiveDays,
      detalle: { have: r.activeDays, need: r.requiredActiveDays },
    },
    { clave: 'clean', cumple: !r.blockedBy.includes('recentlyVoided') },
  ]
  // Los puntos definitivos NO son un requisito general: solo cierran tres capacidades.
  // Meterlos en esta lista diría que con la época sin poner no se puede nada, y con la
  // época sin poner se puede añadir fotos y cerrar incidencias, que es lo normal hoy.
  if (!r.definitivePoints) req.push({ clave: 'definitive', cumple: false })
  return req
}
