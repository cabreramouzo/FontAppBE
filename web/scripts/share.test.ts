import assert from 'node:assert/strict'
import { test } from 'node:test'
import { comparteTexto, enlaceLocalizado, type NavegadorQueComparte } from '../src/lib/share.ts'

/**
 * Lo que se le entrega a la hoja del sistema.
 *
 * Existe porque el fallo que hubo aquí **no se ve leyendo el código**: pasar
 * `{ text, url }` por separado es lo que parece correcto, compila, no da ningún error y
 * funciona en la mitad de los destinos. En la otra mitad —WhatsApp entre ellos— llega solo
 * la dirección, sin la frase. Se descubrió compartiendo la app y viendo lo que caía en el
 * chat, que es un sitio donde no llega ningún test.
 */
function navFalso() {
  const llamadas: unknown[] = []
  return {
    llamadas,
    nav: {
      share: async (d: unknown) => { llamadas.push(d) },
      clipboard: { writeText: async (t: string) => { llamadas.push({ portapapeles: t }) } },
    } as NavegadorQueComparte,
  }
}

test('la dirección viaja dentro del texto, y NUNCA en el campo url', async () => {
  const { nav, llamadas } = navFalso()
  const r = await comparteTexto('Mira esto: https://fontapp.net/?p=amigos', nav)
  assert.equal(r, 'compartido')
  const d = llamadas[0] as Record<string, unknown>
  // La mitad que importa: si alguien "arregla" esto separando los campos, salta aquí.
  assert.ok(!('url' in d), 'no puede haber campo url: medio destino tira el texto y deja solo el enlace')
  assert.match(String(d.text), /^Mira esto: https:\/\/fontapp\.net\/\?p=amigos$/)
})

test('sin hoja del sistema se copia el mensaje entero, no solo el enlace', async () => {
  const { nav, llamadas } = navFalso()
  const sinShare: NavegadorQueComparte = { clipboard: nav.clipboard }
  const r = await comparteTexto('Frase y https://fontapp.net', sinShare)
  assert.equal(r, 'copiado')
  // Lo copiado es el mensaje completo: en el respaldo también se perdía la frase si se
  // copiaba solo la dirección, que es lo que hacía uno de los tres sitios.
  assert.deepEqual(llamadas, [{ portapapeles: 'Frase y https://fontapp.net' }])
})

test('cancelar la hoja no es un error que haya que contar', async () => {
  const nav = {
    share: async () => { throw new DOMException('Share canceled', 'AbortError') },
    clipboard: { writeText: async () => {} },
  } as NavegadorQueComparte
  assert.equal(await comparteTexto('x', nav), 'nada')
})

test('el idioma viaja en la dirección que leerá el scraper social', () => {
  assert.equal(
    enlaceLocalizado('https://fontapp.net/fonts/123?p=invite', 'pt'),
    'https://fontapp.net/fonts/123?p=invite&lang=pt',
  )
})
