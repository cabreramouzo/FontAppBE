import type { Drinkable, WaterSource } from '../api/types'

// Tipo de punto (source) y potabilidad (drinkable): el emoji es fijo; la etiqueta
// se traduce vía i18n con las claves `source.<key>` / `drink.<key>`.

export const SOURCE_EMOJI: Record<WaterSource, string> = {
  tap: '💧',
  spring: '⛰️',
  well: '🪣',
  fountain: '⛲',
  other: '💧',
}

export const DRINKABLE_EMOJI: Record<Drinkable, string> = {
  yes: '✅',
  no: '🚱',
  conditional: '⚠️',
}

export const SOURCE_OPTIONS: WaterSource[] = ['tap', 'spring', 'well', 'fountain', 'other']
export const DRINKABLE_OPTIONS: Drinkable[] = ['yes', 'no', 'conditional']

export function sourceInfo(s: WaterSource | null | undefined): { emoji: string; labelKey: string } | null {
  return s ? { emoji: SOURCE_EMOJI[s], labelKey: `source.${s}` } : null
}

export function drinkableInfo(d: Drinkable | null | undefined): { emoji: string; labelKey: string } | null {
  return d ? { emoji: DRINKABLE_EMOJI[d], labelKey: `drink.${d}` } : null
}

/** true salvo que esté explícitamente marcada como no potable (null = desconocido ⇒ se muestra). */
export function isNotPotable(d: Drinkable | null | undefined): boolean {
  return d === 'no'
}
