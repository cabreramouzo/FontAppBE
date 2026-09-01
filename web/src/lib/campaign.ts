// De dónde viene el usuario: el código del cartel que escaneó (`fontapp.net/?p=castellcir`).
//
// La geolocalización por IP no sirve para esto: en un pueblo pequeño resuelve a la
// central del operador en la cabecera de demarcación (alguien de Castellcir sale como
// La Garriga). Con el código del cartel sabemos con certeza qué cartel trajo a quién.
const KEY = 'fontapp_source'
/** Una pestaña solo cuenta una vez, aunque el enlace se recargue. */
const CONTADA = 'fontapp_source_counted'

/**
 * Lee `?p=` de la URL y lo guarda. Llamar al arrancar la app, antes de nada.
 *
 * Devuelve el código **solo cuando hay que contar la visita**, y es el que llama quien la
 * cuenta. Podría hacerlo aquí, pero eso obligaría a importar `api/client`, que a su vez
 * importa `storedSource` de este fichero: un ciclo entre módulos que compila, arranca y
 * falla el día que el orden de evaluación cambie.
 */
export function captureSource(): string | undefined {
  try {
    const p = new URLSearchParams(window.location.search).get('p')
    if (!p) return undefined

    // Gana la PRIMERA visita: si alguien llega por el cartel de Castellcir, vuelve
    // semanas después por otro sitio y entonces se registra, el mérito es del cartel.
    if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, p.slice(0, 40))
    // Quitamos el parámetro de la barra de direcciones: si comparte el enlace, que no
    // arrastre el código de otro pueblo (y queda más limpio).
    const url = new URL(window.location.href)
    url.searchParams.delete('p')
    window.history.replaceState({}, '', url.toString())
    // Contar el clic aunque nunca se registre, que es el caso normal: un post con 12.000
    // impresiones dejaba 10 altas y ninguna forma de saber cuántos llegaron a abrir la
    // web — `storedSource` solo llega al servidor al crear la cuenta.
    //
    // Se cuenta **la llegada**: solo cuando la URL trae el parámetro, o sea el clic en el
    // enlace, y no cada visita posterior de quien ya vino una vez.
    return porContar(p.slice(0, 40))
  } catch {
    /* sin localStorage (modo privado antiguo): la app funciona igual, sin atribución */
  }
  return undefined
}

/** El código, la primera vez que esta pestaña lo ve; después, nada. */
function porContar(source: string): string | undefined {
  try {
    if (sessionStorage.getItem(CONTADA)) return undefined
    sessionStorage.setItem(CONTADA, '1')
  } catch { /* sin storage, un recuento de más es preferible a identificar la pestaña */ }
  return source
}

/** Código guardado, para mandarlo al crear la cuenta. */
export function storedSource(): string | undefined {
  try {
    return localStorage.getItem(KEY) || undefined
  } catch {
    return undefined
  }
}
