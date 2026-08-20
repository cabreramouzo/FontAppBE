import type { Drinkable, WaterSource } from '../api/types'

// Tipo de punto (source) y potabilidad (drinkable): el emoji es fijo; la etiqueta
// se traduce vía i18n con las claves `source.<key>` / `drink.<key>`.

export const SOURCE_EMOJI: Record<WaterSource, string> = {
  tap: '🚰',       // fuente urbana: agua de red
  mountain: '⛰️',  // manantial captado (caño): la font de muntanya
  spring: '💦',    // manantial sin captar: brota solo
  well: '🪣',
  fountain: '⛲',
  other: '💧',
}

export const DRINKABLE_EMOJI: Record<Drinkable, string> = {
  yes: '✅',
  no: '🚱',
  conditional: '⚠️',
  untreated: '💧',  // sin veredicto: agua subterránea que nadie trata ni controla
}

export const SOURCE_OPTIONS: WaterSource[] = ['tap', 'mountain', 'spring', 'well', 'fountain', 'other']
// De más a menos garantía, no en el orden en que se añadieron: con cuatro opciones el
// orden ya es información. `untreated` va arriba porque es la que le toca a casi toda
// fuente de montaña, y enterrarla la deja sin usar.
export const DRINKABLE_OPTIONS: Drinkable[] = ['yes', 'untreated', 'conditional', 'no']

export function sourceInfo(s: WaterSource | null | undefined): { emoji: string; labelKey: string } | null {
  return s ? { emoji: SOURCE_EMOJI[s], labelKey: `source.${s}` } : null
}

export function drinkableInfo(d: Drinkable | null | undefined): { emoji: string; labelKey: string } | null {
  return d ? { emoji: DRINKABLE_EMOJI[d], labelKey: `drink.${d}` } : null
}

/**
 * true salvo que esté explícitamente marcada como no potable (null = desconocido ⇒ se
 * muestra). `untreated` NO cuenta: no tratada no es no potable — es la mitad de las
 * fuentes de montaña, y esconderlas del mapa vaciaría justo la zona a la que se va.
 */
export function isNotPotable(d: Drinkable | null | undefined): boolean {
  return d === 'no'
}
