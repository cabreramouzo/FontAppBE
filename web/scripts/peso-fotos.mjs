/**
 * ¿Ya toca generar miniaturas?
 *
 * Mide lo que pesan las fotos de la rejilla de novedades en producción. Existe para que
 * la decisión tenga **un disparador medible y no una intuición**: cuando se propuso, el
 * cálculo a ojo («385 KB para pintar 180 px») exageraba el problema, y midiéndolo bien
 * resultó que el desperdicio real era ~3× y no ~13×, que todo va con `loading="lazy"` y
 * que por tanto no compensaba todavía. Eso puede cambiar, y este script dice cuándo.
 *
 *   node scripts/peso-fotos.mjs
 *
 * Ojo con medirlo desde el navegador: R2 no manda `Timing-Allow-Origin`, así que
 * `transferSize` sale 0 y parece que no pesan nada. Hay que ir por `Content-Length`.
 */

const API = process.env.API_ORIGIN || 'https://fontapp.fly.dev'

/** Cuándo deja de compensar seguir sirviendo la foto grande en la rejilla. */
const UMBRAL = {
  /** Fotos distintas en el feed por defecto. Hoy la mayoría de tarjetas no tienen. */
  fotos: 25,
  /** Lo que cuesta recorrer el feed entero, en MB. */
  mb: 8,
}

const kb = (n) => Math.round(n / 1024)

const res = await fetch(`${API}/activity?limit=40`)
const cuerpo = await res.json()
const items = Array.isArray(cuerpo) ? cuerpo : (cuerpo.items ?? [])
const urls = [...new Set(items.map((i) => i.image).filter(Boolean))]

let total = 0
const pesos = []
for (const u of urls) {
  const r = await fetch(u, { method: 'HEAD' })
  const n = Number(r.headers.get('content-length') || 0)
  total += n
  pesos.push(n)
}
pesos.sort((a, b) => a - b)

const mb = total / 1024 / 1024
console.log(`\nRejilla de novedades (${items.length} tarjetas)`)
console.log(`  fotos distintas : ${urls.length}`)
console.log(`  peso total      : ${mb.toFixed(1)} MB   (recorrer el feed entero)`)
if (pesos.length) {
  console.log(`  media / mediana : ${kb(total / pesos.length)} KB / ${kb(pesos[pesos.length >> 1])} KB`)
  console.log(`  la más pesada   : ${kb(pesos[pesos.length - 1])} KB`)
}

const toca = urls.length > UMBRAL.fotos || mb > UMBRAL.mb
console.log(`\nUmbral: más de ${UMBRAL.fotos} fotos distintas o más de ${UMBRAL.mb} MB.`)
console.log(toca
  ? '→ TOCA. Generar la miniatura en `prepararFoto` (~320 px) y guardarla como\n'
    + '  `<uuid>_t.jpg`; la rejilla y la galería la piden con respaldo `onError` a la\n'
    + '  grande, así las fotos viejas siguen funcionando sin migración ni columna nueva.'
  : '→ Todavía no. Y no es pereza: va todo diferido, así que nadie paga esto salvo que\n'
    + '  recorra el feed entero, y el desperdicio por foto es ~3×, no un orden de magnitud.')
