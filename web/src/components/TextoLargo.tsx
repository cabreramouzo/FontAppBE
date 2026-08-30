import { useState } from 'react'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { TextoRico } from './RichText'
import { useI18n } from '../i18n/I18nContext'

/** A partir de cuántos caracteres se recorta. */
export const TOPE = 300

/**
 * Cuánto tiene que sobrar para que valga la pena recortar.
 *
 * Sin este margen, un texto de 310 caracteres se cortaría para esconder diez: el lector
 * se come un botón, un toque y un salto de la página para ganar media línea. Solo se
 * recorta cuando de verdad hay algo detrás.
 */
const MARGEN = 60

/**
 * Corta por el último espacio antes del tope.
 *
 * **Por palabras y no por caracteres exactos**, y no es cosmético: `TextoRico` convierte
 * en enlaces las direcciones que encuentra, así que un corte a mitad de una URL dejaría
 * un enlace que apunta a otro sitio — roto y encima pulsable. Cortando por espacios no se
 * parte ningún trozo, porque una URL nunca lleva uno dentro.
 */
export function recorta(texto: string, tope = TOPE): string {
  if (texto.length <= tope) return texto
  const corte = texto.lastIndexOf(' ', tope)
  return texto.slice(0, corte > tope / 2 ? corte : tope)
}

/**
 * Un texto largo con «ver más».
 *
 * Nació con la descripción de una fuente: la mayoría son una línea, pero las buenas de
 * verdad —de dónde nace el agua, cómo se llega, qué hay al lado— pasan de los 600
 * caracteres, y esas empujaban hacia abajo todo lo que la ficha tiene que contestar
 * primero: el estado del agua y las reseñas.
 *
 * ## Y una vez desplegado, no se vuelve a plegar
 *
 * Es lo que hace iOS —la descripción de una app en la App Store, por ejemplo— y la razón
 * es de lectura, no de estilo: quien pulsa «ver más» está diciendo que quiere leer, y un
 * «ver menos» que encoge el bloque **mueve la página bajo el dedo** justo cuando acabas
 * de terminar el párrafo, dejándote en un sitio que no reconoces. Es el mismo motivo por
 * el que aquí no se anima la altura de nada que el lector esté leyendo.
 *
 * Conviene decirlo con precisión: la guía de Apple **no exige** que sea de un solo
 * sentido. Lo que dice es que el contenido no debe saltar ni reorganizarse bajo el
 * lector; que la expansión no tenga vuelta es la forma en que sus propias apps cumplen
 * eso, y es la que se copia aquí.
 */
export function TextoLargo({ texto, menciones = true }: { texto: string; menciones?: boolean }) {
  const { t } = useI18n()
  const [entero, setEntero] = useState(false)
  const largo = texto.length > TOPE + MARGEN

  return (
    <>
      <Typography color="text.secondary" component="div" sx={{ whiteSpace: 'pre-wrap' }}>
        <TextoRico texto={entero || !largo ? texto : `${recorta(texto)}…`} menciones={menciones} />
      </Typography>
      {largo && !entero && (
        <Button size="small" onClick={() => setEntero(true)} sx={{ textTransform: 'none', ml: -1 }}>
          {t('detail.readMore')}
        </Button>
      )}
    </>
  )
}
