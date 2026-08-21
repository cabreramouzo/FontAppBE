import Typography from '@mui/material/Typography'
import { LegendHelpButton } from './WaterHelp'
import { CONFIDENCE_EMOJI, confidenceDetailKey, confidenceLabelKey } from '../lib/confidence'
import type { ConfidenceLevel } from '../lib/confidence'
import { useI18n } from '../i18n/I18nContext'

const LEVELS: ConfidenceLevel[] = ['verified', 'recent', 'disputed', 'stale', 'unverified']

/** Leyenda accesible del índice: explica el criterio, no solo el color del chip. */
export function ConfidenceHelpButton() {
  const { t } = useI18n()
  return (
    <LegendHelpButton
      titulo={t('confidence.helpTitle')}
      filas={LEVELS.map((level) => ({
        clave: level,
        emoji: CONFIDENCE_EMOJI[level],
        rotulo: t(confidenceLabelKey(level)),
        explicacion: t(confidenceDetailKey(level)),
      }))}
      nota={
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          {t('confidence.helpNote')}
        </Typography>
      }
    />
  )
}
