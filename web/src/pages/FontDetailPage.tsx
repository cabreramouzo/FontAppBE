import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { capabilities, capabilityLevels } from '../lib/capabilities'
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
import Tooltip from '@mui/material/Tooltip'
import Divider from '@mui/material/Divider'
import Collapse from '@mui/material/Collapse'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import PlaceIcon from '@mui/icons-material/Place'
import DirectionsIcon from '@mui/icons-material/Directions'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ShareIcon from '@mui/icons-material/Share'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import BookmarkIcon from '@mui/icons-material/Bookmark'
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder'
import EditIcon from '@mui/icons-material/Edit'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import ReportProblemIcon from '@mui/icons-material/ReportProblem'
import OutlinedFlagIcon from '@mui/icons-material/OutlinedFlag'
import HideImageIcon from '@mui/icons-material/HideImageOutlined'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import type { CommentResponse, Drinkable, FavoriteStatus, Font, ReportResponse, WaterSource } from '../api/types'
import type { PublicBadge } from '../api/client'
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
  resolveReport,
  describeError,
  getFavoriteStatus,
  getFontPhotoAuthor,
  getUser,
  getUserBadges,
  setFavorite,
  setFontPhotoFromComment,
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
import { WaterTypeHelpButton } from '../components/WaterTypeHelp'
import { useTheme } from '@mui/material/styles'
import { BadgeIcon } from '../components/BadgeIcon'
import { TIER_COLOR } from '../lib/tierColors'
import { BadgeArt } from '../components/BadgeArt'
import { BADGE_ART } from '../lib/levelBadges'
import { enqueue, isOffline } from '../lib/outbox'
import { ZoomableImage } from '../components/ZoomableImage'
import { compressImage } from '../lib/image'
import { RelocateFont } from '../components/RelocateFont'
import { WATER_STATUS, WATER_STATUS_OPTIONS } from '../lib/waterStatus'
import { DRINKABLE_EMOJI, DRINKABLE_OPTIONS, SOURCE_EMOJI, SOURCE_OPTIONS, drinkableInfo, sourceInfo } from '../lib/waterType'
import { isStale, timeAgo } from '../lib/time'
import { FreshnessChip } from '../components/FreshnessChip'
import { freshnessOf } from '../lib/freshness'
import { FontBadges } from '../components/FontBadges'
import { FontGallery } from '../components/FontGallery'
import { Abrible, BadgeShowcase } from '../components/BadgeShowcase'

// Reseñas "Anteriores" que se muestran por tanda (el resto, tras "mostrar más").
const REVIEWS_PAGE = 5

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

