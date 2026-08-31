import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/**
 * Leer y escribir no esperan lo mismo.
 *
 * **Una lectura se puede reintentar gratis y tiene plan B**: si se agota, la app cae a la
 * zona guardada en el móvil y enseña algo. Esperar doce segundos mirando un mapa vacío es
 * peor que enseñar lo guardado a los cinco — lo reportó quien lo vivió con una raya de 3G.
 *
 * **Una escritura no.** Cortarla pronto no la cancela en el servidor: puede haber llegado
 * igual, y lo que hace la app es encolarla para reintentarla, o sea arriesgar un duplicado
 * por ahorrar segundos.
 *
 * El test va sobre el fichero y no sobre la función porque `api/client.ts` lee
 * `import.meta.env` al cargarse y **no se puede importar desde un test de Node** — es la
 * misma razón por la que `apiError.ts` vive aparte. Lo que se fija es lo que se rompería
 * en silencio: unificar los tres plazos en uno «para simplificar» dejaría las escrituras
 * cortándose a los 5 s (duplicados) o las lecturas esperando 12 (el fallo reportado), y
 * ninguna de las dos cosas falla ningún test ni da ningún error.
 */
const src = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')

test('hay tres plazos distintos y no uno solo', () => {
  assert.match(src, /const READ_TIMEOUT_MS = 5_000/)
  assert.match(src, /const REQUEST_TIMEOUT_MS = 12_000/)
  assert.match(src, /const UPLOAD_TIMEOUT_MS = 45_000/)
})

test('las lecturas usan el corto y las escrituras el largo', () => {
  const i = src.indexOf('const espera =')
  assert.notEqual(i, -1, 'ya no se elige el plazo en un solo sitio')
  const linea = src.slice(i, src.indexOf('\n', i))
  assert.match(linea, /isUpload \? UPLOAD_TIMEOUT_MS/)
  assert.match(linea, /isRead \? READ_TIMEOUT_MS/)
  assert.match(linea, /: REQUEST_TIMEOUT_MS/)
})

test('sin `method` cuenta como lectura, que es como lo llama fetch', () => {
  // Casi todas las lecturas de este fichero llaman sin `method`. Si esto se invirtiera,
  // las lecturas pasarían a esperar 12 s y volvería el mapa en blanco que esto arregla.
  assert.match(src, /\(init\?\.method \?\? 'GET'\)\.toUpperCase\(\) === 'GET'/)
})
