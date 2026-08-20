import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { esNombreValido } from '../src/lib/username.ts'

test('acepta lo que el servidor acepta', () => {
  for (const n of ['maria_r', 'oriol_t', 'jose.maria', 'a-b-c', 'abc', 'x'.repeat(30)]) {
    assert.equal(esNombreValido(n), true, n)
  }
})

test('rechaza lo que rompería una mención', () => {
  // Estos son el motivo de la regla, no un capricho: `@josé maría` no falla, **acierta
  // a otro** — el parser corta en el primer carácter que no vale y menciona a `jos`.
  for (const n of ['jose maria', 'josé', 'ana b', 'ma', 'x'.repeat(31), '', 'con@arroba']) {
    assert.equal(esNombreValido(n), false, n)
  }
})
