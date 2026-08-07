import { useState } from 'react'
import IconButton from '@mui/material/IconButton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import CheckIcon from '@mui/icons-material/Check'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined'
import type { UserRole } from '../api/types'
import { useI18n } from '../i18n/I18nContext'

const ROLES: UserRole[] = ['user', 'moderator', 'admin', 'owner']

// Qué rol mínimo hace falta para cada capacidad (jerárquico: incluye superiores).
const CAPABILITIES: { key: string; from: UserRole }[] = [
  { key: 'rolesHelp.capBasic', from: 'user' },
  { key: 'rolesHelp.capModerate', from: 'moderator' },
  { key: 'rolesHelp.capManage', from: 'admin' },
  { key: 'rolesHelp.capRoles', from: 'owner' },
]

const RANK: Record<UserRole, number> = { user: 0, moderator: 1, admin: 2, owner: 3 }

/** Botón (?) que abre una tabla-resumen de qué puede hacer cada rol. */
export function RolesHelpButton() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <>
      <IconButton size="small" onClick={() => setOpen(true)} aria-label={t('rolesHelp.title')} title={t('rolesHelp.title')}>
        <HelpOutlineIcon fontSize="small" />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('rolesHelp.title')}</DialogTitle>
        <DialogContent>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('rolesHelp.capability')}</TableCell>
                  {ROLES.map((r) => (
                    <TableCell key={r} align="center" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{t(`role.${r}`)}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {CAPABILITIES.map((c) => (
                  <TableRow key={c.key}>
                    <TableCell>{t(c.key)}</TableCell>
                    {ROLES.map((r) => (
                      <TableCell key={r} align="center">
                        {RANK[r] >= RANK[c.from]
                          ? <CheckIcon fontSize="small" color="success" />
                          : <Typography component="span" color="text.disabled">—</Typography>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            {t('rolesHelp.ownerNote')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('rolesHelp.close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
