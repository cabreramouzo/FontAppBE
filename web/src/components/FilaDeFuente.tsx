import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import type { WaterSource } from '../api/types'
import { SOURCE_EMOJI } from '../lib/waterType'
import { useI18n } from '../i18n/I18nContext'

/**
 * Una fila de fuente dentro de una lista de `/me`.
 *
 * ## Por qué existe
 *
 * Las tres listas del perfil —favoritas, las que has añadido y las que dependen de ti—
 * eran **un nombre por fila y nada más**: un muro de texto en el que no se distingue una
 * fila de la siguiente y en el que no hay nada que ayude a elegir. Se reportó como que
 * quedaban «muy pobres», y es exactamente eso.
 *
 * Se escribe **una vez** y no tres, por lo mismo que se extrajo `ListaConTope`: eran tres
 * copias del mismo `<ListItem><ListItemButton><ListItemText>` a punto de separarse al
 * primer arreglo, y el que se olvide solo se nota en una de las tres.
 *
 * ## El icono dice qué clase de punto es, y eso es un dato
 *
 * `SOURCE_EMOJI` es el vocabulario que la app ya usa en el globo del mapa y en la lista
 * del GPX —la gota, el grifo, la montaña—, así que no se inventa nada nuevo. Y **está
 * casi siempre**: medido sobre la importación real, solo 211 de 80.345 fuentes no llevan
 * tipo (0,26 %). Sin tipo se pinta una gota neutra, que no afirma nada: sea cual sea la
 * clase, agua es.
 *
 * ## Lo que NO se hace: la foto como miniatura
 *
 * Es lo primero que apetece y sería peor por dos razones medidas. **Casi ninguna la
 * tiene** —64.150 de 64.295 fuentes están sin foto—, así que la mayoría de las filas
 * enseñarían un hueco; y solo hay **un tamaño** por foto (~386 KB de media), de modo que
 * seis favoritas costarían unos 2 MB para pintar 40 px. Ver «Peso de las fotos»: el día
 * que existan miniaturas, esto se puede reconsiderar.
 */
export function FilaDeFuente({ to, source, primary, secondary, right }: {
  to: string
  source: WaterSource | null | undefined
  primary: ReactNode
  secondary?: ReactNode
  /** Lo que va al final de la fila: un chip de aviso, por ejemplo. */
  right?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <ListItem disablePadding>
      <ListItemButton component={RouterLink} to={to} sx={{ gap: 1.25, alignItems: 'center' }}>
        <Box
          aria-hidden={!source}
          // El emoji lleva su nombre para quien use lector de pantalla; sin tipo no
          // anuncia nada, porque no habría nada verdadero que anunciar.
          role={source ? 'img' : undefined}
          aria-label={source ? t(`source.${source}`) : undefined}
          title={source ? t(`source.${source}`) : undefined}
          sx={{
            fontSize: 22, lineHeight: 1, width: 28, textAlign: 'center', flexShrink: 0,
            opacity: source ? 1 : 0.45,
          }}
        >
          {source ? SOURCE_EMOJI[source] : '💧'}
        </Box>
        <ListItemText primary={primary} secondary={secondary} sx={{ my: 0.25 }} />
        {right}
      </ListItemButton>
    </ListItem>
  )
}
