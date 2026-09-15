/**
 * La foto de una aportación en la bandeja de salida, guardada de forma que **sobreviva a
 * iOS**.
 *
 * En iOS/WebKit un `Blob` recuperado de IndexedDB deja de poder leerse una vez cerrada la
 * transacción que lo sacó: da imagen rota en el visor y falla al subirse como si no
 * hubiera red. Por eso la foto se guarda como bytes (`ArrayBuffer`, que IDB conserva
 * intacto) y el Blob se reconstruye **fresco en memoria** cada vez que se usa.
 *
 * Vive aparte de `outbox.ts` porque aquel importa de `api/client.ts`, que lee
 * `import.meta.env` y no se puede importar desde un test de Node — y esto sí hay que
 * probarlo, es donde estaba el fallo.
 */
export interface FotoGuardada {
  photoBytes?: ArrayBuffer
  photoType?: string
  /** Solo en elementos guardados ANTES de este cambio; no se genera ya. */
  photo?: Blob
}

/** ¿Lleva foto, esté como bytes (nuevo) o como Blob (guardado antes del cambio)? */
export function tieneFoto(item: FotoGuardada): boolean {
  return Boolean(item.photoBytes || item.photo)
}

/**
 * La foto como Blob fresco en memoria. Nunca devuelve el Blob que sale directo de IDB:
 * en iOS ese ya viene muerto. Los elementos antiguos sin bytes caen a su `photo` de
 * siempre — no se arreglan hacia atrás, pero tampoco empeoran.
 */
export function fotoDe(item: FotoGuardada): Blob | undefined {
  if (item.photoBytes) return new Blob([item.photoBytes], { type: item.photoType || 'image/jpeg' })
  return item.photo
}

/** Pasa un Blob (fresco, recién capturado) a los bytes que se guardan en IDB. */
export async function desmontaFoto(photo: Blob): Promise<{ photoBytes: ArrayBuffer; photoType: string }> {
  return { photoBytes: await photo.arrayBuffer(), photoType: photo.type || 'image/jpeg' }
}
