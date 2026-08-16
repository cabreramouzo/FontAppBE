/**
 * Colores de los escalones, uno por tema. Bronce/plata/oro se reconocen sin leer la
 * palabra, pero el bronce que funciona sobre papel se queda en 4,2:1 sobre el fondo
 * oscuro — por debajo del 4,5 que pide la WCAG para texto normal. Dos juegos, no uno.
 *
 * Vive aquí y no dentro de un componente porque lo usan el marcador del perfil y la
 * vitrina, y dos paletas que se parecen son peores que una sola.
 */
export const TIER_COLOR: Record<'light' | 'dark', Record<string, string>> = {
  light: { bronze: '#8A5A38', silver: '#5E6B77', gold: '#8F6D10', unique: '#3F6E5D' },
  dark: { bronze: '#D6A175', silver: '#B3BFCA', gold: '#E3BE58', unique: '#84C4AC' },
}
