/** Las celebraciones vistas pertenecen a una cuenta concreta, incluso en un navegador compartido. */
export function celebrationStorageKey(base: string, userID: string): string {
  return `${base}:${userID}`
}
