import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import LightModeIcon from '@mui/icons-material/LightModeOutlined'
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined'
import AutoModeIcon from '@mui/icons-material/BrightnessAuto'
import { useI18n } from '../i18n/I18nContext'
import { useThemeMode, type ThemePref } from '../theme/ThemeModeContext'

const NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
/** Los tres estados, para reservar el ancho del rótulo más largo. */
const ORDEN: ThemePref[] = ['system', 'light', 'dark']
const ICON: Record<ThemePref, typeof LightModeIcon> = {
  system: AutoModeIcon,
  light: LightModeIcon,
  dark: DarkModeIcon,
}

// Alterna tema sistema → claro → oscuro (icono Material según la preferencia).
export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { t } = useI18n()
  const { pref, setPref } = useThemeMode()
  const Icon = ICON[pref]
  return (
    <IconButton
      onClick={() => setPref(NEXT[pref])}
      title={t('theme.label')}
      aria-label={t('theme.label')}
      color="inherit"
      size="small"
      sx={showLabel ? { flexDirection: 'column', borderRadius: 2, px: 0.75, py: 0.375 } : undefined}
    >
      {/* Mismo tamaño que la campana contigua. Con `small` el rótulo subía para ocupar
          el hueco y ambos controles parecían apoyados en líneas distintas. */}
      <Icon />
      {/* Los tres rótulos ocupan LA MISMA celda de la rejilla y solo se ve el activo.
          Así el botón mide siempre lo que el más largo de los tres y no se mueve al
          cambiar de tema — antes pasaba de «Claro» a «Automático» y empujaba todo lo que
          tenía a la derecha.
          Se hace así y no con un ancho fijo a propósito: el más largo cambia con el
          idioma («Automatikoa» son 11 caracteres en euskera, «Argia» 5), así que
          cualquier número elegido mirando el castellano se queda corto en otro sitio. Es
          la misma lección que el mínimo de la rejilla de `/zones`.
          `visibility: hidden` y no `display: none`: lo oculto tiene que seguir ocupando
          su celda, que es de lo que sale el ancho. Y así tampoco lo leen los lectores de
          pantalla, que además ya anuncian el `aria-label` del botón. */}
      {showLabel && (
        <Box sx={{ display: 'grid', mt: 0.25 }}>
          {ORDEN.map((p) => (
            <Typography
              key={p}
              component="span"
              sx={{
                gridArea: '1 / 1',
                fontSize: 10,
                lineHeight: 1.15,
                visibility: p === pref ? 'visible' : 'hidden',
              }}
            >
              {t(`theme.${p}`)}
            </Typography>
          ))}
        </Box>
      )}
    </IconButton>
  )
}
