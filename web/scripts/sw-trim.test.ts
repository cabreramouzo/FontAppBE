import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/**
 * Recortar el caché no puede costar enumerarlo entero **en cada guardado**.
 *
 * `cache.keys()` deserializa todas las entradas: con el tope de teselas en 3.000, cada
 * llamada son tres mil `Request` leídos del disco. Y se llamaba una vez por tesela
 * guardada. Un zoom pide unas cuarenta de golpe → cuarenta enumeraciones de tres mil, en
 * el **único hilo** del service worker, que es el mismo que atiende las peticiones
 * siguientes. Reportado con captura: la mayoría de teselas en gris y ~20 s para pintar el
 * mapa al volver a acercarlo.
 *
 * No fue una regresión de un día: iba a peor **según se llenaba el caché**, y se aceleró
 * al subir el tope de 700 a 3.000. Por eso pareció aparecer de golpe y por eso no se
 * arregló quitando el timeout.
 *
 * El test cuenta **llamadas a `keys()`**, que es lo que costaba, y no el resultado — el
 * resultado siempre fue correcto; lo que fallaba era el precio.
 */
function cargaSW() {
  const codigo = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  const self = {
    location: { href: 'https://fontapp.net/sw.js', origin: 'https://fontapp.net' },
    addEventListener: () => {}, skipWaiting: () => {}, clients: { claim: () => {} }, registration: {},
  }
  let enumeraciones = 0
  const entradas: { url: string }[] = []
  const cache = {
    keys: async () => { enumeraciones++; return entradas.slice() },
    delete: async (k: { url: string }) => { const i = entradas.indexOf(k); if (i >= 0) entradas.splice(i, 1); return true },
  }
  const caches = { open: async () => cache }
  const fn = new Function('self', 'caches', 'fetch', 'Response', 'clients',
    `${codigo}\n;return { trimCache };`)
  const api = fn(self, caches, () => {}, class {}, {})
  return { api, entradas, veces: () => enumeraciones }
}

test('guardar mil teselas no enumera el caché mil veces', async () => {
  const { api, entradas, veces } = cargaSW()
  for (let i = 0; i < 1000; i++) {
    entradas.push({ url: `https://a.tile.openstreetmap.org/14/${i}/0.png` })
    await api.trimCache('fontapp-tiles-v2', 3000)
  }
  // Una para contar al arrancar el worker, y ninguna más mientras quepa.
  assert.equal(veces(), 1, `enumeró ${veces()} veces: eso es lo que dejaba el mapa en gris`)
})

test('y al pasar del tope recorta por debajo, para no volver a entrar enseguida', async () => {
  const { api, entradas, veces } = cargaSW()
  for (let i = 0; i < 120; i++) {
    entradas.push({ url: `https://a.tile.openstreetmap.org/14/${i}/0.png` })
    await api.trimCache('fontapp-tiles-v2', 100)
  }
  assert.ok(entradas.length <= 100, `quedan ${entradas.length}`)
  // Sin histéresis se recortaría en CADA guardado a partir del tope: 21 enumeraciones.
  assert.ok(veces() <= 5, `enumeró ${veces()} veces; con histéresis bastan unas pocas`)
})
