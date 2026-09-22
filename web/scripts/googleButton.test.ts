import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * El botón de Google no puede volver a vibrar.
 *
 * ## Qué falló
 *
 * GSI (`accounts.google.com/gsi/client`) pinta el botón dentro de un contenedor que le
 * pasamos. Si ese `render()` se llama más de una vez sobre el mismo contenedor —un
 * remontaje del componente, una carrera entre la carga del script y el efecto, o un
 * reajuste del viewport en móvil— el botón se **destruye y se reconstruye**, y eso en
 * pantalla se ve como un parpadeo/vibración de unos segundos. Se reportó dos veces: una en
 * el login (arreglada con el patrón de refs, commit d3334dc) y otra al llevar el botón al
 * registro, cuando por un instante llegaron a verse **dos** botones apilados.
 *
 * ## Por qué un test sobre el fichero y no sobre la pantalla
 *
 * `GoogleSignInButton` importa React, MUI y el contexto de auth, así que no se puede montar
 * desde un test de Node —`web/` no tiene runner de DOM ni RTL, a propósito—. Y el fallo no
 * se reproduce fiablemente en un navegador de escritorio: es transitorio y sale sobre todo
 * en móvil. Lo único que se puede fijar aquí es la causa, que son dos líneas del
 * componente: que exista un contenedor con alto reservado y que el pintado sea idempotente.
 * Mismo criterio que `layout-css.test.ts` y `api-timeouts.test.ts`.
 */
const src = readFileSync(
  fileURLToPath(new URL('../src/components/GoogleSignInButton.tsx', import.meta.url)),
  'utf8',
)

test('Google loading content cannot change the reserved height or document overflow', () => {
  const css = readFileSync(fileURLToPath(new URL('../src/index.css', import.meta.url)), 'utf8')
  const slot = css.match(/\.google-sign-in-slot\s*\{([^}]+)\}/)?.[1] ?? ''
  const host = css.match(/\.google-sign-in-host\s*\{([^}]+)\}/)?.[1] ?? ''
  assert.match(src, /className="google-sign-in-slot"[\s\S]*ref=\{box\} className="google-sign-in-host"/)
  // A delayed, unstyled iframe grew the former min-height slot by 106px in browser QA.
  assert.match(slot, /(?:^|;)\s*height:\s*44px/)
  assert.match(slot, /overflow:\s*clip/)
  assert.match(slot, /position:\s*relative/)
  assert.match(host, /position:\s*absolute/)
})

test('GSI pinta dentro de ese contenedor, no en document.body', () => {
  // Si `renderButton` recibiera otra cosa que `box.current`, el botón dejaría de estar en
  // su contenedor y el alto reservado no serviría de nada.
  assert.match(src, /renderButton\(\s*box\.current\s*,/,
    'renderButton debe pintar en box.current')
})

test('el pintado es idempotente: no repinta si el contenedor ya tiene el botón', () => {
  // Esta es la guarda que impide la vibración: un segundo render() sobre un contenedor que
  // ya tiene el botón tiene que salir sin tocar nada, en vez de reconstruirlo.
  assert.match(src, /box\.current\.childElementCount\s*>\s*0[\s\S]{0,40}return/,
    'render() debe cortar cuando el contenedor ya tiene un hijo (childElementCount > 0)')
  // Y no debe vaciar el contenedor antes de pintar: `replaceChildren()` era justo lo que
  // destruía y reconstruía el botón. Con la guarda de arriba ya no hace falta.
  assert.doesNotMatch(src, /replaceChildren\(\)/,
    'no debe usarse replaceChildren(): vaciar y repintar es lo que causaba el parpadeo')
})

test('el efecto corre una sola vez (los valores que cambian van por ref)', () => {
  // `loginWithGoogle` y `t` cambian de identidad en cada render; si estuvieran en las
  // dependencias del efecto, este se re-ejecutaría y repintaría el botón. Van por ref y las
  // dependencias son `[]`. Es la otra mitad de la defensa contra el parpadeo.
  assert.match(src, /loginGoogleRef\.current\s*=\s*loginWithGoogle/,
    'loginWithGoogle debe leerse por ref, no como dependencia')
  assert.match(src, /\}, \[\]\)/, 'el efecto de GSI debe tener dependencias vacías')
})
