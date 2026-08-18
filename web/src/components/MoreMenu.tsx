import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import CheckIcon from '@mui/icons-material/Check'
import LogoutIcon from '@mui/icons-material/Logout'
import MapOutlinedIcon from '@mui/icons-material/MapOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { useI18n } from '../i18n/I18nContext'
import { LANGS, type Lang } from '../i18n/dictionaries'
import { useThemeMode, type ThemePref } from '../theme/ThemeModeContext'

const TEMAS: { pref: ThemePref; key: string }[] = [
  { pref: 'system', key: 'theme.system' },
  { pref: 'light', key: 'theme.light' },
  { pref: 'dark', key: 'theme.dark' },
]

/**
 * El cajón de la barra en móvil: zonas, tema, idioma y salir.
 *
 * ## Por qué existe
 *
 * La barra se había arreglado dos veces bajando huecos y escondiendo cosas por
 * `@media`, y volvía a romperse en cuanto entraba un botón nuevo — la campana fue el
 * tercero. Medido a 393 px con sesión iniciada quedaban **9 px** de margen: no es que
 * sobrara un icono concreto, es que la fila iba a cero y cualquier variación (una
 * tipografía distinta, «CA» en vez de «EN», cómo dibuje el emoji cada sistema) la
 * tumbaba. Un cuarto `@media` habría comprado otros nueve píxeles.
 *
 * El reparto ya no es «lo que quepa» sino **la frecuencia de uso**. En la barra se
 * quedan las tres cosas que se tocan a diario —novedades, campana y perfil— y aquí baja
 * todo lo que se toca una vez en la vida. Como efecto secundario, el cajón le da casa a
 * lo que venga después en vez de que vuelva a competir por la fila.
 *
 * Y de paso arregla algo que estaba peor que apretado: **Zonas no se podía abrir desde
 * la barra en móvil**, estaba escondida con `display: none` justamente por falta de
 * sitio.
 *
 * En pantallas anchas no se pinta: allí hay espacio de sobra y los controles sueltos se
 * ven y se tocan mejor que un menú.
 */
export function MoreMenu({ onLogout }: { onLogout?: () => void }) {
  const { t, lang, setLang } = useI18n()
  const { pref, setPref } = useThemeMode()
  const [ancla, setAncla] = useState<HTMLElement | null>(null)
  const cerrar = () => setAncla(null)

  return (
    <>
      <Tooltip title={t('nav.more')}>
        <IconButton
          color="inherit"
          size="small"
          aria-label={t('nav.more')}
          aria-haspopup="menu"
          onClick={(e) => setAncla(e.currentTarget)}
        >
          <MoreVertIcon />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={ancla} open={!!ancla} onClose={cerrar} slotProps={{ list: { dense: true } }}>
        <MenuItem component={RouterLink} to="/zones" onClick={cerrar}>
          <ListItemIcon><MapOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('zones.title')}</ListItemText>
        </MenuItem>

        <Divider />
        <ListSubheader sx={{ lineHeight: '28px', bgcolor: 'transparent' }}>{t('theme.label')}</ListSubheader>
        {/* Tres opciones y no un botón que rota: en un menú, «pulsa hasta que salga el
            que quieres» obliga a abrirlo tres veces. La marca dice cuál está puesto. */}
        {TEMAS.map((o) => (
          <MenuItem key={o.pref} selected={pref === o.pref} onClick={() => { setPref(o.pref); cerrar() }}>
            <ListItemIcon>{pref === o.pref && <CheckIcon fontSize="small" />}</ListItemIcon>
            <ListItemText>{t(o.key)}</ListItemText>
          </MenuItem>
        ))}

        <Divider />
        <ListSubheader sx={{ lineHeight: '28px', bgcolor: 'transparent' }}>{t('lang.label')}</ListSubheader>
        {LANGS.map((l) => (
          <MenuItem key={l.code} selected={lang === l.code} onClick={() => { setLang(l.code as Lang); cerrar() }}>
            <ListItemIcon>{lang === l.code && <CheckIcon fontSize="small" />}</ListItemIcon>
            <ListItemText>{l.label}</ListItemText>
          </MenuItem>
        ))}

        {onLogout && [
          <Divider key="sep" />,
          <MenuItem key="out" onClick={() => { cerrar(); onLogout() }}>
            <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('nav.logout')}</ListItemText>
          </MenuItem>,
        ]}
      </Menu>
    </>
  )
}
