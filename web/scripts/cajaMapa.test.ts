import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { cajaRedondeada, paramsDeCaja } from '../src/lib/cajaMapa.ts'

const vista = { minLat: 41.3401, maxLat: 41.4612, minLong: 2.0503, maxLong: 2.2307 }
const size = { width: 1100, height: 812 }

test('la caja pedida CUBRE la que se ve: nunca se queda por dentro', () => {
  // Redondear al más cercano dejaría una franja del mapa sin fuentes y sin ningún error:
  // el fallo silencioso que esto existe para evitar.
  const c = cajaRedondeada(vista, size, 14)
  assert.ok(c.minLat <= vista.minLat, `minLat ${c.minLat} > ${vista.minLat}`)
  assert.ok(c.maxLat >= vista.maxLat, `maxLat ${c.maxLat} < ${vista.maxLat}`)
  assert.ok(c.minLong <= vista.minLong)
  assert.ok(c.maxLong >= vista.maxLong)
})

test('cambiar el alto unos píxeles no cambia la caja: el caso del mapa en blanco', () => {
  // La franja de avisos aparece y desaparece, y con ella el alto del mapa. Antes eso era
  // otra URL y el caché fallaba.
  const a = cajaRedondeada(vista, { width: 1100, height: 812 }, 14)
  const b = cajaRedondeada(vista, { width: 1100, height: 772 }, 14)
  assert.deepEqual(paramsDeCaja(a).toString(), paramsDeCaja(b).toString())
})

test('un desplazamiento pequeño reutiliza la misma caja', () => {
  const movido = { ...vista, minLat: vista.minLat + 0.0004, maxLat: vista.maxLat + 0.0004 }
  assert.deepEqual(
    paramsDeCaja(cajaRedondeada(vista, size, 14)).toString(),
    paramsDeCaja(cajaRedondeada(movido, size, 14)).toString(),
  )
})

test('un desplazamiento grande sí cambia la caja', () => {
  const lejos = { minLat: 42.1, maxLat: 42.3, minLong: 3.0, maxLong: 3.3 }
  assert.notEqual(
    paramsDeCaja(cajaRedondeada(vista, size, 14)).toString(),
    paramsDeCaja(cajaRedondeada(lejos, size, 14)).toString(),
  )
})

test('no se pide más de un paso de margen por lado', () => {
  // El precio del redondeo tiene que estar acotado: sin esto, un paso mal elegido podría
  // multiplicar las fuentes que se traen y ése es el camino que ya provocó un OOM.
  for (const zoom of [6, 10, 14, 17]) {
    const c = cajaRedondeada(vista, size, zoom)
    const paso = 128 * (360 / (256 * 2 ** zoom))
    assert.ok(vista.minLat - c.minLat < paso, `zoom ${zoom}: margen sur de más`)
    assert.ok(c.maxLat - vista.maxLat < paso, `zoom ${zoom}: margen norte de más`)
  }
})

test('la rejilla se afina al acercar: la celda mide lo mismo EN PANTALLA', () => {
  const cerca = cajaRedondeada(vista, size, 17)
  const lejos = cajaRedondeada(vista, size, 8)
  assert.ok(cerca.maxLat - cerca.minLat < lejos.maxLat - lejos.minLat)
})

test('el tamaño se cuantiza a la celda del servidor, que no cambia sus columnas', () => {
  // El servidor hace `ceil(width / 70)`. Redondeando hacia arriba a múltiplos de 70, la
  // cuenta le sale idéntica: la respuesta no cambia y la URL deja de moverse.
  for (const w of [1100, 1101, 1139, 390, 391]) {
    const c = cajaRedondeada(vista, { width: w, height: 800 }, 14)
    assert.equal(Math.ceil(c.width / 70), Math.ceil(w / 70), `ancho ${w}`)
    assert.equal(c.width % 70, 0)
  }
})

test('la URL tiene siempre la misma forma, sin decimales que bailen', () => {
  // `String(41.750000000000004)` y `String(41.75)` son la misma caja y dos URLs.
  const c = cajaRedondeada({ minLat: 41.75, maxLat: 41.8, minLong: 2, maxLong: 2.1 }, size, 14)
  const p = paramsDeCaja(c)
  for (const k of ['minLat', 'maxLat', 'minLong', 'maxLong']) {
    assert.match(p.get(k)!, /^-?\d+\.\d{6}$/, `${k} = ${p.get(k)}`)
  }
})

test('un zoom imposible devuelve la caja tal cual en vez de una inservible', () => {
  const c = cajaRedondeada(vista, size, Number.POSITIVE_INFINITY)
  assert.equal(c.minLat, vista.minLat)
  assert.ok(Number.isFinite(c.maxLong))
})
