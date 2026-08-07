import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import SearchIcon from '@mui/icons-material/Search'
import type { AdminUser, UserRole } from '../api/types'
import { describeError, getUsersAdmin, setUserRole, USERS_ADMIN_PER } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { isOwner } from '../lib/roles'
import { timeAgo } from '../lib/time'
import { RolesHelpButton } from '../components/RolesHelp'

export function AdminUsersPage() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [rows, setRows] = useState<AdminUser[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (p: number, q: string) => {
    try {
      const res = await getUsersAdmin(p, q)
      setRows(res.items)
      setTotal(res.metadata.total)
      setPage(res.metadata.page)
    } catch (e) {
      setError(describeError(e, t))
      setRows([])
    }
  }, [t])

  // Acceso: solo owner. Fuera al terminar de restaurar la sesión.
  useEffect(() => {
    if (loading) return
    if (!isOwner(user)) { navigate('/'); return }
    load(1, '')
  }, [user, loading, navigate, load])

  // Búsqueda con debounce (vuelve a la página 1).
  useEffect(() => {
    if (!isOwner(user)) return
    const timer = setTimeout(() => load(1, search), 350)
    return () => clearTimeout(timer)
  }, [search, user, load])

  async function changeRole(u: AdminUser, role: UserRole) {
    setError('')
    try {
      await setUserRole(u.id, role)
      setRows((rs) => rs?.map((r) => (r.id === u.id ? { ...r, role } : r)) ?? null)
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  if (!isOwner(user)) return null

  const pages = Math.max(1, Math.ceil(total / USERS_ADMIN_PER))
  const place = (u: AdminUser) => [u.signupCity, u.signupRegion, u.signupCountry].filter(Boolean).join(', ')

  return (
    <Box className="pad" sx={{ maxWidth: 1000, mx: 'auto' }}>
      <Link component={RouterLink} to="/admin">{t('admin.backPanel')}</Link>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, my: 1 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>👥 {t('admin.users')}</Typography>
        <RolesHelpButton />
      </Box>
      {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}

      <TextField
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('admin.usersSearch')}
        size="small"
        fullWidth
        sx={{ mb: 2, maxWidth: 420 }}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
      />

      {rows === null && <Skeleton lines={6} />}
      {rows?.length === 0 && <Typography color="text.secondary">{t('admin.usersNone')}</Typography>}
      {rows && rows.length > 0 && (
        <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 760 }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('admin.colUser')}</TableCell>
                <TableCell>{t('admin.colEmail')}</TableCell>
                <TableCell>{t('admin.colPlace')}</TableCell>
                <TableCell>{t('admin.colJoined')}</TableCell>
                <TableCell>{t('admin.colRole')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Link component={RouterLink} to={`/users/${encodeURIComponent(u.username)}`} sx={{ fontWeight: 600 }}>@{u.username}</Link>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {u.name}{u.anonymized && <Chip size="small" label={t('admin.usersAnon')} sx={{ ml: 0.5, height: 18 }} />}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{u.email ?? '—'}</TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{place(u) || '—'}</TableCell>
                  <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{u.createdAt ? timeAgo(u.createdAt, t) : '—'}</TableCell>
                  <TableCell>
                    {u.id === user?.id ? (
                      <Chip size="small" label={t('role.owner')} color="primary" />
                    ) : u.role === 'owner' ? (
                      <Chip size="small" label={t('role.owner')} />
                    ) : (
                      <Select size="small" value={u.role} onChange={(e) => changeRole(u, e.target.value as UserRole)} sx={{ minWidth: 130 }}>
                        <MenuItem value="user">{t('role.user')}</MenuItem>
                        <MenuItem value="moderator">{t('role.moderator')}</MenuItem>
                        <MenuItem value="admin">{t('role.admin')}</MenuItem>
                      </Select>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {pages > 1 && (
        <Stack direction="row" spacing={2} sx={{ mt: 2, alignItems: 'center', justifyContent: 'center' }}>
          <Button size="small" disabled={page <= 1} onClick={() => load(page - 1, search)}>{t('admin.prev')}</Button>
          <Typography variant="body2" color="text.secondary">{t('admin.pageOf', { page, pages })}</Typography>
          <Button size="small" disabled={page >= pages} onClick={() => load(page + 1, search)}>{t('admin.next')}</Button>
        </Stack>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{t('admin.usersTotal', { n: total })}</Typography>
    </Box>
  )
}
