import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const layout = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8')
const moreMenu = readFileSync(new URL('../src/components/MoreMenu.tsx', import.meta.url), 'utf8')

/**
 * Contratos de producto sobre navegación crítica.
 *
 * Son deliberadamente tests del componente, no solo de una tabla auxiliar: la regresión
 * que los motivó conservaba la intención en comentarios, pero el `display` real ocultó
 * la principal entrada de ingresos durante varias versiones.
 */
test('Apóyame conserva accesos explícitos en móvil y escritorio', () => {
  const mobile = layout.match(/<IconButton\s+data-testid="mobile-support-link"[\s\S]*?<\/IconButton>/)?.[0]
  const desktop = layout.match(/<Button\s+data-testid="desktop-support-link"[\s\S]*?<\/Button>/)?.[0]

  assert.ok(mobile, 'falta el acceso móvil a /support')
  assert.match(mobile, /to="\/support"/)
  assert.match(mobile, /xs:\s*'inline-flex'/, 'el corazón móvil debe ser visible en xs')
  assert.ok(desktop, 'falta el acceso de escritorio a /support')
  assert.match(desktop, /to="\/support"/)
})

test('el menú móvil no duplica ninguna pestaña principal', () => {
  for (const route of ['/', '/activity', '/zones', '/me']) {
    assert.doesNotMatch(moreMenu, new RegExp(`to=["']${route.replace('/', '\\/')}["']`))
  }
})
