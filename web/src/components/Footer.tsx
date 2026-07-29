import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="footer">
      <Link to="/legal">Legal y privacidad</Link>
      <span className="muted">
        Datos ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{' '}
        (ODbL)
      </span>
    </footer>
  )
}
