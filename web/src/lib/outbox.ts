import { ApiError, createComment, createFont, uploadImage, type NewComment, type NewFont } from '../api/client'

// Bandeja de salida para trabajar SIN COBERTURA (el escenario real de la app: monte).
//
// Por qué a mano y no con Background Sync: esa API no existe en Safari/iOS, así que no
// podemos enviar en segundo plano con la app cerrada. Lo que hacemos es guardar la
// aportación en el móvil y vaciarla en cuanto haya red con la app abierta (evento
// `online`, arranque de la app, o toque manual del aviso de pendientes).
//
// Va en IndexedDB, no en localStorage, porque hay que guardar la FOTO (un Blob) y
// localStorage solo admite texto y ronda los 5 MB.

const DB_NAME = 'fontapp-outbox'
const DB_VERSION = 1
const STORE = 'items'

/** Nº de intentos fallidos "definitivos" (datos inválidos) antes de descartar. */
const MAX_ATTEMPTS = 3

export type OutboxItem =
  // Alta de fuente. `waterStatus` viaja aquí (no como item aparte) para no encolar una
  // reseña que apunte a una fuente que todavía no existe.
  | { kind: 'font'; data: NewFont; waterStatus?: string; photo?: Blob; photoName?: string }
  // Actualización/reseña sobre una fuente que YA existe.
  | { kind: 'comment'; fontID: string; data: NewComment; photo?: Blob; photoName?: string }

type StoredItem = OutboxItem & { id: number; queuedAt: number; attempts: number }

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

// Avisamos a la UI (el aviso de "pendientes") de cualquier cambio en la cola.
const CHANGED = 'fontapp:outbox-changed'
function notifyChanged() {
  window.dispatchEvent(new CustomEvent(CHANGED))
}

export function onOutboxChanged(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener)
  return () => window.removeEventListener(CHANGED, listener)
}

/** Guarda una aportación para enviarla cuando haya red. */
export async function enqueue(item: OutboxItem): Promise<void> {
  await tx('readwrite', (s) => s.add({ ...item, queuedAt: Date.now(), attempts: 0 } as unknown as StoredItem))
  notifyChanged()
}

export async function pendingCount(): Promise<number> {
  try {
    return await tx<number>('readonly', (s) => s.count())
  } catch {
    return 0 // sin IndexedDB (modo privado antiguo): la app sigue funcionando
  }
}

async function allItems(): Promise<StoredItem[]> {
  const items = await tx<StoredItem[]>('readonly', (s) => s.getAll() as IDBRequest<StoredItem[]>)
  return items.sort((a, b) => a.id - b.id) // se envían en el orden en que se guardaron
}

/** ¿El fallo es de red (sin cobertura / timeout)? Entonces toca reintentar más tarde. */
export function isOffline(e: unknown): boolean {
  return e instanceof ApiError && e.status === 0
}

function toFile(blob: Blob, name?: string): File {
  return new File([blob], name || 'photo.jpg', { type: blob.type || 'image/jpeg' })
}

let flushing = false

/**
 * Intenta enviar todo lo pendiente. Devuelve cuántos se enviaron.
 * Se detiene en cuanto vuelve a fallar la red (para no gastar batería a lo tonto).
 */
export async function flushOutbox(): Promise<number> {
  if (flushing || !navigator.onLine) return 0
  flushing = true
  let sent = 0
  try {
    for (const item of await allItems()) {
      try {
        const image = item.photo ? await uploadImage(toFile(item.photo, item.photoName)) : undefined
        if (item.kind === 'font') {
          const font = await createFont({ ...item.data, image: image ?? item.data.image })
          // El estado que se indicó al crearla, como primera actualización.
          if (item.waterStatus) {
            try {
              await createComment(font.id, { waterStatus: item.waterStatus })
            } catch {
              /* la fuente ya está creada: no la reencolamos por esto */
            }
          }
        } else {
          await createComment(item.fontID, { ...item.data, image: image ?? item.data.image })
        }
        await tx('readwrite', (s) => s.delete(item.id))
        sent++
      } catch (e) {
        // Todo lo TRANSITORIO se reintenta indefinidamente: la aportación del usuario
        // no se descarta nunca por algo que no dependa de ella.
        if (isOffline(e)) break                                     // seguimos sin red
        if (e instanceof ApiError && e.status === 401) break        // sesión caducada
        if (e instanceof ApiError && e.status >= 500) break         // servidor caído
        // Solo un 4xx (validación, fuente borrada…) significa que estos datos NO van a
        // entrar nunca: unos reintentos y fuera, para no bloquear la cola eternamente.
        const attempts = item.attempts + 1
        if (attempts >= MAX_ATTEMPTS) await tx('readwrite', (s) => s.delete(item.id))
        else await tx('readwrite', (s) => s.put({ ...item, attempts }))
      }
    }
  } finally {
    flushing = false
    if (sent > 0) notifyChanged()
  }
  return sent
}

/** Vaciado automático: al arrancar la app y cada vez que vuelve la conexión. */
export function startOutboxAutoFlush() {
  const run = () => { void flushOutbox() }
  window.addEventListener('online', run)
  // Volver a la app tras un rato (bolsillo, pantalla apagada) también es buen momento.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run() })
  run()
}
