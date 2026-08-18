// De dónde viene el usuario: el código del cartel que escaneó (`fontapp.net/?p=castellcir`).
//
// La geolocalización por IP no sirve para esto: en un pueblo pequeño resuelve a la
// central del operador en la cabecera de demarcación (alguien de Castellcir sale como
// La Garriga). Con el código del cartel sabemos con certeza qué cartel trajo a quién.
const KEY = 'fontapp_source'

/** Lee `?p=` de la URL y lo guarda. Llamar al arrancar la app, antes de nada. */
export function captureSource() {
  try {
    const p = new URLSearchParams(window.location.search).get('p')
    if (!p) return
    // Gana la PRIMERA visita: si alguien llega por el cartel de Castellcir, vuelve
    // semanas después por otro sitio y entonces se registra, el mérito es del cartel.
    if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, p.slice(0, 40))
    // Quitamos el parámetro de la barra de direcciones: si comparte el enlace, que no
    // arrastre el código de otro pueblo (y queda más limpio).
    const url = new URL(window.location.href)
    url.searchParams.delete('p')
    window.history.replaceState({}, '', url.toString())
  } catch {
    /* sin localStorage (modo privado antiguo): la app funciona igual, sin atribución */
  }
}

/** Código guardado, para mandarlo al crear la cuenta. */
export function storedSource(): string | undefined {
  try {
    return localStorage.getItem(KEY) || undefined
  } catch {
    return undefined
  }
}
