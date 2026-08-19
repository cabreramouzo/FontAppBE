import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import GetAppIcon from '@mui/icons-material/GetApp'
import IosShareIcon from '@mui/icons-material/IosShare'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import StorefrontIcon from '@mui/icons-material/Storefront'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import { useI18n } from '../i18n/I18nContext'
import { estaInstalada, instalacionDeUnToque, instalaAhora, plataforma, type Plataforma } from '../lib/install'

/**
 * Cómo instalar FontApp, en un sitio **permanente**.
 *
 * ## Por qué existe
 *
 * Lo único que había era el aviso flotante, y un aviso que se ve una vez no enseña
 * nada: la gente lo cierra sin leerlo —observado varias veces sobre amigos y familia—
 * y después no hay ningún sitio donde volver a mirarlo. Un cartel que pasa no es
 * documentación.
 *
 * Así que esto no sustituye al aviso, lo completa: el aviso interrumpe una vez, y esta
 * página está siempre, se llega desde el pie y desde el cajón (⋮) y se puede enlazar a
 * alguien por WhatsApp, que es como se instalan de verdad las cosas entre conocidos.
 *
 * ## Dos reglas
 *
 * - **Primero el dispositivo en el que estás.** Una lista de tres plataformas obliga a
 *   cada persona a averiguar cuál es la suya; se enseña la suya abierta y las otras
 *   plegadas, que sirven para cuando lo explicas por teléfono.
 * - **En el iPhone solo vale Safari.** No es un matiz: en Chrome o Firefox para iOS la
 *   opción no existe, y sin decirlo la persona busca un botón que no está y concluye que
 *   la app está rota.
 */
export function InstallPage() {
  const { t } = useI18n()
  const [ya] = useState(estaInstalada)
  const [suya] = useState(plataforma)
  const [otras, setOtras] = useState(false)
  const [unToque, setUnToque] = useState(() => !!instalacionDeUnToque())

  const RAZONES = [
    { icon: <CloudOffIcon color="primary" />, key: 'installPage.why1' },
    { icon: <OpenInFullIcon color="primary" />, key: 'installPage.why2' },
    { icon: <StorefrontIcon color="primary" />, key: 'installPage.why3' },
  ]

  // Los pasos SON una secuencia, así que van numerados; el número dice algo cierto.
  function pasos(p: Plataforma) {
    if (p === 'android') return [t('installPage.android1'), t('installPage.android2')]
    if (p === 'escritorio') return [t('installPage.desktop1')]
    return [
      t('installPage.ios1'),
      // El icono va dentro de la frase, como en el aviso, y con las mismas dos mitades:
      // así el texto de las dos pantallas no puede separarse.
      <>{t('install.iosPre')} <IosShareIcon sx={{ fontSize: 18, verticalAlign: 'text-bottom' }} /> {t('install.iosPost')}</>,
    ]
  }

  function Instrucciones({ p }: { p: Plataforma }) {
    return (
      <Box component="ol" sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {pasos(p).map((paso, i) => (
          <Typography component="li" variant="body2" key={i}>{paso}</Typography>
        ))}
      </Box>
    )
  }

  const NOMBRES: Record<Plataforma, string> = {
    ios: t('installPage.ios'),
    iosOtro: t('installPage.ios'),
    android: t('installPage.android'),
    escritorio: t('installPage.desktop'),
  }
  // `iosOtro` comparte instrucciones con `ios`: los pasos son los mismos, lo que cambia
  // es que antes hay que cambiarse de navegador.
  const RESTO = (['ios', 'android', 'escritorio'] as Plataforma[]).filter(
    (p) => p !== (suya === 'iosOtro' ? 'ios' : suya),
  )

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', px: 2, py: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>{t('installPage.title')}</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>{t('installPage.intro')}</Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
        {RAZONES.map((r) => (
          <Box key={r.key} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            {r.icon}
            <Typography variant="body2">{t(r.key)}</Typography>
          </Box>
        ))}
      </Box>

      {ya ? (
        // Ofrecerle instalar a quien ya la tiene es lo que hace que un aviso deje de
        // creerse. Aquí se dice y no se pinta ninguna instrucción.
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <TaskAltIcon color="success" />
          <Typography variant="body2">{t('installPage.already')}</Typography>
        </Paper>
      ) : (
        <>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
            <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{t('installPage.here')}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              {NOMBRES[suya]}
            </Typography>

            {suya === 'iosOtro' && (
              <Typography variant="body2" sx={{ mb: 1.5, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                {t('installPage.iosOther')}
              </Typography>
            )}

            {/* Si Chromium nos dejó el evento, el camino corto es un botón de verdad y
                las instrucciones sobran; si no, quedan ellas. Nunca las dos cosas. */}
            {unToque ? (
              <Button
                fullWidth variant="contained" disableElevation size="large" startIcon={<GetAppIcon />}
                onClick={async () => { await instalaAhora(); setUnToque(!!instalacionDeUnToque()) }}
                sx={{ textTransform: 'none' }}
              >
                {t('installPage.oneTap')}
              </Button>
            ) : (
              <Instrucciones p={suya} />
            )}
          </Paper>

          {/* Plegadas: sirven para cuando se lo explicas a alguien por teléfono, que es
              justamente el caso que trae a esta página. */}
          <Button
            onClick={() => setOtras((v) => !v)}
            endIcon={<ExpandMoreIcon sx={{ transform: otras ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
            sx={{ textTransform: 'none' }}
          >
            {t('installPage.other')}
          </Button>
          <Collapse in={otras}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              {RESTO.map((p) => (
                <Paper key={p} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Typography sx={{ fontWeight: 700, mb: 1 }}>{NOMBRES[p]}</Typography>
                  <Instrucciones p={p} />
                </Paper>
              ))}
            </Box>
          </Collapse>
        </>
      )}
    </Box>
  )
}
