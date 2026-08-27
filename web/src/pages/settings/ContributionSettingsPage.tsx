import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { useI18n } from '../../i18n/I18nContext'
import { capabilitiesEnabled } from '../../lib/capabilities'
import { PantallaDeAjustes, useAjustes } from './comun'

export function ContributionSettingsPage() {
  const { t } = useI18n()
  const { user, guardar, guardando, error } = useAjustes()
  // Si los niveles no conceden nada (el sistema nace apagado), no se avisa de que
  // apagarlos te quita permisos: sería amenazar con algo que no existe.
  const [capsOn, setCapsOn] = useState(false)
  useEffect(() => { void capabilitiesEnabled().then(setCapsOn) }, [])
  if (!user) return null

  return (
    <PantallaDeAjustes titulo={t('game.title')} error={error}>
      {/* Se enuncia en positivo —«compartir», encendido— y no como «ocultar», apagado.
          La preferencia guardada sigue siendo `gamificationOptOut` y su valor por defecto
          sigue siendo `false`: lo que cambia es solo cómo se lee. */}
      <FormControlLabel
        control={
          <Switch
            checked={!(user.gamificationOptOut ?? false)}
            disabled={guardando}
            onChange={(e) => void guardar({ gamificationOptOut: !e.target.checked })}
          />
        }
        label={t('game.share')}
      />
      {/* Tres frases y no una porque el interruptor mueve tres cosas distintas. */}
      <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, color: 'text.secondary' }}>
        <Typography component="li" variant="caption" sx={{ display: 'list-item' }}>
          {t('game.shareKeeps')}
        </Typography>
        <Typography component="li" variant="caption" sx={{ display: 'list-item' }}>
          {t('game.shareOffHides')}
        </Typography>
        {capsOn && (
          <Typography component="li" variant="caption" sx={{ display: 'list-item' }}>
            {t('game.shareOffCaps')}
          </Typography>
        )}
      </Box>
    </PantallaDeAjustes>
  )
}
