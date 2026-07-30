import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { CommentResponse, Drinkable, Font, ReportResponse, WaterSource } from '../api/types'
import {
  apiFetch,
  assetUrl,
  confirmComment,
  createComment,
  createReport,
  deleteComment,
  deleteFont,
  deleteReport,
  updateComment,
  updateFont,
  uploadImage,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { StarRating } from '../components/StarRating'
import { ImagePicker } from '../components/ImagePicker'
import { compressImage } from '../lib/image'
import { WATER_STATUS, WATER_STATUS_OPTIONS } from '../lib/waterStatus'
import {
  DRINKABLE_EMOJI,
  DRINKABLE_OPTIONS,
  SOURCE_EMOJI,
  SOURCE_OPTIONS,
  drinkableInfo,
  sourceInfo,
} from '../lib/waterType'
import { isStale, timeAgo } from '../lib/time'

function ReviewCard({
  c,
  highlight,
  canManage,
  onChanged,
}: {
  c: CommentResponse
  highlight?: boolean
  canManage: boolean
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(c.body)
  const [rating, setRating] = useState(c.rating ?? 0)
  const [waterStatus, setWaterStatus] = useState(c.waterStatus ?? '')
  const [error, setError] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await updateComment(c.fontID, c.id, {
        body,
        rating: rating || undefined,
        waterStatus: waterStatus || undefined,
        image: c.image ?? undefined,
      })
      setEditing(false)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function remove() {
    if (!confirm(t('review.confirmDelete'))) return
    try {
      await deleteComment(c.fontID, c.id)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (editing) {
    return (
      <form className="review" onSubmit={save}>
        <div className="update-row">
          <label>{t('update.status')}
            <select value={waterStatus} onChange={(e) => setWaterStatus(e.target.value)}>
              <option value="">—</option>
              {WATER_STATUS_OPTIONS.map((k) => (
                <option key={k} value={k}>{WATER_STATUS[k].emoji} {t(`status.${k}`)}</option>
              ))}
            </select>
          </label>
          <label>{t('update.rating')} <StarRating value={rating} onChange={setRating} size={18} /></label>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} required />
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit">{t('form.save')}</button>
          <button type="button" className="link" onClick={() => setEditing(false)}>{t('form.cancel')}</button>
        </div>
      </form>
    )
  }

  const ws = c.waterStatus ? WATER_STATUS[c.waterStatus] : null
  return (
    <div className={'review' + (highlight ? ' latest' : '')}>
      <div className="review-head">
        {ws && <span className="badge">{ws.emoji} {t(`status.${ws.key}`)}</span>}
        <span className="muted">{c.username ?? t('review.anon')} · {c.createdAt ? timeAgo(c.createdAt, t) : ''}</span>
      </div>
      {c.rating != null && <StarRating value={c.rating} size={16} />}
      <p>{c.body}</p>
      {c.image && <img className="review-img" src={assetUrl(c.image)} alt="" />}
      {error && <p className="error">{error}</p>}
      {canManage && (
        <div className="row small">
          <button className="link" onClick={() => setEditing(true)}>{t('detail.edit')}</button>
          <button className="link danger" onClick={remove}>{t('detail.delete')}</button>
        </div>
      )}
    </div>
  )
}

function UpdateForm({ fontID, onPosted }: { fontID: string; onPosted: () => void }) {
  const { t } = useI18n()
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
      await createComment(fontID, {
        body,
        rating: rating || undefined,
        waterStatus: waterStatus || undefined,
        image,
      })
      setBody('')
      setRating(0)
      setWaterStatus('')
      setFile(null)
      onPosted()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="update-form">
      <div className="update-row">
        <label>{t('update.status')}
          <select value={waterStatus} onChange={(e) => setWaterStatus(e.target.value)}>
            <option value="">—</option>
            {WATER_STATUS_OPTIONS.map((k) => (
              <option key={k} value={k}>{WATER_STATUS[k].emoji} {t(`status.${k}`)}</option>
            ))}
          </select>
        </label>
        <label>{t('update.rating')} <StarRating value={rating} onChange={setRating} size={18} /></label>
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('update.howNow')} required />
      <ImagePicker file={file} onChange={setFile} />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>{saving ? t('update.sending') : t('update.publish')}</button>
    </form>
  )
}

// Acciones de ubicación: cómo llegar, copiar coordenadas y compartir.
function LocationActions({ font }: { font: Font }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const coords = `${font.latitude.toFixed(6)}, ${font.longitude.toFixed(6)}`
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${font.latitude},${font.longitude}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(coords)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // navegadores sin permiso de portapapeles: no hacemos nada
    }
  }

  async function share() {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: font.name, url })
      else await navigator.clipboard.writeText(url)
    } catch {
      // el usuario canceló el diálogo de compartir: sin acción
    }
  }

  return (
    <div className="loc-actions">
      <a className="loc-btn" href={mapsUrl} target="_blank" rel="noreferrer">🧭 {t('detail.directions')}</a>
      <button type="button" className="loc-btn" onClick={copy}>
        📋 {copied ? t('detail.copied') : `${coords}`}
      </button>
      <button type="button" className="loc-btn" onClick={share}>🔗 {t('detail.share')}</button>
    </div>
  )
}

