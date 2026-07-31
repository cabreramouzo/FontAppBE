import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import PlaceIcon from '@mui/icons-material/Place'
import DirectionsIcon from '@mui/icons-material/Directions'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ShareIcon from '@mui/icons-material/Share'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import EditIcon from '@mui/icons-material/Edit'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import ReportProblemIcon from '@mui/icons-material/ReportProblem'
import OutlinedFlagIcon from '@mui/icons-material/OutlinedFlag'
import HideImageIcon from '@mui/icons-material/HideImageOutlined'
import type { CommentResponse, Drinkable, Font, ReportResponse, WaterSource } from '../api/types'
import {
  apiFetch,
  assetUrl,
  confirmComment,
  createComment,
  createFlag,
  createReport,
  deleteComment,
  deleteFont,
  deleteReport,
  describeError,
  updateComment,
  updateFont,
  uploadImage,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { useToast } from '../components/ToastContext'
import { StarRating } from '../components/StarRating'
import { ImagePicker } from '../components/ImagePicker'
import { Skeleton } from '../components/Skeleton'
import { ZoomableImage } from '../components/ZoomableImage'
import { compressImage } from '../lib/image'
import { WATER_STATUS, WATER_STATUS_OPTIONS } from '../lib/waterStatus'
import { DRINKABLE_EMOJI, DRINKABLE_OPTIONS, SOURCE_EMOJI, SOURCE_OPTIONS, drinkableInfo, sourceInfo } from '../lib/waterType'
import { isStale, timeAgo } from '../lib/time'

// Selector de estado del agua (reutilizado en varias formas).
function StatusSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { t } = useI18n()
  return (
    <TextField select size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: 170 }}>
      <MenuItem value="">—</MenuItem>
      {WATER_STATUS_OPTIONS.map((k) => (
        <MenuItem key={k} value={k}>{WATER_STATUS[k].emoji} {t(`status.${k}`)}</MenuItem>
      ))}
    </TextField>
  )
}

