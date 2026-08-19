/**
 * Compartir un mensaje: la hoja del sistema si la hay, y si no el portapapeles.
 *
 * **La dirección va DENTRO del texto y nunca en el campo `url`.** Con los dos campos por
 * separado —que es lo natural, y lo que había en los tres sitios que comparten— medio
 * destino se queda solo con la dirección y tira la frase: llegaba un enlace pelado a un
 * chat, que es lo que nadie abre. Metido en el texto no hay nada que puedan descartar, y
 * WhatsApp y compañía enlazan igual la dirección que encuentran dentro (la tarjeta de
 * vista previa la siguen poniendo las etiquetas `og:`).
 *
 * Vive aquí y no en cada pantalla porque es una regla que **no se deduce leyendo el
 * código**: `{ text, url }` parece lo correcto y falla en silencio, solo en el móvil de
 * otra persona.
 *
 * @param nav se inyecta solo para poder probarlo; en la app es el `navigator` de siempre.
 */
/**
 * Lo justo que se usa del navegador. Escrito a mano y **no** con `Pick<Navigator, …>`: el
 * test corre bajo `tsconfig.node.json`, que no trae las librerías del DOM, así que allí
 * `Navigator` es otra cosa y `Pick` no compila. Un tipo estructural vale en los dos sitios
 * y además deja a la vista lo poco que hace falta para probarlo.
 */
export interface NavegadorQueComparte {
  share?: (datos: { title?: string; text?: string }) => Promise<void>
  clipboard: { writeText: (texto: string) => Promise<void> }
}

export async function comparteTexto(
  mensaje: string,
  nav: NavegadorQueComparte = navigator as unknown as NavegadorQueComparte,
): Promise<'compartido' | 'copiado' | 'nada'> {
  try {
    if (typeof nav.share === 'function') {
      await nav.share({ title: 'FontApp', text: mensaje })
      return 'compartido'
    }
    await nav.clipboard.writeText(mensaje)
    return 'copiado'
  } catch {
    // Hoja cancelada o portapapeles sin permiso: no es un error que contarle a nadie.
    return 'nada'
  }
}
