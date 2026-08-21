import Chip from '@mui/material/Chip'
import type { ConfidenceEvidence } from '../lib/confidence'
import { CONFIDENCE_EMOJI, confidenceDetailKey, confidenceLabelKey, confidenceOf } from '../lib/confidence'
import { useI18n } from '../i18n/I18nContext'

export function ConfidenceChip({ evidence, size = 'small' }: { evidence: ConfidenceEvidence; size?: 'small' | 'medium' }) {
  const { t } = useI18n()
  const level = confidenceOf(evidence)
  const color = level === 'verified' ? 'success' : level === 'disputed' ? 'warning' : 'default'
  return (
    <Chip
      size={size}
      color={color}
      variant={level === 'verified' || level === 'disputed' ? 'filled' : 'outlined'}
      label={`${CONFIDENCE_EMOJI[level]} ${t(confidenceLabelKey(level))}`}
      title={t(confidenceDetailKey(level))}
    />
  )
}
