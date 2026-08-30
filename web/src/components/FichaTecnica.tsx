import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import type { Font } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { nombrePais } from '../lib/countries'

/**
 * Los datos administrativos de una fuente, plegados al final de la ficha.
 *
 * ## Por qué plegado y NO una pantalla aparte
 *
 * Se propuso un botón que llevara a otra pantalla, y el motivo era el bueno —que esto no
 * ensucie la ficha, que ya es densa—. Pero lo que hay aquí hoy son **cuatro líneas**:
 * municipio, demarcación, país y desde cuándo está en el mapa. Una pantalla para cuatro
 * campos cuesta una navegación de ida y otra de vuelta, un trozo de carga diferida que
 * **sin cobertura no está** (la ficha sí: `precargaRutas` la baja de antemano) y un sitio
 * más al que llegar por un enlace viejo. Plegado no cuesta ninguna de las tres y esconde
 * exactamente igual: es la misma decisión que «Tu nivel abre» en el marcador.
 *
 * **Cuándo cambiar de opinión:** el día que aquí vivan también el historial de ediciones,
 * el EXIF de las fotos, la licencia y el origen del dato, esto deja de ser un apéndice y
 * pasa a ser una pantalla de verdad — y entonces el botón de la ficha tiene sentido.
 *
 * ## Qué sale y qué no
 *
 * Solo lo que **no está ya arriba**. El tipo, la potabilidad, la foto, las coordenadas y
 * quién la puso ya tienen su sitio en la ficha, y repetirlos aquí sería alargar la página
 * con lo mismo. Y no se pinta ninguna línea vacía: fuera de España `municipality` es nulo
 * —los límites son del IGN—, así que ahí la ficha técnica enseña una línea menos en vez
 * de un «—» que no dice nada.
 */
/**
 * ## Y si algo de esto está mal
 *
 * El municipio **no se puede editar a mano y no debe poder**: no es un campo que alguien
 * rellena, es el resultado de meter unas coordenadas dentro de un polígono del IGN. Una
 * caja de texto ahí crearía una segunda verdad —fuentes que dicen «Moià» pintadas dentro
 * de Castellcir— que contradiría a `/zones`, al ranking y a la página del municipio.
 *
 * Cuando está mal es casi siempre porque **el pin está mal**, y eso ya se corrige
 * moviéndolo (creador, admin o nivel 5), que ahora además recalcula el municipio solo.
 * Para quien no puede moverlo, la salida es **decirlo**: este enlace abre la caja de
 * comentarios con el texto empezado.
 *
 * Es un **comentario y no una incidencia**: no hay nada roto en la fuente, hay un dato que
 * no cuadra, y quien puede arreglarlo lo lee igual. Justo el caso para el que la caja dejó
 * de llamarse «incidencia».
 *
 * Y sí, lleva a otro sitio de la página, que es lo que se descartó con el hueco de la foto
 * — allí estaba mal porque la intención era «tengo una foto» y se le respondía con un
 * formulario de reseña. Aquí la intención **es** escribir, así que llevar a la caja de
 * escribir es exactamente lo pedido.
 */
export function FichaTecnica({ font, onReportarDato }: { font: Font; onReportarDato?: (texto: string) => void }) {
  const { t } = useI18n()
  const [abierto, setAbierto] = useState(false)

  const filas: { rotulo: string; valor: string }[] = []
  if (font.municipality) filas.push({ rotulo: t('detail.municipality'), valor: font.municipality })
  // ## La demarcación NO se pinta si hay municipio, y esto se descubrió probándolo
  //
  // La primera versión enseñaba las dos y salió «Municipio: Arnes / Demarcación: Teruel».
  // Arnes es de **Tarragona** (INE 43018): es el error de siempre de los polígonos de
  // Natural Earth —falla 1,9 km de mediana— pero hasta ahora vivía en una columna que
  // nadie leía, y aquí lo estaríamos **publicando en la ficha, al lado del dato bueno**.
  // Medido: **502 de 52.463** fuentes tienen demarcación que contradice la provincia de
  // su propio código INE.
  //
  // Donde hay municipio, el municipio manda: sale de los recintos del IGN y es exacto.
  // Fuera de España no hay municipio —esos límites solo cubren España— y entonces la
  // demarcación es lo único que hay, así que ahí sí se pinta.
  //
  // Lo que **no** se hace es deducir aquí la provincia de los dos primeros dígitos del
  // INE, que se puede: sería una segunda verdad distinta de la que enseñan `/zones` y el
  // ranking, que siguen leyendo la columna. Arreglar `region` es un trabajo aparte y para
  // toda la base, no un apaño de un componente.
  if (font.region && !font.municipality) filas.push({ rotulo: t('detail.region'), valor: font.region })
  // El país viaja como clave («Spain», el nombre inglés de Natural Earth), no como
  // rótulo: se traduce por la misma lista explícita que los chips de `/zones`.
  if (font.country) filas.push({ rotulo: t('detail.country'), valor: nombrePais(font.country, t) })
  if (font.createdAt) {
    filas.push({
      rotulo: t('detail.addedOn'),
      // El formato lo pone el navegador con el idioma que se está leyendo: el servidor
      // manda ISO y no sabe ni el idioma ni el huso de quien mira.
      valor: new Date(font.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    })
  }
  if (filas.length === 0) return null

  return (
    <Box sx={{ mt: 2 }}>
      <Button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        size="small"
        endIcon={<ExpandMoreIcon sx={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }} />}
        sx={{ textTransform: 'none', ml: -1, color: 'text.secondary' }}
      >
        {t('detail.moreInfo')}
      </Button>
      <Collapse in={abierto} unmountOnExit>
        {/* Una lista de definición de verdad (`dl`/`dt`/`dd`) y no dos columnas de texto:
            es exactamente lo que es, y así un lector de pantalla lee «Municipio: Moià» en
            vez de dos cadenas sueltas. */}
        <Box
          component="dl"
          sx={{
            m: 0, mt: 0.5, display: 'grid', gridTemplateColumns: 'auto 1fr',
            columnGap: 2, rowGap: 0.75, alignItems: 'baseline',
          }}
        >
          {filas.map((f) => (
            <Box key={f.rotulo} sx={{ display: 'contents' }}>
              <Typography component="dt" variant="body2" color="text.secondary">{f.rotulo}</Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0 }}>{f.valor}</Typography>
            </Box>
          ))}
        </Box>
        {onReportarDato && (
          <Button
            size="small"
            onClick={() => onReportarDato(t('detail.dataWrongDraft'))}
            sx={{ textTransform: 'none', ml: -1, mt: 0.5 }}
          >
            {t('detail.dataWrong')}
          </Button>
        )}
      </Collapse>
    </Box>
  )
}
