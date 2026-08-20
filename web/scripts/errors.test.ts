import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { ApiError, describeError } from '../src/lib/apiError.ts'

/** `t` de mentira con el comportamiento REAL del de la app: clave cruda si falta. */
const DICC: Record<string, string> = {
  'err.user.emailTaken': 'Ese correo ya está registrado.',
  'error.network': 'Sin conexión',
  'error.unauthorized': 'No autorizado',
  'error.generic': 'Algo ha fallado',
}
const t = (k: string) => DICC[k] ?? k

test('con código conocido, la traducción gana a la frase del servidor', () => {
  const e = new ApiError(409, 'El correo ya está registrado', 'user.emailTaken')
  assert.equal(describeError(e, t), 'Ese correo ya está registrado.')
})

test('con código DESCONOCIDO cae en la frase del servidor, no en la clave cruda', () => {
  // Es el fallo que este diseño existe para evitar: `t()` devuelve la clave si falta,
  // así que un código nuevo (o un cliente sin actualizar) pintaría «err.font.loQueSea».
  const e = new ApiError(409, 'Frase del servidor', 'font.codigoQueNoExiste')
  assert.equal(describeError(e, t), 'Frase del servidor')
})

test('sin código, como siempre', () => {
  assert.equal(describeError(new ApiError(400, 'Falta la zona'), t), 'Falta la zona')
})

test('el fallo de red gana al código: no hay respuesta que traducir', () => {
  assert.equal(describeError(new ApiError(0, '', 'user.emailTaken'), t), 'Sin conexión')
})

test('un 401 con código propio dice el motivo, no «no autorizado»', () => {
  const e = new ApiError(401, 'El enlace ha caducado', 'user.emailTaken')
  assert.equal(describeError(e, t), 'Ese correo ya está registrado.')
})

test('un 401 sin código sigue siendo «no autorizado»', () => {
  assert.equal(describeError(new ApiError(401, 'Unauthorized'), t), 'No autorizado')
})
