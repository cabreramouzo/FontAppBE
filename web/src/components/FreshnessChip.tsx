import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined'
import { freshnessColor, freshnessOf } from '../lib/freshness'
import { useI18n } from '../i18n/I18nContext'

/**
 * «Comprobada aquesta setmana» / «fa temps» / «ningú l'ha comprovada mai».
 *
 * Siempre dice algo, incluso —sobre todo— cuando la respuesta es «nunca». Un hueco en
 * blanco se lee como «no hay problema», y en una fuente que nadie ha visitado eso es
 * justamente lo contrario de lo que sabemos.
 */
export function FreshnessChip({ lastCheck, size = 'small' }: { lastCheck?: string | null; size?: 'small' | 'medium' }) {
  const { t } = useI18n()
  const f = freshnessOf(lastCheck)
  const nunca = f.level === 'never'

  return (
    <Tooltip title={nunca ? t('fresh.neverHint') : t('fresh.hint', { n: String(f.days ?? 0) })}>
      <Chip
        size={size}
        variant={nunca ? 'outlined' : 'filled'}
        color={freshnessColor(f.level)}
        icon={nunca ? <HelpOutlineIcon /> : <EventAvailableOutlinedIcon />}
        label={t(`fresh.${f.level}`)}
        sx={{ fontWeight: 600 }}
      />
    </Tooltip>
  )
}
