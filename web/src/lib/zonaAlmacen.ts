import type { FontSummary } from '../api/types'
import type { ZonaOffline } from './zonaOffline'

/**
 * Guardar la zona en IndexedDB.
 *
 * Separado de `zonaOffline.ts` **a propósito**: aquel lo cargan los tests con el runner de
 * Node, que no tiene DOM ni `indexedDB`, y basta un tipo del navegador para que deje de
 * compilar allí. La lógica que merece test es la del cálculo; esto es tubería.
 *
 * Y en IndexedDB y no en `localStorage` por lo mismo que la ruta recordada: `localStorage`
 * lo comparte con la **bandeja de salida**, que guarda aportaciones sin enviar — lo único
 * aquí que no se puede perder. Una zona son cientos de KB.
 */
export type Zona = ZonaOffline<FontSummary>

const DB_NAME = 'fontapp-zona'
const DB_VERSION = 1
const STORE = 'zona'
const CLAVE = 'actual'

function abre(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => ok(req.result)
    req.onerror = () => mal(req.error)
  })
}

export async function guardaZona(zona: Zona): Promise<void> {
  const db = await abre()
  await new Promise<void>((ok, mal) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(zona, CLAVE)
    tx.oncomplete = () => ok()
    tx.onerror = () => mal(tx.error)
  })
  db.close()
}

export async function zonaGuardada(): Promise<Zona | null> {
  try {
    const db = await abre()
    const zona = await new Promise<Zona | null>((ok) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(CLAVE)
      req.onsuccess = () => ok((req.result as Zona) ?? null)
      req.onerror = () => ok(null)
    })
    db.close()
    return zona
  } catch {
    // Modo privado, cuota llena, IndexedDB bloqueado: no hay zona y ya está. Que esto
    // falle no puede tumbar el mapa.
    return null
  }
}

export async function borraZona(): Promise<void> {
  try {
    const db = await abre()
    await new Promise<void>((ok) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(CLAVE)
      tx.oncomplete = () => ok()
      tx.onerror = () => ok()
    })
    db.close()
  } catch { /* nada que borrar */ }
}

