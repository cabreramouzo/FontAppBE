#!/usr/bin/env node
// Comprueba que todos los diccionarios tienen exactamente las mismas claves.
//
// Nace de un susto: un `re.sub` codicioso se comió 2.700 líneas del fichero y la app
// seguía compilando y arrancando tan tranquila. `t()` devuelve la clave cruda cuando falta
// la traducción, así que un diccionario incompleto no rompe nada — solo enseña
// `game.can.retireFont` en mitad de un botón, y solo a quien tenga ese idioma. Es
// exactamente el tipo de fallo que no se ve en desarrollo y sí en producción.
//
// Script de Node y no un test de verdad porque `web/` no tiene runner, y meter uno entero
// (con su dependencia, su configuración y su paso de CI) para comprobar siete conjuntos de
// cadenas sería el remedio peor que la enfermedad. `npm run check:i18n`, y en CI.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const fuente = readFileSync(join(raiz, 'src/i18n/dictionaries.ts'), 'utf8')

// Se lee el fichero como texto en vez de importarlo: es TypeScript, y compilarlo pediría
// justo la maquinaria que este script evita.
const bloques = [...fuente.matchAll(/const (\w+): Dict = \{([\s\S]*?)\n\}/g)]
if (bloques.length === 0) {
  console.error('✗ No se ha encontrado ningún diccionario. ¿Ha cambiado el formato del fichero?')
  process.exit(1)
}

const claves = new Map()
for (const [, idioma, cuerpo] of bloques) {
  // Hay claves con comillas simples y dobles. Ignorar las segundas hizo que durante un
  // tiempo el informe dijera 1.028 aunque en ejecución hubiera 1.046.
  const encontradas = [...cuerpo.matchAll(/^ {2}(['"])([^'"]+)\1:/gm)].map((m) => m[2])
  const repetidas = encontradas.filter((k, i) => encontradas.indexOf(k) !== i)
  if (repetidas.length) {
    // Una clave dos veces en el mismo diccionario gana la última y la primera se pierde
    // en silencio; es como se cuela una traducción a medio cambiar.
    console.error(`✗ ${idioma}: claves repetidas → ${[...new Set(repetidas)].join(', ')}`)
    process.exitCode = 1
  }
  claves.set(idioma, new Set(encontradas))
}

const [base, refs] = [bloques[0][1], claves.get(bloques[0][1])]
let fallos = 0
for (const [idioma, set] of claves) {
  const faltan = [...refs].filter((k) => !set.has(k))
  const sobran = [...set].filter((k) => !refs.has(k))
  if (faltan.length || sobran.length) {
    fallos++
    console.error(`✗ ${idioma}: faltan ${faltan.length} · sobran ${sobran.length}`)
    if (faltan.length) console.error(`    faltan: ${faltan.slice(0, 10).join(', ')}${faltan.length > 10 ? '…' : ''}`)
    if (sobran.length) console.error(`    sobran: ${sobran.slice(0, 10).join(', ')}${sobran.length > 10 ? '…' : ''}`)
  }
}

if (fallos || process.exitCode) {
  console.error(`\nLos diccionarios tienen que llevar las mismas claves (referencia: ${base}).`)
  process.exit(1)
}
console.log(`✓ ${claves.size} diccionarios, ${refs.size} claves idénticas en todos.`)
