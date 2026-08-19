import { useEffect, useState } from 'react'
import Snackbar from '@mui/material/Snackbar'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone'
import { sesiones, useTurno } from '../lib/asks'
import { useI18n } from '../i18n/I18nContext'
import { submitAppInterest } from '../api/client'
import type { AppPlatform } from '../api/types'

// Banner de medición: ¿te gustaría una app móvil nativa? Sí/No.
// Solo pretende medir demanda antes de invertir en apps de tienda. Se muestra
// una vez por navegador (persistimos la respuesta en localStorage) y, si hay
// sesión, el backend liga el voto al usuario.
const STORAGE_KEY = 'fontapp_app_interest'

function detectPlatform(): AppPlatform {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

export function AppInterestBanner() {
  const { t } = useI18n()
  const [listo, setListo] = useState(false)
  const open = useTurno('interest', listo)
  const [thanks, setThanks] = useState(false)

  useEffect(() => {
    // Ya respondió (o lo cerró) antes: no volvemos a molestar.
    if (localStorage.getItem(STORAGE_KEY)) return
    // Preguntarle a un desconocido si querría una app nativa es pedirle una opinión
    // que todavía no puede tener, y gastarle el único momento en que te atendía. A la
    // tercera visita ya sabe qué es esto. Con diez usuarios, además, la respuesta de
    // alguien que acaba de llegar tampoco mide nada.
    if (sesiones() < 3) return
    // Pequeño retardo para no aparecer nada más entrar.
    const id = setTimeout(() => setListo(true), 6000)
    return () => clearTimeout(id)
  }, [])

  function remember(value: string) {
    try { localStorage.setItem(STORAGE_KEY, value) } catch { /* modo privado: da igual */ }
  }

  async function vote(wants: boolean) {
    remember(wants ? 'yes' : 'no')
    setThanks(true)
    try {
      await submitAppInterest(wants, detectPlatform())
    } catch {
      // Medición best-effort: si falla el envío, no molestamos al usuario.
    }
    // Cierre suave tras el agradecimiento.
    setTimeout(() => setListo(false), 2200)
  }

  function dismiss() {
    remember('dismissed')
    setListo(false)
  }

  return (
    <Snackbar
      open={open}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      // Se levanta por encima de la tab bar. Sin esto la tapaba entera en móvil: es de
      // MUI anclar los Snackbar a `bottom: 0` en pantallas estrechas, y la tab bar llegó
      // después. `--bajo-el-mapa` es justo «lo que hay ocupado ahí abajo» y ya lo usan
      // los toasts, así que el día que la barra cambie de alto esto la sigue sola.
      sx={{
        maxWidth: 460,
        width: 'calc(100% - 32px)',
        bottom: { xs: 'calc(var(--bajo-el-mapa) + 12px)', sm: 24 },
      }}
    >
      <Paper elevation={6} sx={{ p: 2, borderRadius: 3, width: '100%', border: 1, borderColor: 'divider' }}>
        {thanks ? (
          <Typography variant="body2" sx={{ py: 0.5 }}>🙏 {t('appWish.thanks')}</Typography>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <PhoneIphoneIcon color="primary" sx={{ mt: 0.25 }} />
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                {t('appWish.question')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="contained" disableElevation onClick={() => vote(true)}>
                  {t('appWish.yes')}
                </Button>
                <Button size="small" variant="outlined" onClick={() => vote(false)}>
                  {t('appWish.no')}
                </Button>
              </Box>
            </Box>
            <IconButton size="small" onClick={dismiss} aria-label={t('form.cancel')} sx={{ mt: -0.5, mr: -0.5 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Paper>
    </Snackbar>
  )
}
