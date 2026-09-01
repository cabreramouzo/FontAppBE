import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/**
 * Un tope solo tiene sentido donde hay plan B.
 *
 * El timeout del service worker se puso para que nada se colgara **minutos** con
 * cobertura mala, y se aplicó también a las teselas con este argumento: «el navegador
 * permite unas seis conexiones por dominio, así que decenas de teselas colgadas le hacen
 * cola a todo lo demás, incluidas las fuentes».
 *
 * **Ese argumento es falso**: el límite es por host, y las teselas salen de
 * `tile.openstreetmap.org` o `ign.es` mientras que la API está en `fontapp.fly.dev`. Son
 * colas distintas. El tope no protegía nada y sí hacía daño, porque **abortar una tesela
 * es definitivo**: Leaflet recibe un error de imagen y no vuelve a pedir ese cuadro hasta
 * que sale y vuelve a entrar en la vista. Subirlo de 4 s a 12 s lo empeoró —una tesela
 * condenada ocupa una conexión el triple de tiempo—, que es como se reportó: «se quedan
 * muchas teselas en gris y no se cargan nunca».
 *
 * Lo que se fija aquí es la **regla**, no los números: hay plan B para el shell (lo
 * guardado) y para las fotos (`ZoomableImage` pinta el hueco y reintenta con `online`);
 * para una tesela no hay ninguno.
 */
const src = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

const valor = (nombre: string): string => {
  const m = src.match(new RegExp(`const ${nombre} = ([A-Za-z0-9_]+)`))
  assert.ok(m, `falta ${nombre}`)
  return m![1]
}
const numero = (nombre: string): number => Number(valor(nombre).replace(/_/g, ''))

test('las teselas no llevan tope: nadie las reintenta', () => {
  assert.equal(valor('TILE_TIMEOUT_MS'), 'null',
    'Un tope aquí convierte una tesela lenta en un cuadro gris para siempre.')
})

test('y `fetchConTimeout` entiende esa ausencia en vez de abortar al instante', () => {
  // Sin esta línea, `null` haría `setTimeout(…, null)` → aborta a los 0 ms y NO carga
  // ninguna tesela. Es el fallo que convertiría el arreglo en algo mucho peor.
  assert.match(src, /if \(ms == null\) return fetch\(req\)/)
})

test('donde sí hay plan B, el tope se queda', () => {
  assert.ok(numero('PHOTO_TIMEOUT_MS') >= 15_000, 'una foto son 386 KB de media, medido')
  assert.ok(numero('SHELL_TIMEOUT_MS') >= 5_000)
  assert.ok(numero('SHELL_TIMEOUT_MS') < numero('PHOTO_TIMEOUT_MS'), 'el shell tiene lo guardado')
  assert.ok(numero('PHOTO_TIMEOUT_MS') <= 30_000, 'tan alto que vuelve a ser un cuelgue')
})

test('cada uso de cacheFirst pasa su propio plazo', () => {
  for (const t of ['TILE_TIMEOUT_MS', 'PHOTO_TIMEOUT_MS', 'SHELL_TIMEOUT_MS']) {
    assert.match(src, new RegExp(`cacheFirst\\(req,[^)]*timeout: ${t}`), `cacheFirst sin ${t}`)
  }
})
