import { Link } from 'react-router-dom'

// NOTA: plantilla de partida, NO asesoramiento legal. Antes de publicar:
// rellena los datos entre [corchetes] y revísala (idealmente con un profesional).
export function LegalPage() {
  return (
    <div className="pad legal">
      <Link to="/">← Mapa</Link>
      <h1>Aviso legal y privacidad</h1>

      <p className="stale-warn">
        ⚠️ Plantilla de partida — revísala y completa los campos entre [corchetes] antes de publicar. No es asesoramiento legal.
      </p>

      <h2>Aviso legal</h2>
      <p>
        Responsable de este sitio: <strong>[nombre o entidad]</strong>. Contacto:{' '}
        <strong>[correo de contacto]</strong>. El uso del servicio implica la aceptación de estas condiciones.
        El contenido publicado por los usuarios (fuentes, reseñas, fotos, incidencias) es responsabilidad de quien lo publica.
      </p>

      <h2>Privacidad (RGPD)</h2>
      <p><strong>Responsable del tratamiento:</strong> [nombre/entidad], [correo de contacto].</p>
      <p><strong>Qué datos tratamos:</strong></p>
      <ul>
        <li>Tu <strong>nombre de usuario y nombre</strong>, y tu <strong>contraseña</strong> (almacenada cifrada con bcrypt, nunca en claro).</li>
        <li>El <strong>contenido que publicas</strong>: fuentes, reseñas, valoraciones, fotos e incidencias.</li>
        <li>Tu <strong>ubicación</strong> solo se usa, si tú lo autorizas, para mostrarte fuentes cercanas; <strong>no se almacena</strong> en el servidor.</li>
      </ul>
      <p>
        <strong>Finalidad y base legal:</strong> prestar el servicio que solicitas (ejecución) y el consentimiento que otorgas al registrarte.
        <strong> Conservación:</strong> mientras mantengas la cuenta.
      </p>
      <p>
        <strong>Tus derechos:</strong> acceso, rectificación, supresión, portabilidad, limitación y oposición.
        Puedes <strong>borrar tu cuenta</strong> desde la propia app (elimina tus datos), o escribir a [correo de contacto].
        También puedes reclamar ante la Agencia Española de Protección de Datos (AEPD).
      </p>
      <p>
        <strong>Almacenamiento en tu navegador:</strong> guardamos únicamente un <em>token de sesión</em> en <code>localStorage</code>,
        necesario para mantener tu sesión iniciada. No usamos cookies de seguimiento ni analítica de terceros, por lo que no requiere banner de consentimiento.
      </p>
      <p><strong>Alojamiento:</strong> los datos se procesan en [proveedor / región de hosting].</p>

      <h2>Datos cartográficos</h2>
      <p>
        El mapa base y los datos de fuentes proceden de{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>,
        © colaboradores de OpenStreetMap, bajo licencia{' '}
        <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.
      </p>
    </div>
  )
}
