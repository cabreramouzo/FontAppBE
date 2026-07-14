import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { CommentResponse, Font, ReportResponse } from '../api/types'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export function FontDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [font, setFont] = useState<Font | null>(null)
  const [reports, setReports] = useState<ReportResponse[]>([])
  const [comments, setComments] = useState<CommentResponse[]>([])
  const [message, setMessage] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')

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

  async function submitReport(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await apiFetch(`/fonts/${id}/report`, { method: 'POST', body: JSON.stringify({ message }) })
      setMessage('')
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await apiFetch(`/fonts/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) })
      setBody('')
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!font) return <p className="pad">Cargando…</p>

  return (
    <div className="detail pad">
      <Link to="/">← Mapa</Link>
      <h1>{font.name}</h1>
      {font.description && <p className="muted">{font.description}</p>}
      {font.image && <img className="font-img" src={font.image} alt={font.name} />}
      <p className="muted">Lat {font.latitude.toFixed(4)}, Long {font.longitude.toFixed(4)}</p>

      {error && <p className="error">{error}</p>}

      <section>
        <h2>Incidencias ({reports.length})</h2>
        {reports.length === 0 && <p className="muted">Sin incidencias reportadas.</p>}
        <ul className="list">
          {reports.map((r) => (
            <li key={r.id}>
              <strong>{r.username ?? 'anónimo'}:</strong> {r.message}
            </li>
          ))}
        </ul>
        {user ? (
          <form onSubmit={submitReport} className="row">
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Reportar un problema…" required />
            <button type="submit">Reportar</button>
          </form>
        ) : (
          <p className="muted"><Link to="/login">Entra</Link> para reportar.</p>
        )}
      </section>

      <section>
        <h2>Comentarios ({comments.length})</h2>
        {comments.length === 0 && <p className="muted">Sé el primero en comentar.</p>}
        <ul className="list">
          {comments.map((c) => (
            <li key={c.id}>
              <strong>{c.username ?? 'anónimo'}:</strong> {c.body}
            </li>
          ))}
        </ul>
        {user ? (
          <form onSubmit={submitComment} className="row">
            <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe un comentario…" required />
            <button type="submit">Comentar</button>
          </form>
        ) : (
          <p className="muted"><Link to="/login">Entra</Link> para comentar.</p>
        )}
      </section>
    </div>
  )
}
