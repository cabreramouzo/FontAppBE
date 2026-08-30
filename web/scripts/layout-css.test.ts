import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * El contrato de alto del documento, que es lo que mantiene clavada la tab bar.
 *
 * ## Qué falló
 *
 * `html, body { height: 100% }` venía de cuando la app era solo el mapa y ninguna página
 * se desplazaba («se comporta como una app», decía el comentario). Hoy casi todas se
 * desplazan, y entonces esa regla deja el documento fijado a **un viewport exacto**
 * mientras el contenido mide mucho más. Medido en producción en `/zones`: `html` y `body`
 * a **812 px** con **67.998 px** de contenido.
 *
 * Blink lo tolera y por eso en Chrome no se reproduce. **WebKit no**: los elementos
 * `position: fixed` se anclan a esa caja, así que al desplazarse la tab bar viaja con el
 * contenido y sube hasta media pantalla. Se reportó desde un iPhone.
 *
 * ## Por qué un test sobre el CSS y no sobre la pantalla
 *
 * Porque el fallo **no se ve en el navegador que tenemos**: en Chrome la barra se queda
 * clavada con la regla mala puesta, así que cualquier comprobación de posición pasaría en
 * verde. Lo único que se puede fijar aquí es la causa, que es una línea de CSS y es
 * exactamente lo que hay que impedir que vuelva.
 *
 * No cubre todas las formas de descolocar un `fixed` —un `transform` en un ancestro haría
 * lo mismo— pero sí la que ocurrió.
 */
const css = readFileSync(fileURLToPath(new URL('../src/index.css', import.meta.url)), 'utf8')

/** El cuerpo de la primera regla cuyo selector sea exactamente `sel`. */
function bloque(sel: string): string {
  const i = css.indexOf(`${sel} {`)
  assert.notEqual(i, -1, `no existe la regla \`${sel}\` en index.css`)
  const abre = css.indexOf('{', i)
  const cierra = css.indexOf('}', abre)
  return css.slice(abre + 1, cierra)
}

/** Declaraciones de la regla, ya sin comentarios: son varias líneas y explican el porqué. */
function declaraciones(sel: string): string[] {
  return bloque(sel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
}

test('html y body no fijan el alto a un viewport: el documento crece con su contenido', () => {
  const decls = declaraciones('html, body')
  const alturas = decls.filter((d) => /^height\s*:/.test(d))
  assert.deepEqual(alturas, [],
    `\`html, body\` no puede declarar \`height\`; encontrado: ${alturas.join(', ')}. ` +
    'Con el contenido más alto que el viewport, WebKit desancla los `position: fixed` ' +
    'y la tab bar se desplaza con la página. Usa `min-height`.')
})

test('html y body siguen cubriendo el viewport por debajo, con min-height', () => {
  const decls = declaraciones('html, body')
  assert.ok(decls.some((d) => /^min-height\s*:\s*100%$/.test(d)),
    'sin `min-height: 100%` el fondo no llega abajo en las páginas cortas')
})

test('el alto completo lo sigue poniendo .app, que es de donde se quitó', () => {
  const decls = declaraciones('.app')
  assert.ok(decls.some((d) => /^min-height\s*:\s*100dvh$/.test(d)),
    '.app es quien da el alto de pantalla; sin él, quitarlo de html/body deja las ' +
    'páginas cortas sin ocupar el viewport')
})

test('la tab bar sigue anclada abajo del todo', () => {
  // Si algún día deja de ser `fixed` —o deja de estar pegada a `bottom: 0`— lo de arriba
  // deja de proteger nada, así que el contrato se fija entero y no a medias.
  const tabBar = readFileSync(fileURLToPath(new URL('../src/components/TabBar.tsx', import.meta.url)), 'utf8')
  assert.match(tabBar, /position:\s*'fixed'/, 'la tab bar tiene que seguir siendo fixed')
  assert.match(tabBar, /bottom:\s*0/, 'la tab bar tiene que seguir pegada a bottom: 0')
})
