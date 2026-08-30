import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import ShieldMoonIcon from '@mui/icons-material/ShieldOutlined'
import { guardedFonts, type Guarded } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from './Skeleton'
import { ListaConTope } from './ListaConTope'
import { WorthChip } from './WorthChip'
import { rotulo } from '../lib/fontName'
import { waterStatusInfo } from '../lib/waterStatus'
import { FilaDeFuente } from './FilaDeFuente'


/**
 * «Las fuentes que cuidas»: aquellas cuya última reseña es tuya.
 *
 * ## Qué problema resuelve
 *
 * La app no tenía ningún motivo **recurrente** para volver. Los puntos premian aportar,
 * pero aportar exige encontrar algo nuevo, y lo nuevo se acaba cerca de casa. Esto da una
 * razón que no se agota: lo que ya contaste caduca solo.
 *
 * Es a propósito el sustituto de una racha. Una racha castiga a quien le llueve dos fines
 * de semana y empuja a reseñas de paso para no romperla. Esto no castiga nada — las
 * olvidadas salen primero y sin números rojos — y además es **verdad**: si nadie vuelve,
 * la información que diste deja de servir y la fuente vuelve a ser un punto mudo.
 *
 * No es una propiedad, es un relevo: en cuanto otra persona reseña después, la fuente pasa
 * a ser suya. Por eso no hay ningún gesto para «adoptar» ni para «soltar».
 */
export function GuardedFonts() {
  const { t } = useI18n()
  const [fuentes, setFuentes] = useState<Guarded[] | null>(null)

  useEffect(() => { guardedFonts().then(setFuentes).catch(() => setFuentes([])) }, [])

  if (fuentes === null) return <Skeleton lines={3} />
  // Sin ninguna no se pinta: a quien todavía no ha reseñado nada, una sección vacía
  // titulada «las fuentes que cuidas» solo le dice que no cuida ninguna.
  if (fuentes.length === 0) return null

  const viejas = fuentes.filter((f) => f.stale)

  return (
    <Box component="section" sx={{ mb: 3 }}>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <ShieldMoonIcon fontSize="small" /> {t('guard.title')}
      </Typography>
      {/* El resumen antes de la lista: lo que hay que saber es cuántas se han quedado
          viejas, no cuántas hay en total. */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {viejas.length > 0
          ? t('guard.summaryStale', { n: String(fuentes.length), s: String(viejas.length) })
          : t('guard.summaryAllFresh', { n: String(fuentes.length) })}
      </Typography>

      <ListaConTope
        items={fuentes}
        clave={(f) => f.fontID}
        fila={(f) => {
          // Lo que TÚ dijiste la última vez, con su emoji. Es el dato que caduca —de eso
          // va la lista entera— y hasta ahora no salía: la fila decía cuándo pasaste,
          // pero no qué contaste, que es justo lo que hay que volver a comprobar.
          const estado = waterStatusInfo(f.waterStatus)
          return (
            <FilaDeFuente
              to={`/fonts/${f.fontID}`}
              source={f.source}
              primary={
                <Box component="span" sx={{ fontWeight: f.stale ? 700 : 400 }}>{rotulo(f.name, t)}</Box>
              }
              // ## Un solo aviso por fila, no dos
              // Estaba el chip «toca volver» a la derecha **y** el de «vale 70 gotas»
              // debajo, y los dos dicen lo mismo: que hace mucho que nadie pasa (90 días
              // el primero, 30 el segundo). Con los dos, la fila subía a 129 px y el chip
              // de la derecha le robaba el ancho al nombre, que se partía en dos líneas.
              //
              // Se queda el de las gotas, que es el que **varía** —70, 60, 45— y por
              // tanto ordena; el otro era binario y su información ya la lleva el nombre
              // en negrita. Es la misma regla que ya obedece `WorthChip`: una etiqueta en
              // todas las filas no señala ninguna.
              secondary={
                <>
                  {estado && <span title={t(`status.${estado.key}`)}>{estado.emoji} </span>}
                  {t('guard.checkedAgo', { d: String(f.days) })}{' '}
                  <WorthChip lastCheck={f.lastCheck} />
                </>
              }

            />
          )
        }}
      />
    </Box>
  )
}
