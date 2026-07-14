import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { CommentResponse, Font, ReportResponse } from '../api/types'
import {
  apiFetch,
  createComment,
  deleteComment,
  deleteFont,
  deleteReport,
  updateComment,
  updateFont,
  uploadImage,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { StarRating } from '../components/StarRating'
import { WATER_STATUS, WATER_STATUS_OPTIONS, waterStatusInfo } from '../lib/waterStatus'
import { timeAgo } from '../lib/time'

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
    if (!confirm('¿Borrar esta reseña?')) return
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
          <label>Estado:
            <select value={waterStatus} onChange={(e) => setWaterStatus(e.target.value)}>
              <option value="">—</option>
              {WATER_STATUS_OPTIONS.map((k) => (
                <option key={k} value={k}>{WATER_STATUS[k].emoji} {WATER_STATUS[k].label}</option>
              ))}
            </select>
          </label>
          <label>Valoración: <StarRating value={rating} onChange={setRating} size={18} /></label>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} required />
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit">Guardar</button>
          <button type="button" className="link" onClick={() => setEditing(false)}>Cancelar</button>
        </div>
      </form>
    )
  }

  const ws = waterStatusInfo(c.waterStatus)
  return (
    <div className={'review' + (highlight ? ' latest' : '')}>
      <div className="review-head">
        {ws && <span className="badge">{ws.emoji} {ws.label}</span>}
        <span className="muted">{c.username ?? 'anónimo'} · {c.createdAt ? timeAgo(c.createdAt) : ''}</span>
      </div>
      {c.rating != null && <StarRating value={c.rating} size={16} />}
      <p>{c.body}</p>
      {c.image && <img className="review-img" src={c.image} alt="" />}
      {error && <p className="error">{error}</p>}
      {canManage && (
        <div className="row small">
          <button className="link" onClick={() => setEditing(true)}>Editar</button>
          <button className="link danger" onClick={remove}>Borrar</button>
        </div>
      )}
    </div>
  )
}

function UpdateForm({ fontID, onPosted }: { fontID: string; onPosted: () => void }) {
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
      if (file) image = await uploadImage(file)
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
        <label>Estado:
          <select value={waterStatus} onChange={(e) => setWaterStatus(e.target.value)}>
            <option value="">—</option>
            {WATER_STATUS_OPTIONS.map((k) => (
              <option key={k} value={k}>{WATER_STATUS[k].emoji} {WATER_STATUS[k].label}</option>
            ))}
          </select>
        </label>
        <label>Valoración: <StarRating value={rating} onChange={setRating} size={18} /></label>
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="¿Cómo está la fuente ahora?" required />
      <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>{saving ? 'Enviando…' : 'Publicar actualización'}</button>
    </form>
  )
}

function EditFontForm({ font, onSaved, onCancel }: { font: Font; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(font.name)
  const [description, setDescription] = useState(font.description ?? '')
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
      })
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <form onSubmit={submit} className="col">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" required />
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción" />
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="submit">Guardar</button>
        <button type="button" className="link" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

export function FontDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
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
    if (!id || !confirm('¿Borrar esta fuente?')) return
    try {
      await deleteFont(id)
      navigate('/')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function removeReport(reportID: string) {
    if (!id || !confirm('¿Borrar esta incidencia?')) return
    try {
      await deleteReport(id, reportID)
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // Confirma que el último estado sigue vigente (refresca la frescura sin escribir reseña).
  async function confirmStatus() {
    const current = comments[0]
    if (!id || !current?.waterStatus) return
    setConfirming(true)
    try {
      await createComment(id, { body: 'Sigue igual ✅', waterStatus: current.waterStatus })
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setConfirming(false)
    }
  }

  if (!font) return <p className="pad">{error || 'Cargando…'}</p>

  const rated = comments.filter((c) => c.rating != null)
  const avg = rated.length ? rated.reduce((a, c) => a + (c.rating ?? 0), 0) / rated.length : null
  const latest = comments[0] ?? null
  const rest = comments.slice(1)

  return (
    <div className="detail pad">
      <Link to="/">← Mapa</Link>

      <div className="detail-head">
        <h1>{font.name}</h1>
        {user && !editing && (
          <div className="row">
            <button className="link" onClick={() => setEditing(true)}>Editar</button>
            <button className="link danger" onClick={removeFont}>Borrar</button>
          </div>
        )}
      </div>

      {editing ? (
        <EditFontForm font={font} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />
      ) : (
        <>
          {font.description && <p className="muted">{font.description}</p>}
          {font.image && <img className="font-img" src={font.image} alt={font.name} />}
          <p className="muted">Lat {font.latitude.toFixed(4)}, Long {font.longitude.toFixed(4)}</p>
          {avg != null && (
            <p className="avg"><StarRating value={avg} size={18} /> {avg.toFixed(1)} ({rated.length})</p>
          )}
        </>
      )}

      {error && <p className="error">{error}</p>}

      <section>
        <h2>Estado y reseñas</h2>
        {latest ? (
          <>
            <p className="muted small">Última actualización:</p>
            <ReviewCard c={latest} highlight canManage={user?.id === latest.userID} onChanged={load} />
            {user && latest.waterStatus && (
              <button className="confirm-btn" onClick={confirmStatus} disabled={confirming}>
                {confirming ? 'Confirmando…' : '👍 Sigue igual'}
              </button>
            )}
          </>
        ) : (
          <p className="muted">Aún no hay actualizaciones. ¡Sé el primero en informar del estado!</p>
        )}

        {user ? (
          <UpdateForm fontID={font.id} onPosted={load} />
        ) : (
          <p className="muted"><Link to="/login">Entra</Link> para actualizar el estado.</p>
        )}

        {rest.length > 0 && (
          <>
            <h3 className="muted small">Anteriores</h3>
            {rest.map((c) => (
              <ReviewCard key={c.id} c={c} canManage={user?.id === c.userID} onChanged={load} />
            ))}
          </>
        )}
      </section>

      <section>
        <h2>Incidencias ({reports.length})</h2>
        {reports.length === 0 && <p className="muted">Sin incidencias reportadas.</p>}
        <ul className="list">
          {reports.map((r) => (
            <li key={r.id}>
              <strong>{r.username ?? 'anónimo'}:</strong> {r.message}
              {user?.id === r.userID && (
                <button className="link danger small" onClick={() => removeReport(r.id)}> · Borrar</button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
