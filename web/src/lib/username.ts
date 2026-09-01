/**
 * Qué nombre de usuario vale.
 *
 * **Es la misma regla que `Mentions.isMentionable` en el servidor**, y por eso vive en un
 * módulo y no dentro de una pantalla: la usan el registro y el formulario de `/me`, y una
 * segunda copia se queda vieja sola. Que las dos digan lo mismo no es cosmético — un
 * nombre que el servidor acepta pero el parser de menciones no reconoce **manda el aviso
 * a otra persona**: `@josé maría` menciona a `jos`.
 *
 * Existe además por un motivo de idioma. El servidor devuelve sus errores en castellano,
 * como todos los `reason` de esta API; validando aquí, la persona ve la regla **en su
 * idioma y antes de enviar**, que es cuando sirve de algo. El error del servidor queda de
 * red de seguridad para quien llame a la API directamente.
 */
const VALIDO = /^[a-zA-Z0-9_.-]{3,30}$/

export function esNombreValido(nombre: string): boolean {
  return VALIDO.test(nombre)
}

/**
 * ¿Están escribiendo un correo aquí?
 *
 * Se pregunta **mientras se escribe**, y basta con que haya una `@`: no hace falta que
 * sea un correo completo, porque a mitad de teclearlo (`yo@gmail`) la intención ya está
 * clara y es cuando el aviso sirve.
 *
 * Existe porque la regla estaba escrita **en positivo** —«letras sin acentos, números,
 * punto, guion y guion bajo»— y de ahí hay que deducir que la `@` no vale. Nadie deduce
 * nada mientras rellena un formulario: lee que su correo no cumple «algo» y lo intenta
 * otra vez. Y lo que hay que decir no es qué caracteres faltan, es **por qué**: el nombre
 * es público y firma cada reseña.
 */
export function escribiendoCorreo(nombre: string): boolean {
  return nombre.includes('@')
}

/**
 * ¿El nombre de usuario es una dirección de correo?
 *
 * Se pregunta para **avisar a quien lo tiene**, no para prohibirlo: prohibirlo ya lo hace
 * `esNombreValido` (una `@` no está en el juego de caracteres), pero eso solo vale para
 * las cuentas nuevas. Las que ya existían siguen enseñando su correo **firmando cada
 * reseña, en público**, y lo más probable es que ni lo sepan.
 *
 * Es peor de lo que parece porque **burla una preferencia**: `emailPublic` nace apagada y
 * el perfil oculta el correo como debe… mientras el mismo correo está ahí al lado como
 * nombre de usuario. Medido en producción: 2 de 15 autores recientes.
 */
export function pareceCorreo(nombre: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(nombre.trim())
}
