import type { Drinkable, WaterSource } from '../api/types'

// Etiquetas e iconos del tipo de punto (source) y la potabilidad (drinkable).

export const SOURCE_INFO: Record<WaterSource, { label: string; emoji: string }> = {
  tap: { label: 'Fuente / grifo', emoji: '💧' },
  spring: { label: 'Manantial', emoji: '⛰️' },
  well: { label: 'Pozo', emoji: '🪣' },
  fountain: { label: 'Ornamental', emoji: '⛲' },
  other: { label: 'Otro', emoji: '💧' },
}

export const DRINKABLE_INFO: Record<Drinkable, { label: string; emoji: string }> = {
  yes: { label: 'Potable', emoji: '✅' },
  no: { label: 'No potable', emoji: '🚱' },
  conditional: { label: 'Potable con condiciones', emoji: '⚠️' },
}

export function sourceInfo(s: WaterSource | null | undefined) {
  return s ? SOURCE_INFO[s] : null
}

export function drinkableInfo(d: Drinkable | null | undefined) {
  return d ? DRINKABLE_INFO[d] : null
}

/** true salvo que esté explícitamente marcada como no potable (null = desconocido ⇒ se muestra). */
export function isNotPotable(d: Drinkable | null | undefined): boolean {
  return d === 'no'
}
