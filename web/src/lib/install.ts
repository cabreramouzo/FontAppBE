/**
 * Todo lo que la app sabe sobre instalarse en la pantalla de inicio.
 *
 * ## Por qué es un módulo y no dos componentes
 *
 * Esto lo preguntan dos sitios —el aviso flotante (`InstallPrompt`) y la página
 * permanente (`/install`)—, y son preguntas donde equivocarse es caro y silencioso:
 * ofrecer «instálala» a quien ya la tiene instalada, o dar la instrucción de Safari a
 * quien está en Chrome, donde **no funciona**. Con la detección copiada en dos sitios,
 * la segunda copia se queda vieja el día que alguien afine la primera.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function esIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS se presenta como Mac con pantalla táctil.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Corriendo ya como app (no en una pestaña del navegador). */
export function esStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS expone su propio flag.
    (navigator as unknown as { standalone?: boolean }).standalone === true
}

/**
 * ¿La damos por instalada? O corre en modo app, o la instaló antes (evento
 * `appinstalled`, persistido en `main.tsx`) aunque ahora la abra en el navegador —que
 * es el caso que no se puede detectar de ninguna otra forma.
 */
export function estaInstalada(): boolean {
  if (esStandalone()) return true
  try {
    return localStorage.getItem('fontapp_installed') === '1'
  } catch {
    return false
  }
}

/**
 * Qué instrucciones tocan aquí.
 *
 * `iosOtro` está separado de `ios` a propósito y no es un detalle: en el iPhone,
 * «añadir a la pantalla de inicio» **solo existe en Safari**. Chrome, Firefox y Edge en
 * iOS son Safari por dentro pero no traen esa opción, así que darles los pasos de
 * Safari es mandarles a buscar un botón que no está — y quedar como que la app no
 * funciona.
 */
export type Plataforma = 'ios' | 'iosOtro' | 'android' | 'escritorio'

export function plataforma(): Plataforma {
  const ua = navigator.userAgent
  // Android se pregunta ANTES que iOS a propósito. `esIOS()` incluye la heurística de
  // iPadOS —que se presenta como Mac— y esa es «platform MacIntel + pantalla táctil»,
  // que un navegador con emulación de móvil cumple sin ser un iPad. Un iPad de verdad
  // nunca lleva «Android» en la UA, así que preguntar primero por Android no le quita
  // ningún caso y elimina el error que más caro sale: dar los pasos de Safari a alguien
  // de Android, que es exactamente lo que `iosOtro` existe para evitar.
  if (/Android/i.test(ua)) return 'android'
  if (esIOS()) {
    return /CriOS|FxiOS|EdgiOS|OPT\//.test(ua) ? 'iosOtro' : 'ios'
  }
  return 'escritorio'
}

/**
 * El evento que Chromium guarda para poder instalar de un toque, si lo hemos cazado.
 *
 * Puede no estar por razones normales (Safari no lo tiene, Chrome solo lo dispara si la
 * PWA cumple sus criterios, y no vuelve a dispararlo una vez usado), así que **quien lo
 * pida tiene que saber vivir sin él**: cuando falta, quedan las instrucciones a mano.
 */
export function instalacionDeUnToque(): BeforeInstallPromptEvent | null {
  return (window.__bipEvent as BeforeInstallPromptEvent | undefined) ?? null
}

/** Lanza el diálogo nativo. Devuelve si el navegador llegó a enseñarlo. */
export async function instalaAhora(): Promise<boolean> {
  const evento = instalacionDeUnToque()
  if (!evento) return false
  await evento.prompt()
  await evento.userChoice
  // Un `beforeinstallprompt` solo se puede usar una vez.
  window.__bipEvent = undefined
  return true
}
