const SHELL_CACHE_PREFIX = 'fontapp-shell-'

/** Limpia solo el código cacheado; conserva sesión, datos offline y bandeja de salida. */
export async function recoverAppShell() {
  try {
    if ('caches' in window) {
      const names = await window.caches.keys()
      await Promise.all(
        names.filter((name) => name.startsWith(SHELL_CACHE_PREFIX)).map((name) => window.caches.delete(name)),
      )
    }
  } catch (error) {
    console.warn('No se pudo limpiar la caché de la interfaz:', error)
  }

  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    await registration?.update()
  } catch (error) {
    console.warn('No se pudo actualizar el service worker:', error)
  }
}
