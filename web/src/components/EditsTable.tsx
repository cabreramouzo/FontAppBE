import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha } from '@mui/material/styles'
import { Link as RouterLink } from 'react-router-dom'
import UndoIcon from '@mui/icons-material/Undo'
import CheckIcon from '@mui/icons-material/Check'
import type { FontEdit, FontInfoSnapshot } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { timeAgo } from '../lib/time'
import { rotulo } from '../lib/fontName'

/** Tabla del historial de ediciones de información de fuentes (moderación). */
export function EditsTable({ edits, onRevert, onAccept }: {
  edits: FontEdit[]
  onRevert: (id: string) => void
  onAccept?: (id: string) => void
}) {
  const { t } = useI18n()
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: 640, '& td, & th': { verticalAlign: 'top' } }}>
        <TableHead>
          <TableRow>
            <TableCell>{t('admin.colWhen')}</TableCell>
            <TableCell>{t('admin.colFont')}</TableCell>
            <TableCell>{t('admin.colEditor')}</TableCell>
            <TableCell>{t('admin.colField')}</TableCell>
            <TableCell>{t('admin.colBefore')}</TableCell>
            <TableCell>{t('admin.colAfter')}</TableCell>
            <TableCell align="right">{onAccept ? t('admin.actions') : t('admin.revert')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {edits.map((e) => {
            const changes = changedFields(e.before, e.after, t)
            const rows = changes.length > 0 ? changes : [{ label: '—', before: '', after: '' }]
            return rows.map((c, idx) => (
              <TableRow
                key={`${e.id}-${idx}`}
                sx={(theme) => ({
                  // Las revisadas se tiñen de verde claro (tenue, adaptado a claro/oscuro).
                  ...(e.reviewedAt ? { backgroundColor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.16 : 0.1) } : {}),
                  ...(idx !== rows.length - 1 ? { '& td': { borderBottom: 0 } } : {}),
                })}
              >
                {idx === 0 && (
                  <TableCell rowSpan={rows.length}>
                    <Typography variant="caption" color="text.secondary">{e.createdAt ? timeAgo(e.createdAt, t) : ''}</Typography>
                    {e.reviewedAt && <Chip size="small" label={t('admin.reviewed')} sx={{ display: 'block', mt: 0.5, height: 18 }} />}
                  </TableCell>
                )}
                {idx === 0 && (
                  <TableCell rowSpan={rows.length}>
                    <Link component={RouterLink} to={`/fonts/${e.fontID}`}>{rotulo(e.fontName ?? e.after.name, t)}</Link>
                  </TableCell>
                )}
                {idx === 0 && (
                  <TableCell rowSpan={rows.length}>
                    {(e.editorName || e.editorID)
                      ? <Link component={RouterLink} to={`/users/${encodeURIComponent(e.editorName ?? e.editorID!)}`}>@{e.editorName ?? '—'}</Link>
                      : <Typography variant="body2" color="text.secondary">—</Typography>}
                  </TableCell>
                )}
                <TableCell sx={{ fontWeight: 600 }}>{c.label}</TableCell>
                <TableCell sx={{ color: 'text.secondary', textDecoration: 'line-through' }}>{c.before}</TableCell>
                <TableCell>{c.after}</TableCell>
                {idx === 0 && (
                  <TableCell rowSpan={rows.length} align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {onAccept && !e.reviewedAt && (
                      <IconButton size="small" color="success" onClick={() => onAccept(e.id)} aria-label={t('admin.accept')} title={t('admin.accept')}>
                        <CheckIcon fontSize="small" />
                      </IconButton>
                    )}
                    <IconButton size="small" onClick={() => onRevert(e.id)} aria-label={t('admin.revert')} title={t('admin.revert')}>
                      <UndoIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                )}
              </TableRow>
            ))
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

/** Campos que cambiaron entre dos instantáneas, ya formateados para la tabla. */
function changedFields(before: FontInfoSnapshot, after: FontInfoSnapshot, t: (k: string, p?: Record<string, string | number>) => string): { label: string; before: string; after: string }[] {
  const fmt = (field: 'name' | 'description' | 'source' | 'drinkable', v: string | null): string => {
    if (v == null || v === '') return t('admin.editEmpty')
    if (field === 'source') return t(`source.${v}`)
    if (field === 'drinkable') return t(`drink.${v}`)
    return v
  }
  const fields: { key: 'name' | 'description' | 'source' | 'drinkable'; label: string }[] = [
    { key: 'name', label: t('newFont.name') },
    { key: 'description', label: t('detail.description') },
    { key: 'source', label: t('detail.type') },
    { key: 'drinkable', label: t('detail.drinkability') },
  ]
  return fields
    .filter((f) => (before[f.key] ?? null) !== (after[f.key] ?? null))
    .map((f) => ({ label: f.label, before: fmt(f.key, before[f.key] as string | null), after: fmt(f.key, after[f.key] as string | null) }))
}