// Formulario para reportar una incidencia (avería, sin agua, sucia…).
function ReportForm({ fontID, onPosted }: { fontID: string; onPosted: () => void }) {
  const { t } = useI18n()
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
      onPosted()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="report-form">
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('report.placeholder')} required />
      {error && <p className="error">{error}</p>}
      <button type="submit" className="report-btn" disabled={saving}>
        ⚠️ {saving ? t('report.sending') : t('report.submit')}
      </button>
    </form>
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
      await updateFont(font.id, {
        name,
        latitude: font.latitude,
        longitude: font.longitude,
        image: font.image ?? undefined,
        description: description || undefined,
        source: source || undefined,
        drinkable: drinkable || undefined,
      })
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <form onSubmit={submit} className="col">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('newFont.name')} required />
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('detail.description')} />
      <label>{t('detail.type')}
        <select value={source} onChange={(e) => setSource(e.target.value as WaterSource | '')}>
          <option value="">{t('detail.unknownType')}</option>
          {SOURCE_OPTIONS.map((k) => (
            <option key={k} value={k}>{SOURCE_EMOJI[k]} {t(`source.${k}`)}</option>
          ))}
        </select>
      </label>
      <label>{t('detail.drinkability')}
        <select value={drinkable} onChange={(e) => setDrinkable(e.target.value as Drinkable | '')}>
          <option value="">{t('detail.unknownDrink')}</option>
          {DRINKABLE_OPTIONS.map((k) => (
            <option key={k} value={k}>{DRINKABLE_EMOJI[k]} {t(`drink.${k}`)}</option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="submit">{t('form.save')}</button>
        <button type="button" className="link" onClick={onCancel}>{t('form.cancel')}</button>
      </div>
    </form>
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
    load().catch((e) => setError((e as Error).message))
  }, [load])

  async function removeFont() {
    if (!id || !confirm(t('detail.confirmDeleteFont'))) return
    try {
      await deleteFont(id)
      navigate('/')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function removeReport(reportID: string) {
    if (!id || !confirm(t('detail.confirmDeleteIncident'))) return
    try {
      await deleteReport(id, reportID)
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // Confirma (o deshace) que el último estado sigue vigente. Es una señal ligera
  // (👍 con contador), NO un comentario nuevo — así la lista no se llena.
  async function toggleConfirm() {
    const current = comments[0]
    if (!id || !current) return
    setConfirming(true)
    try {
      await confirmComment(id, current.id, !current.confirmedByMe)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setConfirming(false)
    }
  }

  if (!font) return <p className="pad">{error || t('detail.loading')}</p>

  const rated = comments.filter((c) => c.rating != null)
  const avg = rated.length ? rated.reduce((a, c) => a + (c.rating ?? 0), 0) / rated.length : null
  const latest = comments[0] ?? null
  const rest = comments.slice(1)

  return (
    <div className="detail pad">
      <Link to="/">{t('detail.backMap')}</Link>

      <div className="detail-head">
        <h1>{font.name}</h1>
        {user && !editing && (
          <div className="row">
            <button className="link" onClick={() => setEditing(true)}>{t('detail.edit')}</button>
            <button className="link danger" onClick={removeFont}>{t('detail.delete')}</button>
          </div>
        )}
      </div>

      {editing ? (
        <EditFontForm font={font} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />
      ) : (
        <>
          {font.description && <p className="muted">{font.description}</p>}
          {(() => {
            const src = sourceInfo(font.source)
            const dr = drinkableInfo(font.drinkable)
            if (!src && !dr) return null
            return (
              <p className="badges">
                {src && <span className="badge">{src.emoji} {t(src.labelKey)}</span>}
                {dr && <span className={'badge' + (font.drinkable === 'no' ? ' danger' : '')}>{dr.emoji} {t(dr.labelKey)}</span>}
              </p>
            )
          })()}
          {font.image && <img className="font-img" src={assetUrl(font.image)} alt={font.name} />}
          <LocationActions font={font} />
          {avg != null && (
            <p className="avg"><StarRating value={avg} size={18} /> {avg.toFixed(1)} ({rated.length})</p>
          )}
        </>
      )}

      {error && <p className="error">{error}</p>}

      <section>
        <h2>{t('detail.statusReviews')}</h2>
        {latest ? (
          <>
            <p className="muted small">{t('detail.lastUpdate')}</p>
            {(() => {
              // Frescura = lo más reciente entre la reseña y su última confirmación.
              const freshAt = latest.lastConfirmedAt ?? latest.createdAt
              return freshAt && isStale(freshAt) ? (
                <p className="stale-warn">{t('detail.stale', { when: timeAgo(freshAt, t) })}</p>
              ) : null
            })()}
            <ReviewCard c={latest} highlight canManage={user?.id === latest.userID} onChanged={load} />
            {latest.waterStatus && (
              <div className="confirm-row">
                {user ? (
                  <button
                    className={'confirm-btn' + (latest.confirmedByMe ? ' active' : '')}
                    onClick={toggleConfirm}
                    disabled={confirming}
                    title={latest.confirmedByMe ? t('confirm.titleActive') : t('confirm.titleInactive')}
                  >
                    👍 {latest.confirmedByMe ? t('confirm.confirmed') : t('confirm.keepSame')}
                    {latest.confirmations > 0 && <span className="confirm-count">+{latest.confirmations}</span>}
                  </button>
                ) : (
                  latest.confirmations > 0 && (
                    <span className="confirm-badge">👍 <span className="confirm-count">+{latest.confirmations}</span></span>
                  )
                )}
              </div>
            )}
          </>
        ) : (
          <p className="muted">{t('detail.beFirst')}</p>
        )}

        {user ? (
          <UpdateForm fontID={font.id} onPosted={load} />
        ) : (
          <p className="muted"><Link to="/login">{t('nav.enter')}</Link> {t('detail.loginToUpdate')}</p>
        )}

        {rest.length > 0 && (
          <>
            <h3 className="muted small">{t('detail.previous')}</h3>
            {rest.map((c) => (
              <ReviewCard key={c.id} c={c} canManage={user?.id === c.userID} onChanged={load} />
            ))}
          </>
        )}
      </section>

      <section>
        <h2>{t('detail.incidents', { n: reports.length })}</h2>
        {reports.length === 0 && <p className="muted">{t('detail.noIncidents')}</p>}
        <ul className="list">
          {reports.map((r) => (
            <li key={r.id}>
              <strong>{r.username ?? t('review.anon')}:</strong> {r.message}
              {user?.id === r.userID && (
                <button className="link danger small" onClick={() => removeReport(r.id)}> · {t('detail.delete')}</button>
              )}
            </li>
          ))}
        </ul>
        {user ? (
          <ReportForm fontID={font.id} onPosted={load} />
        ) : (
          <p className="muted"><Link to="/login">{t('nav.enter')}</Link> {t('report.loginToReport')}</p>
        )}
      </section>
    </div>
  )
}
