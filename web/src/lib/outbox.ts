import type { PhotoUploadMeta } from './image'
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
const DB_VERSION = 2
const STORE = 'items'
// Sesión espejada para el service worker: en Android puede enviar la cola con la app
// CERRADA (Background Sync), y un SW no puede leer `localStorage`.
const META = 'meta'
const SYNC_TAG = 'fontapp-outbox'

/** Un elemento "en vuelo" no se vuelve a coger hasta pasado esto (evita envío doble
 *  si la página y el service worker vacían la cola a la vez). */
const CLAIM_TTL_MS = 2 * 60 * 1000

/** Nº de intentos fallidos "definitivos" (datos inválidos) antes de descartar. */
const MAX_ATTEMPTS = 3

export type OutboxItem =
  // Alta de fuente. `waterStatus` viaja aquí (no como item aparte) para no encolar una
  // reseña que apunte a una fuente que todavía no existe.
  | { kind: 'font'; data: NewFont; waterStatus?: string; photo?: Blob; photoName?: string; photoMeta?: PhotoUploadMeta }
  // Actualización/reseña sobre una fuente que YA existe.
  | { kind: 'comment'; fontID: string; data: NewComment; photo?: Blob; photoName?: string; photoMeta?: PhotoUploadMeta }

type StoredItem = OutboxItem & {
  id: number; queuedAt: number; attempts: number; claimedAt?: number
  /** La sesión caducó al intentar enviarlo: hace falta volver a entrar. */
  needsAuth?: boolean
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>, storeName = STORE): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(storeName, mode).objectStore(storeName))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

/**
 * Guarda el token y el origen de la API donde el service worker pueda leerlos.
 * Llamar en cada cambio de sesión (entrar, salir, restaurar al arrancar).
 */
export async function saveSessionForSync(token: string | null): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put({ key: 'session', token, apiBase: import.meta.env.VITE_API_URL || '/api' }), META)
    // Sesión nueva: lo que estaba esperando a que volvieras a entrar ya puede salir.
    if (token) {
      for (const item of await allItems()) {
        if (item.needsAuth) await tx('readwrite', (s) => s.put({ ...item, needsAuth: false }))
      }
      notifyChanged()
    }
  } catch {
    /* sin IndexedDB: el envío en segundo plano no estará disponible, nada más */
  }
}

/** Pide al navegador que vacíe la cola en segundo plano (Chrome/Android). */
async function requestBackgroundSync(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.ready
    // No existe en Safari/iOS ni Firefox: allí basta con el vaciado desde la página.
    const sync = (reg as unknown as { sync?: { register: (tag: string) => Promise<void> } })?.sync
    await sync?.register(SYNC_TAG)
  } catch {
    /* sin permiso o sin soporte: seguimos con el vaciado normal */
  }
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
  // En Android esto permite enviarlo aunque el usuario cierre la app.
  void requestBackgroundSync()
}

export async function pendingCount(): Promise<number> {
  try {
    return await tx<number>('readonly', (s) => s.count())
  } catch {
    return 0 // sin IndexedDB (modo privado antiguo): la app sigue funcionando
  }
}

/** Cuántas cosas quedan y si alguna está esperando a que vuelvas a iniciar sesión. */
export async function pendingStatus(): Promise<{ count: number; needsAuth: boolean }> {
  try {
    const items = await allItems()
    return { count: items.length, needsAuth: items.some((i) => i.needsAuth) }
  } catch {
    return { count: 0, needsAuth: false }
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
    const now = Date.now()
    for (const item of await allItems()) {
      // ¿Lo está enviando ya el service worker (Android, en segundo plano)? Lo saltamos.
      if (item.claimedAt && now - item.claimedAt < CLAIM_TTL_MS) continue
      await tx('readwrite', (s) => s.put({ ...item, claimedAt: Date.now() }))
      try {
        // El EXIF se guardó al encolar, no ahora: lo que hay en la cola ya está
        // comprimido y por tanto sin metadatos. Y es justo aquí donde más importa —
        // sin cobertura estabas delante de la fuente, y esto puede subirse días después.
        const image = item.photo
          ? await uploadImage(toFile(item.photo, item.photoName), item.photoMeta)
          : undefined
        if (item.kind === 'font') {
          const font = await createFont({ ...item.data, image: image ?? item.data.image }, true)
          // El estado que se indicó al crearla, como primera actualización.
          if (item.waterStatus) {
            try {
              await createComment(font.id, { waterStatus: item.waterStatus }, true)
            } catch {
              /* la fuente ya está creada: no la reencolamos por esto */
            }
          }
        } else {
          await createComment(item.fontID, { ...item.data, image: image ?? item.data.image }, true)
        }
        await tx('readwrite', (s) => s.delete(item.id))
        sent++
      } catch (e) {
        // Todo lo TRANSITORIO se reintenta indefinidamente: la aportación del usuario
        // no se descarta nunca por algo que no dependa de ella. Liberamos la marca para
        // que un reintento inmediato ("enviar ahora") pueda volver a cogerlo.
        // Sesión caducada: reintentar no sirve de nada hasta que el usuario vuelva a
        // entrar, y si no se lo decimos, el aviso de pendientes se queda ahí para
        // siempre sin explicación. Lo marcamos y paramos.
        if (e instanceof ApiError && e.status === 401) {
          await tx('readwrite', (s) => s.put({ ...item, claimedAt: 0, needsAuth: true }))
          notifyChanged()
          break
        }
        const transient =
          isOffline(e) ||                                  // seguimos sin red
          (e instanceof ApiError && (e.status === 429 ||   // límite de uso: es cuestión de esperar
                                     e.status >= 500))     // el servidor está mal
        if (transient) {
          await tx('readwrite', (s) => s.put({ ...item, claimedAt: 0 }))
          break
        }
        // Solo un 4xx (validación, fuente borrada…) significa que estos datos NO van a
        // entrar nunca: unos reintentos y fuera, para no bloquear la cola eternamente.
        const attempts = item.attempts + 1
        if (attempts >= MAX_ATTEMPTS) await tx('readwrite', (s) => s.delete(item.id))
        else await tx('readwrite', (s) => s.put({ ...item, attempts, claimedAt: 0 }))
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
