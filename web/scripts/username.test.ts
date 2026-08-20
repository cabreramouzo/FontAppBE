import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { esNombreValido, pareceCorreo } from '../src/lib/username.ts'

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

test('reconoce un nombre de usuario que es una dirección de correo', () => {
  // Los dos casos reales de producción.
  assert.equal(pareceCorreo('joansws@gmail.com'), true)
  assert.equal(pareceCorreo('juanmanuelvizcainoabad@gmail.com'), true)
})

test('y no confunde con uno normal', () => {
  for (const n of ['maria_r', 'jose.maria', 'Sebas', 'Toni Serra', 'a@b', 'arroba@']) {
    assert.equal(pareceCorreo(n), false, n)
  }
})