function ReviewCard({ c, highlight, canManage, canFlag, onChanged }: { c: CommentResponse; highlight?: boolean; canManage: boolean; canFlag: boolean; onChanged: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(c.body)
  const [rating, setRating] = useState(c.rating ?? 0)
  const [waterStatus, setWaterStatus] = useState(c.waterStatus ?? '')
  const [error, setError] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await updateComment(c.fontID, c.id, { body, rating: rating || undefined, waterStatus: waterStatus || undefined, image: c.image ?? undefined })
      setEditing(false)
      onChanged()
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  async function remove() {
    if (!confirm(t('review.confirmDelete'))) return
    try {
      await deleteComment(c.fontID, c.id)
      onChanged()
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  async function flag() {
    if (!confirm(t('flag.confirm'))) return
    try {
      await createFlag('comment', c.id, c.fontID)
      toast.show(t('flag.done'))
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  // Quita solo la foto de la reseña (conserva texto/valoración/estado).
  async function removePhoto() {
    if (!confirm(t('image.confirmRemove'))) return
    try {
      await updateComment(c.fontID, c.id, { body: c.body, rating: c.rating ?? undefined, waterStatus: c.waterStatus ?? undefined, image: undefined })
      onChanged()
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  if (editing) {
    return (
      <Paper variant="outlined" component="form" onSubmit={save} sx={{ p: 2, my: 1, borderRadius: 2 }}>
        <Stack direction="row" sx={{ mb: 1, alignItems: "center", flexWrap: "wrap", gap: 2 }}>
          <StatusSelect value={waterStatus} onChange={setWaterStatus} label={t('update.status')} />
          <Box><Typography variant="caption" color="text.secondary">{t('update.rating')}</Typography><StarRating value={rating} onChange={setRating} size={22} /></Box>
        </Stack>
        <TextField value={body} onChange={(e) => setBody(e.target.value)} required fullWidth multiline minRows={2} size="small" />
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button type="submit" variant="contained" disableElevation size="small">{t('form.save')}</Button>
          <Button onClick={() => setEditing(false)} size="small">{t('form.cancel')}</Button>
        </Stack>
      </Paper>
    )
  }

  const ws = c.waterStatus ? WATER_STATUS[c.waterStatus] : null
  return (
    <Paper variant="outlined" sx={{ p: 2, my: 1, borderRadius: 2, ...(highlight && { borderColor: 'primary.main', bgcolor: 'action.hover' }) }}>
      <Stack direction="row" sx={{ mb: 0.5, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
        {ws && <Chip size="small" label={`${ws.emoji} ${t(`status.${ws.key}`)}`} />}
        <Typography variant="caption" color="text.secondary">{c.username ?? t('review.anon')} · {c.createdAt ? timeAgo(c.createdAt, t) : ''}</Typography>
      </Stack>
      {c.rating != null && <StarRating value={c.rating} size={18} />}
      <Typography sx={{ my: 0.5 }}>{c.body}</Typography>
      {c.image && (
        <Box>
          <ZoomableImage className="review-img" src={assetUrl(c.image)} alt="" />
          {canManage && (
            <Box>
              <Button size="small" color="error" startIcon={<HideImageIcon />} onClick={removePhoto}>{t('image.remove')}</Button>
            </Box>
          )}
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      {(canManage || canFlag) && (
        <Stack direction="row" sx={{ mt: 0.5, flexWrap: 'wrap', gap: 1 }}>
          {canManage && <Button size="small" startIcon={<EditIcon />} onClick={() => setEditing(true)}>{t('detail.edit')}</Button>}
          {canManage && <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={remove}>{t('detail.delete')}</Button>}
          {canFlag && <Button size="small" color="inherit" startIcon={<OutlinedFlagIcon />} onClick={flag}>{t('flag.report')}</Button>}
        </Stack>
      )}
    </Paper>
  )
}

function UpdateForm({ fontID, onPosted }: { fontID: string; onPosted: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [body, setBody] = useState('')
  const [rating, setRating] = useState(0)
  const [waterStatus, setWaterStatus] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      let image: string | undefined
      if (file) image = await uploadImage(await compressImage(file))
      await createComment(fontID, { body, rating: rating || undefined, waterStatus: waterStatus || undefined, image })
      setBody('')
      setRating(0)
      setWaterStatus('')
      setFile(null)
      toast.show(t('toast.reviewPosted'))
      onPosted()
    } catch (e) {
      setError(describeError(e, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, my: 2 }}>
      <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <StatusSelect value={waterStatus} onChange={setWaterStatus} label={t('update.status')} />
        <Box><Typography variant="caption" color="text.secondary">{t('update.rating')}</Typography><StarRating value={rating} onChange={setRating} size={22} /></Box>
      </Stack>
      <TextField value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('update.howNow')} required fullWidth multiline minRows={2} size="small" />
      <ImagePicker file={file} onChange={setFile} />
      {error && <Alert severity="error">{error}</Alert>}
      <Button type="submit" variant="contained" disableElevation disabled={saving} sx={{ alignSelf: 'flex-start' }}>
        {saving ? t('update.sending') : t('update.publish')}
      </Button>
    </Box>
  )
}

function LocationActions({ font }: { font: Font }) {
  const { t } = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const coords = `${font.latitude.toFixed(6)}, ${font.longitude.toFixed(6)}`
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${font.latitude},${font.longitude}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(coords)
      setCopied(true)
      toast.show(t('toast.coordsCopied'))
      setTimeout(() => setCopied(false), 1500)
    } catch { /* sin permiso de portapapeles */ }
  }

  async function share() {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: font.name, url })
      else { await navigator.clipboard.writeText(url); toast.show(t('toast.linkCopied')) }
    } catch { /* diálogo cancelado */ }
  }

  return (
    <Stack direction="row" sx={{ my: 1.5, flexWrap: "wrap", gap: 1, '& .MuiButton-root': { whiteSpace: 'nowrap', flexShrink: 0 } }}>
      <Button variant="contained" disableElevation startIcon={<PlaceIcon />} onClick={() => navigate(`/?lat=${font.latitude}&lng=${font.longitude}&sel=${font.id}`)}>
        {t('detail.viewOnMap')}
      </Button>
      <Button variant="outlined" startIcon={<DirectionsIcon />} href={mapsUrl} target="_blank" rel="noreferrer">{t('detail.directions')}</Button>
      <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={copy}>{copied ? t('detail.copied') : coords}</Button>
      <Button variant="outlined" startIcon={<ShareIcon />} onClick={share}>{t('detail.share')}</Button>
    </Stack>
  )
}

function ReportForm({ fontID, onPosted }: { fontID: string; onPosted: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await createReport(fontID, message)
      setMessage('')
      toast.show(t('toast.reportSent'))
      onPosted()
    } catch (e) {
      setError(describeError(e, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1.5 }}>
      <TextField value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('report.placeholder')} required fullWidth multiline minRows={2} size="small" />
      {error && <Alert severity="error">{error}</Alert>}
      <Button type="submit" color="warning" variant="contained" disableElevation disabled={saving} startIcon={<ReportProblemIcon />} sx={{ alignSelf: 'flex-start' }}>
        {saving ? t('report.sending') : t('report.submit')}
      </Button>
    </Box>
  )
}

function EditFontForm({ font, onSaved, onCancel }: { font: Font; onSaved: () => void; onCancel: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(font.name)
  const [description, setDescription] = useState(font.description ?? '')
  const [source, setSource] = useState<WaterSource | ''>(font.source ?? '')
  const [drinkable, setDrinkable] = useState<Drinkable | ''>(font.drinkable ?? '')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await updateFont(font.id, { name, latitude: font.latitude, longitude: font.longitude, image: font.image ?? undefined, description: description || undefined, source: source || undefined, drinkable: drinkable || undefined })
      onSaved()
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 360, my: 2 }}>
      <TextField label={t('newFont.name')} value={name} onChange={(e) => setName(e.target.value)} required size="small" />
      <TextField label={t('detail.description')} value={description} onChange={(e) => setDescription(e.target.value)} size="small" />
      <TextField select label={t('detail.type')} value={source} onChange={(e) => setSource(e.target.value as WaterSource | '')} size="small">
        <MenuItem value="">{t('detail.unknownType')}</MenuItem>
        {SOURCE_OPTIONS.map((k) => (<MenuItem key={k} value={k}>{SOURCE_EMOJI[k]} {t(`source.${k}`)}</MenuItem>))}
      </TextField>
      <TextField select label={t('detail.drinkability')} value={drinkable} onChange={(e) => setDrinkable(e.target.value as Drinkable | '')} size="small">
        <MenuItem value="">{t('detail.unknownDrink')}</MenuItem>
        {DRINKABLE_OPTIONS.map((k) => (<MenuItem key={k} value={k}>{DRINKABLE_EMOJI[k]} {t(`drink.${k}`)}</MenuItem>))}
      </TextField>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" disableElevation>{t('form.save')}</Button>
        <Button onClick={onCancel}>{t('form.cancel')}</Button>
      </Stack>
    </Box>
  )
}

export function FontDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [font, setFont] = useState<Font | null>(null)
  const [reports, setReports] = useState<ReportResponse[]>([])
  const [comments, setComments] = useState<CommentResponse[]>([])
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [f, r, c] = await Promise.all([
      apiFetch<Font>(`/fonts/${id}`),
      apiFetch<ReportResponse[]>(`/fonts/${id}/report`),
      apiFetch<CommentResponse[]>(`/fonts/${id}/comments`),
    ])
    setFont(f)
    setReports(r)
    setComments(c)
  }, [id])

  useEffect(() => {
    load().catch((e) => setError(describeError(e, t)))
  }, [load, t])

  async function removeFont() {
    if (!id || !confirm(t('detail.confirmDeleteFont'))) return
    try {
      await deleteFont(id)
      navigate('/')
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  // Quita solo la foto de la fuente (conserva el resto de datos).
  async function removeFontPhoto() {
    if (!font || !confirm(t('image.confirmRemove'))) return
    try {
      await updateFont(font.id, {
        name: font.name,
        latitude: font.latitude,
        longitude: font.longitude,
        description: font.description ?? undefined,
        source: font.source ?? undefined,
        drinkable: font.drinkable ?? undefined,
        image: undefined,
      })
      load()
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  async function removeReport(reportID: string) {
    if (!id || !confirm(t('detail.confirmDeleteIncident'))) return
    try {
      await deleteReport(id, reportID)
      load()
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  // Confirma (o deshace) que el último estado sigue vigente (señal ligera, no un comentario).
  async function toggleConfirm() {
    const current = comments[0]
    if (!id || !current) return
    setConfirming(true)
    try {
      await confirmComment(id, current.id, !current.confirmedByMe)
      await load()
    } catch (e) {
      setError(describeError(e, t))
    } finally {
      setConfirming(false)
    }
  }

  if (!font) return <Box className="pad" sx={{ maxWidth: 720, mx: 'auto' }}>{error ? <Alert severity="error">{error}</Alert> : <Skeleton lines={5} />}</Box>

  const rated = comments.filter((c) => c.rating != null)
  const avg = rated.length ? rated.reduce((a, c) => a + (c.rating ?? 0), 0) / rated.length : null
  const latest = comments[0] ?? null
  const rest = comments.slice(1)

  return (
    <Box className="detail pad" sx={{ maxWidth: 720, mx: 'auto' }}>
      <Link component={RouterLink} to="/">{t('detail.backMap')}</Link>

      <Stack direction="row" sx={{ my: 1, justifyContent: "space-between", alignItems: "center", gap: 1 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>{font.name}</Typography>
        {user && !editing && (user.isAdmin || font.creator?.id === user.id) && (
          <Box>
            <IconButton size="small" onClick={() => setEditing(true)} aria-label={t('detail.edit')}><EditIcon /></IconButton>
            <IconButton size="small" color="error" onClick={removeFont} aria-label={t('detail.delete')}><DeleteOutlineIcon /></IconButton>
          </Box>
        )}
      </Stack>

      {editing ? (
        <EditFontForm font={font} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />
      ) : (
        <>
          {font.description && <Typography color="text.secondary">{font.description}</Typography>}
          {(() => {
            const src = sourceInfo(font.source)
            const dr = drinkableInfo(font.drinkable)
            if (!src && !dr) return null
            return (
              <Stack direction="row" sx={{ my: 1, flexWrap: "wrap", gap: 1 }}>
                {src && <Chip size="small" label={`${src.emoji} ${t(src.labelKey)}`} />}
                {dr && <Chip size="small" color={font.drinkable === 'no' ? 'error' : 'default'} label={`${dr.emoji} ${t(dr.labelKey)}`} />}
              </Stack>
            )
          })()}
          {font.image && (
            <Box>
              <ZoomableImage className="font-img" src={assetUrl(font.image)} alt={font.name} />
              {user && (user.isAdmin || font.creator?.id === user.id) && (
                <Box>
                  <Button size="small" color="error" startIcon={<HideImageIcon />} onClick={removeFontPhoto}>{t('image.remove')}</Button>
                </Box>
              )}
            </Box>
          )}
          <LocationActions font={font} />
          {avg != null && (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><StarRating value={avg} size={20} /> <Typography>{avg.toFixed(1)} ({rated.length})</Typography></Stack>
          )}
        </>
      )}

      {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}

      <Box component="section" sx={{ mt: 3 }}>
        <Typography variant="h6" gutterBottom>{t('detail.statusReviews')}</Typography>
        {latest ? (
          <>
            <Typography variant="body2" color="text.secondary">{t('detail.lastUpdate')}</Typography>
            {(() => {
              const freshAt = latest.lastConfirmedAt ?? latest.createdAt
              return freshAt && isStale(freshAt) ? <Alert severity="warning" sx={{ my: 1 }}>{t('detail.stale', { when: timeAgo(freshAt, t) })}</Alert> : null
            })()}
            <ReviewCard c={latest} highlight canManage={user?.id === latest.userID || !!user?.isAdmin} canFlag={!!user && user.id !== latest.userID} onChanged={load} />
            {latest.waterStatus && (
              <Box sx={{ my: 1.5 }}>
                {user ? (
                  <Button
                    variant={latest.confirmedByMe ? 'contained' : 'outlined'}
                    color="success"
                    disableElevation
                    startIcon={<ThumbUpIcon />}
                    onClick={toggleConfirm}
                    disabled={confirming}
                    title={latest.confirmedByMe ? t('confirm.titleActive') : t('confirm.titleInactive')}
                    endIcon={latest.confirmations > 0 ? <Chip size="small" label={`+${latest.confirmations}`} sx={{ height: 20 }} /> : undefined}
                  >
                    {latest.confirmedByMe ? t('confirm.confirmed') : t('confirm.keepSame')}
                  </Button>
                ) : (
                  latest.confirmations > 0 && <Chip icon={<ThumbUpIcon />} label={`+${latest.confirmations}`} variant="outlined" />
                )}
              </Box>
            )}
          </>
        ) : (
          <Typography color="text.secondary">{t('detail.beFirst')}</Typography>
        )}

        {user ? (
          <UpdateForm fontID={font.id} onPosted={load} />
        ) : (
          <Typography color="text.secondary" sx={{ my: 1 }}><Link component={RouterLink} to="/login">{t('nav.enter')}</Link> {t('detail.loginToUpdate')}</Typography>
        )}

        {rest.length > 0 && (
          <>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>{t('detail.previous')}</Typography>
            {rest.map((c) => (
              <ReviewCard key={c.id} c={c} canManage={user?.id === c.userID || !!user?.isAdmin} canFlag={!!user && user.id !== c.userID} onChanged={load} />
            ))}
          </>
        )}
      </Box>

      <Box component="section" sx={{ mt: 3 }}>
        <Typography variant="h6" gutterBottom>{t('detail.incidents', { n: reports.length })}</Typography>
        {reports.length === 0 && <Typography color="text.secondary">{t('detail.noIncidents')}</Typography>}
        <List disablePadding>
          {reports.map((r) => (
            <ListItem key={r.id} divider disableGutters secondaryAction={(user?.id === r.userID || user?.isAdmin) ? (
              <IconButton edge="end" size="small" color="error" onClick={() => removeReport(r.id)} aria-label={t('detail.delete')}><DeleteOutlineIcon fontSize="small" /></IconButton>
            ) : undefined}>
              <Typography variant="body2"><strong>{r.username ?? t('review.anon')}:</strong> {r.message}</Typography>
            </ListItem>
          ))}
        </List>
        <Divider sx={{ my: 1 }} />
        {user ? (
          <ReportForm fontID={font.id} onPosted={load} />
        ) : (
          <Typography color="text.secondary"><Link component={RouterLink} to="/login">{t('nav.enter')}</Link> {t('report.loginToReport')}</Typography>
        )}
      </Box>
    </Box>
  )
}
