import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/**
 * Cada cosa que baja el service worker espera lo suyo.
 *
 * El timeout se puso para que nada se colgara **minutos** con cobertura mala, y eso hacía
 * falta. Pero cuatro segundos se aplicaron igual a las teselas, a las fotos y al shell, y
 * ahí no se rinde: **mata peticiones que iban a llegar**. Reportado dos días después —
 * «ha tardado unos 30 segundos en pintarse todas las teselas»—, porque una tesela abortada
 * no llega **ni se guarda**, así que el cuadro se queda en blanco hasta que Leaflet la
 * vuelve a pedir en el siguiente movimiento.
 *
 * Lo que no se vio al ponerlo: **el reloj arranca al llamar a `fetch`, no al abrirse la
 * conexión**. El navegador permite unas seis conexiones por dominio y un zoom pide veinte
 * teselas de golpe, así que las de la cola se gastan el presupuesto esperando turno.
 *
 * Se fija sobre el fichero porque `sw.js` es un script de service worker que no se puede
 * importar desde Node sin un `self` de mentira, y porque lo que se rompe aquí **no falla
 * ningún test ni da ningún error**: volver a un único plazo deja el mapa medio pintado en
 * el móvil de otra persona, que es donde no llega nada de esto.
 */
const src = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

const numero = (nombre: string): number => {
  const m = src.match(new RegExp(`const ${nombre} = ([0-9_]+)`))
  assert.ok(m, `falta ${nombre}`)
  return Number(m![1].replace(/_/g, ''))
}

test('las teselas y las fotos esperan más que el plazo base', () => {
  // Cuatro segundos es lo que se demostró demasiado corto para las dos.
  assert.ok(numero('TILE_TIMEOUT_MS') >= 10_000, 'una tesela en cola gasta segundos sin pedir nada')
  assert.ok(numero('PHOTO_TIMEOUT_MS') >= 15_000, 'una foto son 386 KB de media, medido en producción')
  assert.ok(numero('TILE_TIMEOUT_MS') > numero('FETCH_TIMEOUT_MS'))
  assert.ok(numero('PHOTO_TIMEOUT_MS') > numero('TILE_TIMEOUT_MS'))
})

test('el shell se rinde antes: tiene plan B y bloquea el arranque', () => {
  assert.ok(numero('SHELL_TIMEOUT_MS') < numero('TILE_TIMEOUT_MS'))
})

test('cada uso de cacheFirst pasa su propio plazo', () => {
  // Sin esto los tres vuelven al valor por defecto sin que nadie lo note.
  for (const t of ['TILE_TIMEOUT_MS', 'PHOTO_TIMEOUT_MS', 'SHELL_TIMEOUT_MS']) {
    assert.match(src, new RegExp(`cacheFirst\\(req,[^)]*timeout: ${t}`), `cacheFirst sin ${t}`)
  }
})

test('y sigue habiendo un tope: rendirse tarde es mejor que no rendirse', () => {
  // El fallo original era colgarse minutos y hacerle cola a todo lo demás.
  for (const t of ['TILE_TIMEOUT_MS', 'PHOTO_TIMEOUT_MS', 'SHELL_TIMEOUT_MS']) {
    assert.ok(numero(t) <= 30_000, `${t} tan alto que vuelve a ser un cuelgue`)
  }
})
