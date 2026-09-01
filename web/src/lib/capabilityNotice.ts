/**
 * La parte de `/gamification/me` que hace falta aquí, escrita a mano.
 *
 * No se importa de `api/types` a propósito: este módulo es puro y lo cargan los tests de
 * Node, que resuelven con `nodenext` y no admiten un import relativo sin extensión.
 * Mismo motivo por el que `lib/apiError.ts` se separó de `api/client.ts`.
 */
export type Grant = {
  capabilities: string[]
  blockedBy: string[]
  activeDays?: number
  requiredActiveDays?: number
}

/** Lo que hay que decirle a alguien que todavía no puede hacer algo. */
export type Bloqueo = { clave: string; params?: Record<string, string | number> }

/**
 * Por qué esta persona no puede usar una capacidad, y `null` si sí puede.
 *
 * Existe porque el aviso decía siempre lo mismo: «necesitas el nivel Rierol», mirase
 * quien lo mirase. Lo reportó alguien con **3.949 gotas liquidadas** —de sobra para ese
 * nivel— al que de verdad le faltaba otra cosa: `requiredActiveDays`, 8 días distintos
 * con aportación, y llevaba 2. El aviso nombraba un requisito cumplido y escondía el que
 * fallaba, así que no había forma de saber qué hacer para desbloquearlo.
 *
 * `grant` a `undefined` es «todavía no lo sabemos» y no se dice nada: enseñar un motivo
 * mientras carga es la manera de volver a afirmar algo falso. `null` es la gamificación
 * apagada por su dueño, que sí es un motivo.
 */
export function bloqueoDe(cap: string, grant: Grant | null | undefined): Bloqueo | null {
  if (grant === undefined) return null
  if (grant === null) return { clave: 'cap.blocked.optedOut' }
  if (grant.capabilities.includes(cap)) return null

  const b = grant.blockedBy
  // El orden es de más definitivo a más cercano de cumplir: una restricción o la
  // gamificación apagada no se arreglan aportando, y los días sí.
  if (b.includes('restricted')) return { clave: 'cap.blocked.restricted' }
  if (b.includes('optedOut')) return { clave: 'cap.blocked.optedOut' }
  if (b.includes('disabled') || b.includes('provisional')) return { clave: 'cap.blocked.unavailable' }
  if (b.includes('recentlyVoided')) return { clave: 'cap.blocked.recentlyVoided' }
  if (b.includes('activeDays')) {
    return {
      clave: 'cap.blocked.activeDays',
      params: { have: grant.activeDays ?? 0, need: grant.requiredActiveDays ?? 8 },
    }
  }
  // Lo que queda es el nivel, que es el caso normal y el único que ya se decía.
  return { clave: 'cap.needLevel' }
}
