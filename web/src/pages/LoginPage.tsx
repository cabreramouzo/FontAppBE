import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function LoginPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (mode === 'login') await login(username, password)
      else await register(name, username, password)
      navigate('/')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="pad auth">
      <h1>{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</h1>
      <form onSubmit={submit} className="col">
        {mode === 'register' && (
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" required />
        )}
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Usuario (mín. 3)" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña (mín. 8)" required />
        <button type="submit">{mode === 'login' ? 'Entrar' : 'Registrarme'}</button>
      </form>
      {error && <p className="error">{error}</p>}
      <p className="muted">
        {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
        <button className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
          {mode === 'login' ? 'Regístrate' : 'Entra'}
        </button>
      </p>
    </div>
  )
}
