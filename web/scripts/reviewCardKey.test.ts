import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Editar la última reseña no puede editar otra.
 *
 * ## Qué falló
 *
 * `ReviewCard` inicializa su estado de edición (`body`, `rating`, `waterStatus`) desde las
 * props **una sola vez, al montar** (`useState(c.body)`, etc.). La tarjeta de la reseña más
 * reciente (`latest = comments[0]`) se pintaba **sin `key`** y siempre en la misma posición
 * del árbol, así que React **reutilizaba la misma instancia** entre recargas: la fuente
 * tenía una reseña R1, la instancia montaba con los datos de R1, y al publicar R2 hoy
 * `latest` pasaba a ser R2 pero la instancia conservaba el estado de R1. Editar «la última»
 * arrastraba entonces la reseña equivocada. Reportado en campo tras reseñar dos veces la
 * misma fuente.
 *
 * Las tarjetas de `rest` nunca lo sufrieron porque van `key={c.id}`: cada comentario tiene
 * su instancia. La de arriba tenía que hacer lo mismo — así, cuando cambia cuál es la
 * última, React desmonta la vieja y monta una nueva con el estado correcto.
 *
 * ## Por qué un test sobre el fichero y no sobre la pantalla
 *
 * `FontDetailPage` importa React, MUI, router y varios contextos; no se puede montar desde
 * un test de Node —`web/` no tiene runner de DOM ni RTL, a propósito—. Lo que se puede fijar
 * aquí es la causa: que la tarjeta de `latest` lleve `key={latest.id}`. Mismo criterio que
 * `googleButton.test.ts`, `layout-css.test.ts` y `api-timeouts.test.ts`.
 */
const src = readFileSync(
  fileURLToPath(new URL('../src/pages/FontDetailPage.tsx', import.meta.url)),
  'utf8',
)

test('la tarjeta de la última reseña lleva key={latest.id}', () => {
  // Sin la key, React reutiliza la instancia de posición 0 y su estado de edición se queda
  // pegado a la reseña anterior. La key hace que la identidad siga al comentario.
  assert.match(src, /<ReviewCard\s+key=\{latest\.id\}\s+c=\{latest\}/,
    'el <ReviewCard c={latest}> debe llevar key={latest.id} para remontarse al cambiar la última reseña')
})

test('las tarjetas de reseñas anteriores siguen keyed por id', () => {
  // La otra mitad de la regla: cada reseña, su instancia. Si esto se rompe, el mismo bug
  // vuelve por la lista de «anteriores».
  assert.match(src, /<ReviewCard\s+key=\{c\.id\}/,
    'las reseñas de `rest` deben renderizarse con key={c.id}')
})
