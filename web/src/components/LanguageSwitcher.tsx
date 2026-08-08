import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import { useI18n } from '../i18n/I18nContext'
import { LANGS, type Lang } from '../i18n/dictionaries'

// Selector de idioma (Select compacto de MUI) para la barra superior.
export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n()
  return (
    <Select
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      size="small"
      variant="standard"
      disableUnderline
      aria-label={t('lang.label')}
      // MUI renderiza un <input> nativo oculto para el valor del Select. Va ANTES del
      // formulario de login, así que el autorrelleno de Safari puede tomarlo como campo
      // candidato y desplazar el par usuario/contraseña (metiendo la contraseña en el
      // campo de usuario). Lo marcamos para que los gestores lo ignoren.
      inputProps={{ autoComplete: 'off', name: 'lang', 'data-1p-ignore': true, 'data-lpignore': true }}
      // Cerrado: solo el código (ES/CA/EN…) para no saturar la barra en móvil.
      // Abierto: el nombre completo del idioma.
      renderValue={(value) => String(value).toUpperCase()}
      sx={{ fontSize: 14, fontWeight: 600, '& .MuiSelect-select': { py: 0.5 } }}
    >
      {LANGS.map((l) => (
        <MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>
      ))}
    </Select>
  )
}
