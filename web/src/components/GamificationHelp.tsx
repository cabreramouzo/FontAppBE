import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import IconButton from '@mui/material/IconButton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined'
import { getGamificationScale } from '../api/client'
import type { GamificationScale } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from './Skeleton'

/**
 * Botón (?) que explica de dónde salen las gotas.
 *
 * El texto está calcado del que ya imprime `score-contributions` en la consola, que era
 * la explicación más clara que había del sistema y solo la veía quien ejecuta comandos.
 *
 * **Todas las cifras vienen de `/gamification/scale`, ninguna está escrita aquí.** Es la
 * decisión que sostiene la pantalla: copiadas al cliente, el día que se recalibre una
 * base o un multiplicador —y se han recalibrado ya varias veces— la ayuda seguiría
 * enseñando los números viejos. Una explicación que no cuadra con lo que ves en tu
 * marcador es peor que no dar ninguna, porque enseña que el sistema no se entiende.
 * Hay un test en el backend que comprueba que lo publicado y lo que puntúa coinciden.
 *
 * Se carga **al abrir** y no al montar: es un botón de ayuda que la mayoría no va a
 * pulsar nunca, y no tiene por qué costar una petición en cada visita al perfil.
 */
export function GamificationHelpButton() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [escala, setEscala] = useState<GamificationScale | null>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    if (!open || escala) return
    getGamificationScale().then(setEscala).catch(() => setFallo(true))
  }, [open, escala])

  return (
    <>
      <IconButton
        size="small"
        onClick={() => setOpen(true)}
        aria-label={t('gameHelp.title')}
        title={t('gameHelp.title')}
      >
        <HelpOutlineIcon fontSize="small" />
      </IconButton>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth scroll="paper">
        <DialogTitle>{t('gameHelp.title')}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>{t('gameHelp.intro')}</Typography>

          {!escala && !fallo && <Skeleton lines={6} />}
          {fallo && <Typography variant="body2" color="text.secondary">{t('badges.failed')}</Typography>}

          {escala && <ExplicacionBaremo escala={escala} />}

        </DialogContent>
        <DialogActions>
          {/* El diálogo explica el baremo; los niveles y las insignias están en la
              página. Sin esta salida, el (?) parecía toda la explicación que hay. */}
          <Button component={RouterLink} to="/gamification" sx={{ mr: 'auto' }}>
            {t('gameHelp.readMore')}
          </Button>
          <Button onClick={() => setOpen(false)}>{t('gameHelp.close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

/**
 * El baremo explicado: qué paga, multiplicadores, la curva de frescura, un ejemplo y las
 * reglas. Lo comparten el diálogo (?) del perfil y la página pública `/gamification`.
 *
 * Está extraído en un componente y no copiado en las dos porque el texto se ha
 * reescrito ya varias veces; dos copias garantizan que una se quede vieja, y la que se
 * quedaría vieja sería la pública, que es la que lee quien todavía no entiende nada.
 */
export function ExplicacionBaremo({ escala }: { escala: GamificationScale }) {
  const { t, lang } = useI18n()
  const n = (v: number) => v.toLocaleString(lang)
  // Los multiplicadores se escriben con la coma o el punto del idioma: «×1,25» en
  // castellano y «×1.25» en inglés. Con `toString()` salía siempre el punto.
  const x = (v: number) => v.toLocaleString(lang, { maximumFractionDigits: 2 })
  return (
    <>
            <Apartado titulo={t('gameHelp.whatPays')}>
              <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 0.5, columnGap: 2 }}>
                {[...escala.kinds]
                  // De más a menos: lo primero que se lee es lo que más conviene hacer.
                  .sort((a, b) => b.base - a.base)
                  .map((k) => (
                    <Fila
                      key={k.kind}
                      nombre={t(`game.kind.${k.kind}`)}
                      // `updateReview` vale 0 de base porque lo pone la curva de
                      // frescura entera. Enseñar «0 gotas» diría que no paga, que es
                      // justo lo contrario: es de lo mejor pagado si hace tiempo que
                      // nadie pasa. Se remite a la curva, explicada más abajo.
                      valor={k.base === 0 ? t('gameHelp.byCurve') : `${n(k.base)}`}
                    />
                  ))}
              </Box>
              <Nota>{t('gameHelp.basesNote')}</Nota>
            </Apartado>

            <Apartado titulo={t('gameHelp.multipliers')}>
              <Punto>{t('gameHelp.mult.desert', { f: x(factor(escala, 'desert')), km: n(escala.desertKm) })}</Punto>
              <Punto>{t('gameHelp.mult.dry', { f: x(factor(escala, 'dry')) })}</Punto>
              <Punto>{t('gameHelp.mult.doubt', { f: x(factor(escala, 'doubt')) })}</Punto>
              <Punto>{t('gameHelp.mult.crowded', { f: x(factor(escala, 'crowded')), n: n(escala.crowdedFrom) })}</Punto>
              <Nota>{t('gameHelp.maxNote', { m: x(escala.maxMultiplier) })}</Nota>
            </Apartado>

            <Apartado titulo={t('gameHelp.freshness')}>
              <Typography variant="body2" sx={{ mb: 1 }}>{t('gameHelp.freshnessNote')}</Typography>
              <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 0.5, columnGap: 2 }}>
                {escala.freshness.map((f) => (
                  <Fila
                    key={String(f.fromDays)}
                    nombre={
                      // `== null` y no `=== null`: cubre también el `undefined` que
                      // llegaría si el servidor volviera a omitir la clave en vez de
                      // mandar el nulo. Ya pasó una vez y el precio fue la pantalla
                      // entera en negro, no un hueco.
                      f.fromDays == null ? t('gameHelp.freshNever')
                        : f.fromDays === 0 ? t('gameHelp.freshFirstWeek')
                          : t('gameHelp.freshFrom', { n: n(f.fromDays) })
                    }
                    valor={n(f.gotes)}
                  />
                ))}
              </Box>
            </Apartado>

            <Apartado titulo={t('gameHelp.example')}>
              {/* El ejemplo se calcula con las cifras de verdad en vez de escribirlo:
                  un ejemplo con números inventados es la primera cosa que deja de
                  cuadrar cuando se recalibra el baremo, y encima es la que más se
                  recuerda. */}
              <Typography variant="body2">
                {t('gameHelp.exampleText', {
                  base: n(base(escala, 'firstReview')),
                  m1: x(factor(escala, 'desert')),
                  m2: x(factor(escala, 'dry')),
                  total: n(Math.round(base(escala, 'firstReview') * factor(escala, 'desert') * factor(escala, 'dry'))),
                })}
              </Typography>
            </Apartado>

            <Apartado titulo={t('gameHelp.rules')}>
              <Punto>{t('gameHelp.settle', { h: n(escala.settleHours) })}</Punto>
              <Punto>{t('gameHelp.cap', { n: n(escala.dailyCap) })}</Punto>
              <Punto>{t('gameHelp.frozen')}</Punto>
            </Apartado>
    </>
  )
}

function factor(e: GamificationScale, key: string): number {
  return e.multipliers.find((m) => m.key === key)?.factor ?? 1
}

function base(e: GamificationScale, kind: string): number {
  return e.kinds.find((k) => k.kind === kind)?.base ?? 0
}

export function Apartado({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Box component="section" sx={{ mt: 2.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>{titulo}</Typography>
      {children}
    </Box>
  )
}

/** Una línea de tabla: concepto a la izquierda, cifra a la derecha. */
function Fila({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <>
      <Typography component="dt" variant="body2">{nombre}</Typography>
      <Typography
        component="dd"
        variant="body2"
        sx={{
          m: 0, fontWeight: 700, textAlign: 'right',
          // Las cifras en columna solo se leen como columna si todos los dígitos ocupan
          // lo mismo.
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valor}
      </Typography>
    </>
  )
}

/** La coletilla de un apartado: matiza lo de arriba, no compite con ello. */
function Nota({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, lineHeight: 1.4 }}>
      {children}
    </Typography>
  )
}

export function Punto({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="body2" sx={{ display: 'flex', gap: 1, mb: 0.75 }}>
      <Box component="span" sx={{ color: 'primary.main' }}>·</Box>
      <span>{children}</span>
    </Typography>
  )
}
