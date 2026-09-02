import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import { useI18n } from '../i18n/I18nContext'
import { LANGS, type Lang } from '../i18n/dictionaries'

/**
 * Language picker.
 *
 * `bar` (default) is the compact one for the top bar: standard, just the code (ES/CA…).
 *
 * `prominent` is for the first onboarding dialog. It leads with a globe 🌐 and the
 * **native language name** (Español, English, Català…) on purpose: someone who doesn't
 * read the current language can't parse an "Idioma:" label, but the globe is universal and
 * their own language written in their own language is recognisable. The switcher lives
 * only in that first dialog — the choice persists to every later popup and to the whole
 * app, so repeating it elsewhere would be noise, not help.
 */
export function LanguageSwitcher({ variant = 'bar' }: { variant?: 'bar' | 'prominent' }) {
  const { lang, setLang, t } = useI18n()
  const prominent = variant === 'prominent'
  return (
    <Select
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      size="small"
      // Only the onboarding one pulses, and only for those without reduced-motion (CSS).
      className={prominent ? 'lang-pulse' : undefined}
      variant={prominent ? 'outlined' : 'standard'}
      disableUnderline={!prominent}
      aria-label={t('lang.label')}
      // MUI renderiza un <input> nativo oculto para el valor del Select. Va ANTES del
      // formulario de login, así que el autorrelleno de Safari puede tomarlo como campo
      // candidato y desplazar el par usuario/contraseña (metiendo la contraseña en el
      // campo de usuario). Lo marcamos para que los gestores lo ignoren.
      inputProps={{ autoComplete: 'off', name: 'lang', 'data-1p-ignore': true, 'data-lpignore': true }}
      // Bar: just the code, to not crowd the bar on mobile. Prominent: globe + native name,
      // so it is recognisable without reading the current language.
      renderValue={(value) =>
        prominent
          ? `🌐 ${LANGS.find((l) => l.code === value)?.label ?? String(value)}`
          : String(value).toUpperCase()
      }
      sx={
        prominent
          ? { fontSize: 15, fontWeight: 700, '& .MuiSelect-select': { py: 0.75 } }
          : { fontSize: 14, fontWeight: 600, '& .MuiSelect-select': { py: 0.5 } }
      }
    >
      {LANGS.map((l) => (
        <MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>
      ))}
    </Select>
  )
}
