import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addRecentFountain, addRecentSearch, clearRecentHistory,
  recentFountains, recentSearches, rememberFountain, rememberSearch,
} from '../src/lib/recentHistory.ts'

/** `localStorage` de mentira: el historial vive ahí y es lo único que hay que aislar. */
function conAlmacen() {
  const datos = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => { datos.set(k, v) },
    removeItem: (k: string) => { datos.delete(k) },
  }
  return datos
}

test('las búsquedas recientes se deduplican y la última vuelve arriba', () => {
  let items: string[] = []
  items = addRecentSearch(items, '  ruta   del agua ')
  items = addRecentSearch(items, 'Madrid')
  items = addRecentSearch(items, 'Ruta del agua')
  assert.deepEqual(items, ['Ruta del agua', 'Madrid'])
})

test('no guarda cada tecla ni permite que el historial crezca para siempre', () => {
  let items = addRecentSearch([], 'a')
  for (let i = 0; i < 10; i += 1) items = addRecentSearch(items, `lugar ${i}`)
  assert.equal(items.length, 6)
  assert.equal(items[0], 'lugar 9')
})

test('una fuente revisitada sube al principio sin duplicarse', () => {
  const a = { id: 'a', name: 'A', latitude: 1, longitude: 2 }
  const b = { id: 'b', name: 'B', latitude: 3, longitude: 4 }
  const items = addRecentFountain(addRecentFountain(addRecentFountain([], a), b), a)
  assert.deepEqual(items.map((item) => item.id), ['a', 'b'])
})

test('cada cuenta tiene su historial: en un móvil prestado no se ve el del otro', () => {
  // Es la única consecuencia seria de esta función. El ámbito es el id de usuario, y si
  // se cruzara, la persona que entra después vería lo que buscó la anterior.
  conAlmacen()
  rememberSearch('la fuente de casa', 'ana')
  rememberSearch('hospital', 'bruno')
  assert.deepEqual(recentSearches('ana'), ['la fuente de casa'])
  assert.deepEqual(recentSearches('bruno'), ['hospital'])
  assert.deepEqual(recentSearches('anonymous'), [])
})

test('borrar el historial borra las dos listas, y solo las de esa cuenta', () => {
  conAlmacen()
  rememberSearch('algo', 'ana')
  rememberFountain({ id: 'a', name: 'A', latitude: 1, longitude: 2 }, 'ana')
  rememberSearch('otra cosa', 'bruno')
  clearRecentHistory('ana')
  assert.deepEqual(recentSearches('ana'), [])
  assert.deepEqual(recentFountains('ana'), [])
  assert.deepEqual(recentSearches('bruno'), ['otra cosa'], 'no se lleva por delante el ajeno')
})

test('un almacenamiento con basura no rompe el buscador', () => {
  // Modo privado, una versión vieja del formato, o alguien tocando el inspector.
  const datos = conAlmacen()
  datos.set('history:searches:v1:ana', 'esto no es JSON')
  datos.set('history:fountains:v1:ana', '{"no":"es una lista"}')
  assert.deepEqual(recentSearches('ana'), [])
  assert.deepEqual(recentFountains('ana'), [])
})
