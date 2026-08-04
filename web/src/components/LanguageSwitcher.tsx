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
