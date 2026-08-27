/**
 * Notificaciones del sistema (Web Push).
 *
 * ## Dónde funciona y dónde no, que aquí importa
 *
 * En Android, en cualquier navegador Chromium. En **iOS solo si la app está instalada en
 * la pantalla de inicio** (16.4+): en una pestaña de Safari `PushManager` ni existe. Por
 * eso `sePuede()` mira que el permiso sea pedible, y la pantalla lo dice en vez de ofrecer
 * un interruptor que no hará nada — que es lo que convierte una función en «esta app está
 * rota».
 *
 * ## El permiso se pide desde un GESTO
 *
 * No al arrancar. Un permiso pedido a bocajarro se deniega, y **denegado se queda para
 * siempre**: no hay forma de volver a preguntar desde la web. Es la misma regla que el
 * mapa sigue con la ubicación.
 */
import { apiFetch } from '../api/client'

/** ¿Este navegador puede, siquiera? */
export function sePuede(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export type EstadoPush = 'no-soportado' | 'denegado' | 'apagado' | 'encendido'

export async function estado(): Promise<EstadoPush> {
  if (!sePuede()) return 'no-soportado'
  if (Notification.permission === 'denied') return 'denegado'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'encendido' : 'apagado'
}

/** La clave pública del servidor, en el formato que pide `subscribe`. */
function bytesDeClave(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  // Se escribe sobre un `ArrayBuffer` propio y no con `Uint8Array.from`: el tipo de aquél
  // admite `SharedArrayBuffer`, que `applicationServerKey` no acepta.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function aBase64URL(buf: ArrayBuffer | null): string {
  if (!buf) return ''
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Enciende los avisos. Devuelve `false` si no se pudo (permiso denegado, sin claves en el
 * servidor, navegador sin soporte) — nunca lanza: esto cuelga de un interruptor y no puede
 * tumbar la pantalla de ajustes.
 */
export async function enciende(): Promise<boolean> {
  if (!sePuede()) return false
  try {
    const { key } = await apiFetch<{ key: string | null }>('/push/key')
    // Sin claves configuradas en el servidor no se pide ningún permiso: gastarle a alguien
    // su único «permitir» para nada es lo peor que se puede hacer aquí.
    if (!key) return false

    const permiso = await Notification.requestPermission()
    if (permiso !== 'granted') return false

    const reg = await navigator.serviceWorker.ready
    // Si ya había una suscripción se reutiliza: `subscribe` con otra clave falla, y volver
    // a suscribir el mismo aparato crearía un endpoint nuevo dejando el viejo muerto.
    const sub = await reg.pushManager.getSubscription()
      ?? await reg.pushManager.subscribe({
        // Obligatorio en Chromium: sin él, `subscribe` lanza. Significa «cada push
        // mostrará una notificación visible», que es exactamente lo que hacemos.
        userVisibleOnly: true,
        applicationServerKey: bytesDeClave(key),
      })

    await apiFetch('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: aBase64URL(sub.getKey('p256dh')),
        auth: aBase64URL(sub.getKey('auth')),
      }),
    })
    return true
  } catch {
    return false
  }
}

/**
 * Apaga los avisos **en este aparato**.
 *
 * Se avisa al servidor ANTES de darse de baja en el navegador: al revés, si la red falla
 * nos quedamos sin endpoint que borrar y el servidor seguiría escribiendo a un destino
 * muerto hasta que el servicio de push devolviera un 410.
 */
export async function apaga(): Promise<void> {
  if (!sePuede()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    try {
      await apiFetch('/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: sub.endpoint }),
      })
    } catch {
      /* sin red: se da de baja igual aquí, y el servidor lo limpiará con el primer 410 */
    }
    await sub.unsubscribe()
  } catch {
    /* nada que hacer: el interruptor volverá a su sitio al releer el estado */
  }
}