function ReviewCard({ c, highlight, canManage, canFlag, canManageFont, fontImage, onChanged }: { c: CommentResponse; highlight?: boolean; canManage: boolean; canFlag: boolean; canManageFont?: boolean; fontImage?: string | null; onChanged: () => void }) {
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
      await updateComment(c.fontID, c.id, { body: body.trim() || undefined, rating: rating || undefined, waterStatus: waterStatus || undefined, image: c.image ?? undefined })
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

  // El creador/admin promueve esta foto a foto principal de la fuente.
  async function setAsMain() {
    try {
      await setFontPhotoFromComment(c.fontID, c.id)
      toast.show(t('detail.photoSetAsMain'))
      onChanged()
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
        <TextField value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('update.howNowOpt')} fullWidth multiline minRows={2} size="small" />
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
      {c.body && <Typography sx={{ my: 0.5 }}>{c.body}</Typography>}
      {c.image && (
        <Box>
          <ZoomableImage className="review-img" src={assetUrl(c.image)} alt="" />
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {canManageFont && c.image !== fontImage && (
              <Button size="small" startIcon={<PhotoCameraIcon />} onClick={setAsMain}>{t('detail.useAsMainPhoto')}</Button>
            )}
            {canManage && (
              <Button size="small" color="error" startIcon={<HideImageIcon />} onClick={removePhoto}>{t('image.remove')}</Button>
            )}
          </Stack>
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

function UpdateForm({ fontID, onPosted, onCancel }: { fontID: string; onPosted: () => void; onCancel?: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [body, setBody] = useState('')
  const [rating, setRating] = useState(0)
  const [waterStatus, setWaterStatus] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Hay que aportar algo: estado, comentario, valoración o foto.
  const empty = !waterStatus && !body.trim() && !rating && !file

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    // Comprimimos antes: la foto queda lista para subirla o para guardarla en la cola.
    const photo = file ? await compressImage(file) : undefined
    const data = { body: body.trim() || undefined, rating: rating || undefined, waterStatus: waterStatus || undefined }
    const clear = () => { setBody(''); setRating(0); setWaterStatus(''); setFile(null) }
    try {
      const image = photo ? await uploadImage(photo) : undefined
      await createComment(fontID, { ...data, image })
      clear()
      toast.show(t('toast.reviewPosted'))
      onPosted()
    } catch (e) {
      // Sin cobertura: se guarda en el móvil y se envía en cuanto haya red.
      if (isOffline(e)) {
        await enqueue({ kind: 'comment', fontID, data, photo, photoName: photo?.name })
        clear()
        toast.show(t('offline.savedUpdate'))
        onPosted()
      } else {
        setError(describeError(e, t))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
      <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <StatusSelect value={waterStatus} onChange={setWaterStatus} label={t('update.status')} />
        <Box><Typography variant="caption" color="text.secondary">{t('update.rating')}</Typography><StarRating value={rating} onChange={setRating} size={22} /></Box>
      </Stack>
      <TextField value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('update.howNowOpt')} fullWidth multiline minRows={2} size="small" />
      <ImagePicker file={file} onChange={setFile} />
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" disableElevation disabled={saving || empty}>
          {saving ? t('update.sending') : t('update.publish')}
        </Button>
        {onCancel && <Button onClick={onCancel} disabled={saving}>{t('form.cancel')}</Button>}
      </Stack>
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
      {/* «Otras fotos» va en esta fila y no debajo de la portada. Allí se perdía: en una
          fuente sin foto quedaba en una zona donde nadie mira, y es la puerta a los
          documentos —el informe del agua—, que es lo que menos se espera encontrar y por
          tanto lo que más necesita verse. Mismo `variant` que las demás a propósito: una
          fila de cuatro botones iguales y un quinto distinto se lee como un descuido. */}
      <FontGallery fontID={font.id} />
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

function EditFontForm({ font, canManage, onSaved, onCancel }: { font: Font; canManage: boolean; onSaved: () => void; onCancel: () => void }) {
  const { t, lang } = useI18n()
  const [name, setName] = useState(font.name)
  const [description, setDescription] = useState(font.description ?? '')
  const [source, setSource] = useState<WaterSource | ''>(font.source ?? '')
  const [drinkable, setDrinkable] = useState<Drinkable | ''>(font.drinkable ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [coords, setCoords] = useState({ lat: font.latitude, lng: font.longitude })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  // La primera foto la puede poner cualquiera; sustituir una que ya existe, no.
  const puedeFoto = canManage || !font.image
  // Mover el pin de una fuente ajena lo abre el nivel (fase 6). Se resuelve al abrir el
  // formulario y no al pintar la ficha: solo hace falta aquí.
  const [porNivel, setPorNivel] = useState(false)
  // Y a partir de qué nivel se abre, para poder decirlo. «Todavía no puedes» deja a la
  // persona sin saber si le faltan diez gotas o diez mil, y sin nada que hacer.
  const [nivelReubicar, setNivelReubicar] = useState<{ level: string; gotes: number } | null>(null)
  useEffect(() => {
    let vivo = true
    if (!canManage) {
      capabilities().then((c) => { if (vivo) setPorNivel(c.includes('relocateAnyFont')) })
      capabilityLevels().then((cs) => {
        const c = cs.find((x) => x.key === 'relocateAnyFont')
        if (vivo && c) setNivelReubicar({ level: c.level, gotes: c.gotes })
      })
    }
    return () => { vivo = false }
  }, [canManage])
  const puedeReubicar = canManage || porNivel

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      // Sustituir la foto es cosa del creador/admin; poner la PRIMERA la puede poner
      // cualquiera (casi ninguna fuente importada tiene creador). Si no hay archivo
      // nuevo se conserva la actual.
      let image = font.image ?? undefined
      if (puedeFoto && file) image = await uploadImage(await compressImage(file))
      // La ubicación va siempre en la petición, pero el servidor solo la aplica si
      // eres el creador o un admin: para el resto se conserva la que ya tenía.
      await updateFont(font.id, { name, latitude: coords.lat, longitude: coords.lng, image, description: description || undefined, source: source || undefined, drinkable: drinkable || undefined })
      onSaved()
    } catch (e) {
      setError(describeError(e, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 360, my: 2 }}>
      <Typography variant="caption" color="text.secondary">{t('detail.editInfoNote')}</Typography>
      <TextField label={t('newFont.name')} value={name} onChange={(e) => setName(e.target.value)} required size="small" />
      <TextField label={t('detail.description')} value={description} onChange={(e) => setDescription(e.target.value)} size="small" />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <TextField select label={t('detail.type')} value={source} onChange={(e) => setSource(e.target.value as WaterSource | '')} size="small" sx={{ flexGrow: 1 }}>
          <MenuItem value="">{t('detail.unknownType')}</MenuItem>
          {SOURCE_OPTIONS.map((k) => (<MenuItem key={k} value={k}>{SOURCE_EMOJI[k]} {t(`source.${k}`)}</MenuItem>))}
        </TextField>
        <WaterTypeHelpButton />
      </Box>
      <TextField select label={t('detail.drinkability')} value={drinkable} onChange={(e) => setDrinkable(e.target.value as Drinkable | '')} size="small">
        <MenuItem value="">{t('detail.unknownDrink')}</MenuItem>
        {DRINKABLE_OPTIONS.map((k) => (<MenuItem key={k} value={k}>{DRINKABLE_EMOJI[k]} {t(`drink.${k}`)}</MenuItem>))}
      </TextField>
      {puedeReubicar ? (
        <RelocateFont
          lat={coords.lat}
          lng={coords.lng}
          original={{ lat: font.latitude, lng: font.longitude }}
          onChange={(lat, lng) => setCoords({ lat, lng })}
        />
      ) : (
        // Quien no la creó no puede moverla: que lo avise y ya lo corregirá quien pueda.
        <Typography variant="caption" color="text.secondary">
          📍 {t('relocate.notYours')}{' '}
          {nivelReubicar && t('cap.needLevel', {
            level: t(`game.level.${nivelReubicar.level}`),
            n: nivelReubicar.gotes.toLocaleString(lang),
          })}
        </Typography>
      )}
      {puedeFoto && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {font.image ? t('detail.replacePhoto') : t('detail.addPhoto')}
          </Typography>
          <ImagePicker file={file} onChange={setFile} />
          {!font.image && !canManage && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {t('detail.firstPhotoNote')}
            </Typography>
          )}
        </Box>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" disableElevation disabled={saving}>{saving ? t('form.saving') : t('form.save')}</Button>
        <Button onClick={onCancel} disabled={saving}>{t('form.cancel')}</Button>
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
  const [updating, setUpdating] = useState(false) // formulario de nueva actualización desplegado
  const [creatorName, setCreatorName] = useState<string | null>(null)
  // Insignia de creador (familia `discoverer`): se pide aparte porque es un dato de la
  // persona y no de la fuente, y porque no debe hacer esperar a la ficha.
  const [creatorBadge, setCreatorBadge] = useState<PublicBadge | null>(null)
  // Dos juegos de bronce/plata/oro, uno por tema: el bronce que funciona sobre papel se
  // queda por debajo del contraste que pide la WCAG sobre fondo oscuro (ver `tierColors`).
  const tierColor = TIER_COLOR[useTheme().palette.mode === 'dark' ? 'dark' : 'light']
  const [favorite, setFavState] = useState<FavoriteStatus | null>(null)
  const [savingFavorite, setSavingFavorite] = useState(false)
  // Cuántas reseñas "Anteriores" se muestran (se amplía con "mostrar más").
  const [shownRest, setShownRest] = useState(REVIEWS_PAGE)
  // Qué insignia se está mirando en grande, o `null`. Un solo visor para toda la ficha:
  // lo abren tanto los escudos de las líneas de creador y pionero como la sección de
  // abajo, y nunca hay dos abiertos a la vez.
  const [mirando, setMirando] = useState<
    { key: string; tier: string | null; locked: boolean; subtitle?: string } | null
  >(null)
  // Cerrar incidencias ajenas lo abre el nivel 6. Se resuelve una vez por ficha y se
  // comparte con la caché de `lib/capabilities`, así que no cuesta una petición.
  const [puedeCerrarIncidencias, setPuedeCerrar] = useState(false)
  useEffect(() => {
    if (!user) return
    let vivo = true
    capabilities().then((c) => { if (vivo) setPuedeCerrar(c.includes('resolveIncident')) })
    return () => { vivo = false }
  }, [user])

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
    // Estado de favorito (recuento público; "guardada por mí" si hay sesión).
    getFavoriteStatus(id).then(setFavState).catch(() => setFavState(null))
    // Nombre del creador (las importadas de OSM no tienen), para enlazar a su perfil.
    if (f.creator?.id) {
      getUser(f.creator.id).then((u) => setCreatorName(u.username)).catch(() => setCreatorName(null))
      // Solo la de creador: en la ficha de una fuente lo que viene a cuento es cuántas
      // ha puesto en el mapa quien puso ésta. El resto de su colección está en su perfil.
      getUserBadges(f.creator.id)
        .then((bs) => setCreatorBadge(bs.find((b) => b.family === 'discoverer') ?? null))
        .catch(() => setCreatorBadge(null))
    } else {
      setCreatorName(null)
      setCreatorBadge(null)
    }
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

  /// Quién puede cerrar una incidencia: quien la abrió, un admin, o quien lo tenga
  /// abierto por nivel. El servidor lo vuelve a comprobar; esto solo decide si se pinta
  /// el botón, para no ofrecer una acción que va a devolver 403.
  function puedeResolver(r: ReportResponse): boolean {
    return !!user && (user.id === r.userID || !!user.isAdmin || puedeCerrarIncidencias)
  }

  async function cambiaResuelta(r: ReportResponse, resolver: boolean) {
    if (!id) return
    try {
      await resolveReport(id, r.id, resolver)
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

  // Guarda / deja de guardar la fuente en favoritos (requiere sesión).
  async function toggleFavorite() {
    if (!id) return
    if (!user) { window.location.assign('/login'); return }
    setSavingFavorite(true)
    try {
      const next = await setFavorite(id, !favorite?.favorited)
      setFavState(next)
    } catch (e) {
      setError(describeError(e, t))
    } finally {
      setSavingFavorite(false)
    }
  }

  // Quién puso la foto: lo dice el servidor, que es el único que puede.
  //
  // Esto se intentó dos veces desde el cliente y las dos se quedó corto. Con la reseña
  // con foto más antigua fallaba cuando la fuente nacía con foto; añadiendo al creador
  // fallaba cuando la foto llegó por el formulario de editar, que es el caso más común
  // en las importadas — y el historial de ediciones es de moderación, así que desde aquí
  // no hay forma. El dato existe; solo que en una tabla que esta pantalla no lee.
  //
  // La respuesta va cacheada por el navegador y es una consulta pequeña sobre una fuente.
  // Antes de deducirlo mal por tercera vez, mejor preguntarlo.
  const [photoAuthor, setPhotoAuthor] = useState<string | null>(null)
  useEffect(() => {
    if (!id || !font?.image) { setPhotoAuthor(null); return }
    let vivo = true
    getFontPhotoAuthor(id).then((u) => { if (vivo) setPhotoAuthor(u) }).catch(() => {})
    return () => { vivo = false }
  }, [id, font?.image])

  if (!font) return <Box className="pad" sx={{ maxWidth: 720, mx: 'auto' }}>{error ? <Alert severity="error">{error}</Alert> : <Skeleton lines={5} />}</Box>

  const rated = comments.filter((c) => c.rating != null)
  const avg = rated.length ? rated.reduce((a, c) => a + (c.rating ?? 0), 0) / rated.length : null
  const latest = comments[0] ?? null
  const rest = comments.slice(1)
  const canManageFont = !!user && (!!user.isAdmin || font.creator?.id === user.id)
  // Ascender la foto de una reseña: si la fuente aún no tiene foto, cualquiera puede.
  // La foto ya está hecha — solo falta decir que sirve como principal.
  const puedeAscenderFoto = canManageFont || (!!user && !font.image)

  // Quién fue el primero en dejar constancia de esta fuente. Por fecha y no por posición
  // en el array: el endpoint las manda más recientes primero, pero apoyarse en el orden
  // del servidor en vez de en el dato es lo que rompe el día que alguien pagina o cachea.
  const pioneerComment = comments.length
    ? comments.reduce((antigua, c) => (new Date(c.createdAt) < new Date(antigua.createdAt) ? c : antigua))
    : null
  // Cuentas anonimizadas se quedan sin username: no hay a quién enlazar ni felicitar.
  const pioneerUsername = pioneerComment?.username ?? null
  // La insignia de Pionero (fase de gamificación) solo se gana en fuentes IMPORTADAS —
  // convierte un punto sin historia en una fuente vista por alguien. Si la fuente tiene
  // creador, quien la reseñó primero es un dato curioso pero no cuenta para esa insignia,
  // así que el icono no se enseña: prometer un logro que el servidor no ha dado sería peor
  // que no decir nada.
  const pioneerCountsAsBadge = !font.creator?.id
  // Si el creador y quien reseñó primero son la misma persona, la segunda línea no dice
  // nada que la primera no dijera ya.
  const showPioneer = !!pioneerUsername && pioneerUsername !== creatorName


  const ultimaComprobacion = latest?.lastConfirmedAt ?? latest?.createdAt ?? null
  const frescor = freshnessOf(ultimaComprobacion)

  return (
    <Box className="detail pad" sx={{ maxWidth: 720, mx: 'auto' }}>
      <Link component={RouterLink} to="/">{t('detail.backMap')}</Link>

      <Stack direction="row" sx={{ mt: 1, justifyContent: "space-between", alignItems: "center", gap: 1 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>{font.name}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {/* Guardar en favoritos: visible siempre; sin sesión lleva a login. */}
          <IconButton
            size="small"
            color={favorite?.favorited ? 'primary' : 'default'}
            onClick={toggleFavorite}
            disabled={savingFavorite}
            aria-label={favorite?.favorited ? t('favorite.saved') : t('favorite.save')}
            title={favorite?.favorited ? t('favorite.saved') : t('favorite.save')}
          >
            {favorite?.favorited ? <BookmarkIcon /> : <BookmarkBorderIcon />}
          </IconButton>
          {favorite && favorite.count > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>{favorite.count}</Typography>
          )}
        {user && !editing && (
          <>
            {/* Edición abierta: cualquiera puede corregir el nombre/info (estilo wiki). */}
            <IconButton size="small" onClick={() => setEditing(true)} aria-label={t('detail.edit')} title={t('detail.editInfoHint')}><EditIcon /></IconButton>
            {/* Borrar (y reubicar) queda reservado al creador o a un admin. */}
            {(user.isAdmin || font.creator?.id === user.id) && (
              <IconButton size="small" color="error" onClick={removeFont} aria-label={t('detail.delete')}><DeleteOutlineIcon /></IconButton>
            )}
          </>
        )}
        </Box>
      </Stack>

      {/* Frescor, justo bajo el nombre. Siempre dice algo: en las miles de fuentes
          importadas la respuesta es «ningú l'ha comprovada mai», que es precisamente la
          que hacía falta y la que antes se quedaba en blanco. Va aquí y no junto al
          estado del agua porque responde a otra pregunta —cuándo, no qué— y porque es lo
          primero que quieres saber antes de fiarte del resto de la ficha. */}
      <Box sx={{ mb: 1.5 }}>
        <FreshnessChip lastCheck={latest?.lastConfirmedAt ?? latest?.createdAt ?? null} />
      </Box>

      {creatorName && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: showPioneer ? 0.25 : 1, display: 'flex', alignItems: 'center', gap: 0.5 }}
        >
          <span>
            {t('detail.createdBy')}{' '}
            <Link component={RouterLink} to={`/users/${encodeURIComponent(creatorName)}`}>@{creatorName}</Link>
          </span>
          {/* La medalla de Descubridor de quien la puso. El dibujo es el mismo en los
              tres grados y el aro dice cuál es (ver `BadgeArt`). */}
          {creatorBadge && (
            // El tooltip va DENTRO del botón y no al revés: `Abrible` no reenvía la
            // referencia que `Tooltip` necesita en su hijo, y montado al contrario el
            // globo no se coloca. Se queda el tooltip (dice el grado de un vistazo) y
            // encima se puede abrir en grande, que era lo que faltaba.
            <Abrible
              puede
              nombre={t('game.badge.discoverer')}
              onOpen={() => setMirando({
                key: 'discoverer', tier: creatorBadge.tier, locked: false,
                subtitle: creatorName ? `@${creatorName}` : undefined,
              })}
            >
              <Tooltip title={`${t('game.badge.discoverer')} · ${t(`game.tier.${creatorBadge.tier}`)}`}>
                <Box component="span" sx={{ display: 'flex', color: tierColor[creatorBadge.tier] ?? 'text.secondary' }}>
                  {BADGE_ART.has('discoverer')
                    ? <BadgeArt family="discoverer" size={26} tier={creatorBadge.tier} />
                    : <BadgeIcon family="discoverer" fontSize="small" />}
                </Box>
              </Tooltip>
            </Abrible>
          )}
        </Typography>
      )}

      {/* El "Mayor" de Foursquare, sin el nombre: quién fue el primero en dejar
          constancia de esta fuente. Va justo bajo el creador porque contesta la misma
          pregunta ("¿de quién es esta ficha?") desde otro ángulo, y la insignia solo
          aparece cuando de verdad se ha ganado (fuentes sin creador) — no como adorno. */}
      {showPioneer && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <span>
            {t('detail.pioneerBy')}{' '}
            <Link component={RouterLink} to={`/users/${encodeURIComponent(pioneerUsername!)}`}>@{pioneerUsername}</Link>
          </span>
          {pioneerCountsAsBadge && (
            <Abrible
              puede
              nombre={t('game.badge.pioneer')}
              onOpen={() => setMirando({ key: 'pioneer', tier: null, locked: false, subtitle: `@${pioneerUsername}` })}
            >
              <Tooltip title={t('game.badge.pioneer')}>
                {/* El escudo dibujado a 26 px: aquí la insignia es el premio, y el
                    icono de línea al lado de un nombre no se lee como tal. Si algún
                    día falta el fichero, `BadgeArt` devuelve null y queda el icono. */}
                <Box component="span" sx={{ display: 'flex', color: 'text.secondary' }}>
                  {BADGE_ART.has('pioneer')
                    ? <BadgeArt family="pioneer" size={26} />
                    : <BadgeIcon family="pioneer" fontSize="small" />}
                </Box>
              </Tooltip>
            </Abrible>
          )}
        </Typography>
      )}

      {editing ? (
        <EditFontForm font={font} canManage={!!user && (user.isAdmin || font.creator?.id === user.id)} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />
      ) : (
        <>
          {font.description && <Typography color="text.secondary">{font.description}</Typography>}
          {(() => {
            const src = sourceInfo(font.source)
            const dr = drinkableInfo(font.drinkable)
            if (!src && !dr) return null
            return (
              <Stack direction="row" sx={{ my: 1, flexWrap: "wrap", gap: 1, alignItems: 'center' }}>
                {src && <Chip size="small" label={`${src.emoji} ${t(src.labelKey)}`} />}
                {dr && <Chip size="small" color={font.drinkable === 'no' ? 'error' : 'default'} label={`${dr.emoji} ${t(dr.labelKey)}`} />}
                {/* Leyenda: qué significa cada tipo y qué esperar del agua. */}
                {src && <WaterTypeHelpButton />}
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
            {/* Tarjeta con el ESTADO ACTUAL, separada visualmente del formulario. */}
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6 }}>
                {t('detail.currentStatus')}
              </Typography>
              {(() => {
                const freshAt = latest.lastConfirmedAt ?? latest.createdAt
                return freshAt && isStale(freshAt) ? <Alert severity="warning" sx={{ my: 1 }}>{t('detail.stale', { when: timeAgo(freshAt, t) })}</Alert> : null
              })()}
              <ReviewCard c={latest} highlight canManage={user?.id === latest.userID || !!user?.isAdmin} canFlag={!!user && user.id !== latest.userID} canManageFont={puedeAscenderFoto} fontImage={font.image} onChanged={load} />
              {latest.waterStatus && latest.lastConfirmedAt && (
                <Typography variant="caption" color="text.secondary">
                  {t('confirm.lastConfirmed', { when: timeAgo(latest.lastConfirmedAt, t) })}
                </Typography>
              )}
            </Box>

            {/* Acciones: sigue igual (1 clic) o ha cambiado (abre el formulario). */}
            {user ? (
              <>
                {!updating && (
                  <Stack direction="row" sx={{ my: 1.5, gap: 1, flexWrap: 'wrap' }}>
                    {latest.waterStatus && (
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
                    )}
                    <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setUpdating(true)}>
                      {t('detail.changed')}
                    </Button>
                  </Stack>
                )}
                <Collapse in={updating} unmountOnExit>
                  <Box sx={{ my: 1.5 }}>
                    <Typography variant="subtitle2">{t('detail.newUpdate')}</Typography>
                    <UpdateForm fontID={font.id} onPosted={() => { setUpdating(false); load() }} onCancel={() => setUpdating(false)} />
                  </Box>
                </Collapse>
              </>
            ) : (
              <Typography color="text.secondary" sx={{ my: 1.5 }}><Link href="/login">{t('nav.enter')}</Link> {t('detail.loginToUpdate')}</Typography>
            )}
          </>
        ) : (
          /* Sin actualizaciones aún: invita a informar. */
          <>
            <Typography color="text.secondary">{t('detail.beFirst')}</Typography>
            {user ? (
              !updating ? (
                <Button variant="contained" disableElevation startIcon={<EditIcon />} onClick={() => setUpdating(true)} sx={{ mt: 1 }}>
                  {t('detail.reportStatus')}
                </Button>
              ) : (
                <UpdateForm fontID={font.id} onPosted={() => { setUpdating(false); load() }} onCancel={() => setUpdating(false)} />
              )
            ) : (
              <Typography color="text.secondary" sx={{ my: 1 }}><Link href="/login">{t('nav.enter')}</Link> {t('detail.loginToUpdate')}</Typography>
            )}
          </>
        )}

        {rest.length > 0 && (
          <>
            <Divider sx={{ mt: 2 }} />
            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>{t('detail.previous')}</Typography>
            {rest.slice(0, shownRest).map((c) => (
              <ReviewCard key={c.id} c={c} canManage={user?.id === c.userID || !!user?.isAdmin} canFlag={!!user && user.id !== c.userID} canManageFont={puedeAscenderFoto} fontImage={font.image} onChanged={load} />
            ))}
            {rest.length > shownRest && (
              <Button onClick={() => setShownRest((n) => n + REVIEWS_PAGE)} sx={{ mt: 1 }}>
                {t('detail.showMoreReviews', { n: rest.length - shownRest })}
              </Button>
            )}
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
              <Box>
                <Typography variant="body2" sx={{ ...(r.resolvedAt && { color: 'text.secondary' }) }}>
                  <strong>{r.username ?? t('review.anon')}:</strong> {r.message}
                </Typography>
                {/* Resuelta: se tacha el problema, no se esconde. Que la fuente estuvo
                    rota y volvió a manar es lo que mira quien duda si acercarse. */}
                {r.resolvedAt ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25, flexWrap: 'wrap' }}>
                    <Chip size="small" color="success" variant="outlined" label={t('report.resolved')} sx={{ height: 20 }} />
                    <Typography variant="caption" color="text.secondary">
                      {r.resolvedBy ? t('report.resolvedBy', { user: r.resolvedBy }) : ''} · {timeAgo(r.resolvedAt, t)}
                    </Typography>
                    {puedeResolver(r) && (
                      <Button size="small" onClick={() => cambiaResuelta(r, false)} sx={{ textTransform: 'none' }}>
                        {t('report.reopen')}
                      </Button>
                    )}
                  </Box>
                ) : puedeResolver(r) && (
                  <Button size="small" onClick={() => cambiaResuelta(r, true)} sx={{ textTransform: 'none', ml: -1 }}>
                    {t('report.resolve')}
                  </Button>
                )}
              </Box>
            </ListItem>
          ))}
        </List>
        <Divider sx={{ my: 1 }} />
        {user ? (
          <ReportForm fontID={font.id} onPosted={load} />
        ) : (
          <Typography color="text.secondary"><Link href="/login">{t('nav.enter')}</Link> {t('report.loginToReport')}</Typography>
        )}
      </Box>

      {/* Va al final y no arriba: es lo último que se mira, después de haber leído si hay
          agua. Puesto antes competiría con la información de la fuente, que es a lo que
          viene la gente. */}
      <FontBadges
        creatorName={creatorName}
        creatorTier={creatorBadge?.tier ?? null}
        pioneerUsername={pioneerUsername}
        pioneerCounts={pioneerCountsAsBadge}
        hasPhoto={!!font.image}
        photoAuthor={photoAuthor}
        daysSinceLastCheck={frescor.days}
        neverChecked={frescor.level === 'never'}
        onOpen={(key, tier, locked, subtitle) => setMirando({ key, tier, locked, subtitle })}
      />

      <BadgeShowcase
        open={!!mirando}
        onClose={() => setMirando(null)}
        kind="badge"
        badgeKey={mirando?.key ?? ''}
        tier={mirando?.tier ?? null}
        locked={mirando?.locked ?? false}
        subtitle={mirando?.subtitle}
      />
    </Box>
  )
}
