import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import { useI18n } from '../i18n/I18nContext'

// NOTA: redactado por el responsable, NO asesoramiento legal profesional.
// Datos de contacto y responsable: Miguel Cabrera · admin@fontapp.net.
// Incluye un descargo de responsabilidad sobre la potabilidad del agua.
//
// OJO al tocar la app: este texto describe hechos verificables (qué datos se guardan,
// qué terceros los reciben, qué se guarda en el navegador). Si añades un servicio
// externo, una analítica o un dato nuevo, ACTUALIZA ESTO. Un aviso legal que miente
// es peor que no tenerlo.
export function LegalPage() {
  const { lang, t } = useI18n()
  return (
    <Box
      className="pad legal"
      sx={{
        maxWidth: 720,
        mx: 'auto',
        '& h1': { typography: 'h4', fontWeight: 800, mt: 1, mb: 2 },
        '& h2': { typography: 'h6', mt: 3, mb: 1 },
        '& p': { typography: 'body1', my: 1.5 },
        '& ul': { pl: 3, my: 1 },
        '& li': { typography: 'body2', my: 0.5 },
        '& code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 1, fontSize: 13 },
        '& a': { color: 'primary.main' },
      }}
    >
      <Link component={RouterLink} to="/">{t('detail.backMap')}</Link>
      {lang === 'ca' ? <LegalCA /> : lang === 'en' ? <LegalEN /> : <LegalES />}
    </Box>
  )
}

function LegalCA() {
  return (
    <>
      <h1>Avís legal i privacitat</h1>

      <h2>⚠️ Advertència sobre l'aigua i responsabilitat</h2>
      <p className="stale-warn">
        FontApp és un servei d'informació <strong>col·laborativa</strong>: les fonts, l'estat de l'aigua i la potabilitat
        els aporten les persones usuàries i fonts de dades obertes, i poden estar <strong>desactualitzats, incomplets o ser incorrectes</strong>.
        La informació és <strong>merament orientativa</strong> i no substitueix una anàlisi oficial de l'aigua. FontApp <strong>no garanteix</strong> la
        potabilitat ni la salubritat de l'aigua de cap font. Beure aigua de les fonts que hi apareixen queda
        <strong> sota el criteri i el risc exclusiu de la persona usuària</strong>. En cas de dubte, no beguis o tracta l'aigua (bull-la o depura-la).
        Ni FontApp ni el seu responsable es fan responsables de cap dany derivat de l'ús d'aquesta informació.
      </p>

      <h2>Avís legal</h2>
      <p>
        Responsable d'aquest lloc: <strong>Miguel Cabrera</strong>. Contacte:{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>. L'ús del servei implica l'acceptació d'aquestes condicions.
        El contingut publicat pels usuaris (fonts, ressenyes, fotos, incidències) és responsabilitat de qui el publica.
      </p>

      <h2>Privacitat (RGPD)</h2>
      <p><strong>Responsable del tractament:</strong> Miguel Cabrera, <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.</p>
      <p><strong>Quines dades tractem:</strong></p>
      <ul>
        <li>El teu <strong>nom d'usuari i nom</strong>, la teva <strong>adreça de correu</strong> i la teva <strong>contrasenya</strong> (desada xifrada amb bcrypt, mai en clar).</li>
        <li>El <strong>contingut que publiques</strong>: fonts, ressenyes, valoracions, fotos i incidències.</li>
        <li>La teva <strong>ubicació precisa</strong> només s'utilitza, si l'autoritzes, per mostrar-te fonts properes; <strong>no es desa</strong> al servidor.</li>
        <li>En <strong>registrar-te</strong> desem la teva <strong>regió aproximada</strong> (país/regió deduïts de la IP, <strong>no la IP</strong>) i l'<strong>idioma</strong> de la interfície, per a estadística d'ús i per escriure't en la teva llengua.</li>
        <li>Si arribes des d'un <strong>cartell o una campanya</strong> amb codi (<code>fontapp.net/?p=castellcir</code>), desem aquest codi amb l'alta per saber quin cartell funciona. No identifica cap persona.</li>
      </ul>
      <p><strong>Per a què fem servir el teu correu:</strong></p>
      <ul>
        <li>Missatges necessaris del servei: benvinguda i recuperació de contrasenya.</li>
        <li>Un <strong>resum setmanal</strong> de novetats a les fonts que has afegit o on has participat. Pots desactivar-lo quan vulguis des del teu perfil o amb l'enllaç de baixa que porta cada correu, sense iniciar sessió.</li>
      </ul>
      <p>
        <strong>Finalitat i base legal:</strong> prestar el servei que sol·licites (execució) i el consentiment que atorgues en registrar-te.
        <strong> Conservació:</strong> mentre mantinguis el compte.
      </p>
      <p>
        <strong>Els teus drets:</strong> accés, rectificació, supressió, portabilitat, limitació i oposició.
        Pots <strong>esborrar el teu compte</strong> des de la mateixa app (elimina les teves dades), o escriure a{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.
        També pots reclamar davant l'Agència Espanyola de Protecció de Dades (AEPD).
      </p>
      <p>
        <strong>Emmagatzematge al teu navegador:</strong> <strong>no fem servir cookies</strong>. Desem al teu propi
        dispositiu: el <em>token de sessió</em> (per mantenir-te identificat), les teves preferències (idioma, tema clar/fosc,
        avisos ja llegits), el codi del cartell pel qual vas arribar i, si afegeixes alguna cosa <strong>sense cobertura</strong>,
        la teva aportació i la foto en una cua local fins que hi hagi xarxa. Tot això es queda al teu dispositiu i pots
        esborrar-ho buidant les dades del lloc al navegador.
      </p>
      <p>
        <strong>Analítica:</strong> fem servir <a href="https://www.cloudflare.com/web-analytics/" target="_blank" rel="noreferrer">Cloudflare Web Analytics</a>,
        que mesura visites de forma <strong>agregada, sense cookies i sense identificar-te</strong>; per això no et demanem
        consentiment. No fem servir Google Analytics ni cap xarxa publicitària, i no venem ni cedim dades a ningú.
      </p>
      <p><strong>Qui tracta dades per encàrrec nostre:</strong></p>
      <ul>
        <li><strong>Fly.io</strong> (servidor) i <strong>Neon</strong> (base de dades PostgreSQL).</li>
        <li><strong>Cloudflare</strong>: web i CDN, analítica agregada i emmagatzematge de les fotos (R2).</li>
        <li><strong>Resend</strong>: enviament dels correus (rep la teva adreça i el contingut del missatge).</li>
        <li><strong>ip-api.com</strong>: només en el moment de registrar-te, per deduir el país i la regió. <strong>Rep la teva IP</strong>, que nosaltres no desem enlloc.</li>
      </ul>

      <h2>Dades cartogràfiques</h2>
      <p>
        El mapa base i les dades de fonts provenen d'{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>,
        © col·laboradors d'OpenStreetMap, sota llicència{' '}
        <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.
        {' '}Part de les fonts provenen de l'<a href="https://www.icgc.cat" target="_blank" rel="noreferrer">ICGC</a> i
        l'ACA, sota llicència <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.
      </p>
    </>
  )
}

function LegalES() {
  return (
    <>
      <h1>Aviso legal y privacidad</h1>

      <h2>⚠️ Advertencia sobre el agua y responsabilidad</h2>
      <p className="stale-warn">
        FontApp es un servicio de información <strong>colaborativa</strong>: las fuentes, el estado del agua y la potabilidad
        los aportan las personas usuarias y fuentes de datos abiertas, y pueden estar <strong>desactualizados, incompletos o ser incorrectos</strong>.
        La información es <strong>meramente orientativa</strong> y no sustituye un análisis oficial del agua. FontApp <strong>no garantiza</strong> la
        potabilidad ni la salubridad del agua de ninguna fuente. Beber agua de las fuentes que aparecen queda
        <strong> bajo el criterio y el riesgo exclusivo de la persona usuaria</strong>. En caso de duda, no bebas o trata el agua (hiérvela o depúrala).
        Ni FontApp ni su responsable se hacen responsables de ningún daño derivado del uso de esta información.
      </p>

      <h2>Aviso legal</h2>
      <p>
        Responsable de este sitio: <strong>Miguel Cabrera</strong>. Contacto:{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>. El uso del servicio implica la aceptación de estas condiciones.
        El contenido publicado por los usuarios (fuentes, reseñas, fotos, incidencias) es responsabilidad de quien lo publica.
      </p>

      <h2>Privacidad (RGPD)</h2>
      <p><strong>Responsable del tratamiento:</strong> Miguel Cabrera, <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.</p>
      <p><strong>Qué datos tratamos:</strong></p>
      <ul>
        <li>Tu <strong>nombre de usuario y nombre</strong>, tu <strong>dirección de correo</strong> y tu <strong>contraseña</strong> (almacenada cifrada con bcrypt, nunca en claro).</li>
        <li>El <strong>contenido que publicas</strong>: fuentes, reseñas, valoraciones, fotos e incidencias.</li>
        <li>Tu <strong>ubicación precisa</strong> solo se usa, si tú lo autorizas, para mostrarte fuentes cercanas; <strong>no se almacena</strong> en el servidor.</li>
        <li>Al <strong>registrarte</strong> guardamos tu <strong>región aproximada</strong> (país/región deducidos de la IP, <strong>no la IP</strong>) y el <strong>idioma</strong> de la interfaz, para estadística de uso y para escribirte en tu lengua.</li>
        <li>Si llegas desde un <strong>cartel o una campaña</strong> con código (<code>fontapp.net/?p=castellcir</code>), guardamos ese código con el alta para saber qué cartel funciona. No identifica a ninguna persona.</li>
      </ul>
      <p><strong>Para qué usamos tu correo:</strong></p>
      <ul>
        <li>Mensajes necesarios del servicio: bienvenida y recuperación de contraseña.</li>
        <li>Un <strong>resumen semanal</strong> de novedades en las fuentes que has añadido o donde has participado. Puedes desactivarlo cuando quieras desde tu perfil o con el enlace de baja que lleva cada correo, sin iniciar sesión.</li>
      </ul>
      <p>
        <strong>Finalidad y base legal:</strong> prestar el servicio que solicitas (ejecución) y el consentimiento que otorgas al registrarte.
        <strong> Conservación:</strong> mientras mantengas la cuenta.
      </p>
      <p>
        <strong>Tus derechos:</strong> acceso, rectificación, supresión, portabilidad, limitación y oposición.
        Puedes <strong>borrar tu cuenta</strong> desde la propia app (elimina tus datos), o escribir a{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.
        También puedes reclamar ante la Agencia Española de Protección de Datos (AEPD).
      </p>
      <p>
        <strong>Almacenamiento en tu navegador:</strong> <strong>no usamos cookies</strong>. Guardamos en tu propio
        dispositivo: el <em>token de sesión</em> (para mantenerte identificado), tus preferencias (idioma, tema claro/oscuro,
        avisos ya leídos), el código del cartel por el que llegaste y, si añades algo <strong>sin cobertura</strong>,
        tu aportación y la foto en una cola local hasta que haya red. Todo eso se queda en tu dispositivo y puedes
        borrarlo vaciando los datos del sitio en el navegador.
      </p>
      <p>
        <strong>Analítica:</strong> usamos <a href="https://www.cloudflare.com/web-analytics/" target="_blank" rel="noreferrer">Cloudflare Web Analytics</a>,
        que mide visitas de forma <strong>agregada, sin cookies y sin identificarte</strong>; por eso no te pedimos
        consentimiento. No usamos Google Analytics ni ninguna red publicitaria, y no vendemos ni cedemos datos a nadie.
      </p>
      <p><strong>Quién trata datos por encargo nuestro:</strong></p>
      <ul>
        <li><strong>Fly.io</strong> (servidor) y <strong>Neon</strong> (base de datos PostgreSQL).</li>
        <li><strong>Cloudflare</strong>: web y CDN, analítica agregada y almacenamiento de las fotos (R2).</li>
        <li><strong>Resend</strong>: envío de los correos (recibe tu dirección y el contenido del mensaje).</li>
        <li><strong>ip-api.com</strong>: solo en el momento de registrarte, para deducir el país y la región. <strong>Recibe tu IP</strong>, que nosotros no guardamos en ningún sitio.</li>
      </ul>

      <h2>Datos cartográficos</h2>
      <p>
        El mapa base y los datos de fuentes proceden de{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>,
        © colaboradores de OpenStreetMap, bajo licencia{' '}
        <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.
        {' '}Parte de las fuentes provienen del <a href="https://www.icgc.cat" target="_blank" rel="noreferrer">ICGC</a> y
        la ACA, bajo licencia <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.
      </p>
    </>
  )
}

function LegalEN() {
  return (
    <>
      <h1>Legal notice & privacy</h1>

      <h2>⚠️ Water safety & liability disclaimer</h2>
      <p className="stale-warn">
        FontApp is a <strong>collaborative</strong> information service: fountains, water status and potability are contributed
        by users and open data sources, and may be <strong>outdated, incomplete or incorrect</strong>.
        The information is <strong>indicative only</strong> and does not replace an official water analysis. FontApp <strong>does not guarantee</strong> the
        potability or safety of the water at any fountain. Drinking water from the fountains listed here is
        <strong> at the user's sole discretion and risk</strong>. When in doubt, do not drink, or treat the water (boil or purify it).
        Neither FontApp nor its owner is liable for any harm arising from the use of this information.
      </p>

      <h2>Legal notice</h2>
      <p>
        Owner of this site: <strong>Miguel Cabrera</strong>. Contact:{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>. Using the service implies acceptance of these terms.
        Content published by users (fountains, reviews, photos, issues) is the responsibility of whoever posts it.
      </p>

      <h2>Privacy (GDPR)</h2>
      <p><strong>Data controller:</strong> Miguel Cabrera, <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.</p>
      <p><strong>What data we process:</strong></p>
      <ul>
        <li>Your <strong>username and name</strong>, your <strong>email address</strong> and your <strong>password</strong> (stored hashed with bcrypt, never in clear text).</li>
        <li>The <strong>content you publish</strong>: fountains, reviews, ratings, photos and issues.</li>
        <li>Your <strong>location</strong> is only used, if you allow it, to show you nearby fountains; it is <strong>not stored</strong> on the server.</li>
        <li>When you <strong>sign up</strong> we store your <strong>approximate region</strong> (country/region derived from your IP — <strong>not the IP</strong>) and your interface <strong>language</strong>, for usage statistics and to write to you in your language.</li>
        <li>If you arrive from a <strong>poster or campaign</strong> carrying a code (<code>fontapp.net/?p=castellcir</code>), we store that code with your sign-up to learn which poster works. It identifies no one.</li>
      </ul>
      <p><strong>What we use your email for:</strong></p>
      <ul>
        <li>Service messages: welcome and password recovery.</li>
        <li>A <strong>weekly round-up</strong> of activity on the fountains you added or took part in. You can turn it off any time from your profile, or with the unsubscribe link in every email — no sign-in needed.</li>
      </ul>
      <p>
        <strong>Purpose and legal basis:</strong> to provide the service you request (performance) and the consent you give when signing up.
        <strong> Retention:</strong> as long as you keep your account.
      </p>
      <p>
        <strong>Your rights:</strong> access, rectification, erasure, portability, restriction and objection.
        You can <strong>delete your account</strong> from within the app (it removes your data), or write to{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.
        You may also complain to your data protection authority.
      </p>
      <p>
        <strong>Storage in your browser:</strong> <strong>we use no cookies</strong>. We keep on your own device: the
        <em> session token</em> (to keep you signed in), your preferences (language, light/dark theme, notices already seen),
        the poster code you arrived with and, if you add something <strong>with no signal</strong>, your contribution and its
        photo in a local queue until the network is back. All of it stays on your device and you can clear it by deleting
        the site data in your browser.
      </p>
      <p>
        <strong>Analytics:</strong> we use <a href="https://www.cloudflare.com/web-analytics/" target="_blank" rel="noreferrer">Cloudflare Web Analytics</a>,
        which measures visits in <strong>aggregate, without cookies and without identifying you</strong> — which is why we
        ask for no consent. We use no Google Analytics and no ad network, and we neither sell nor share your data.
      </p>
      <p><strong>Processors acting on our behalf:</strong></p>
      <ul>
        <li><strong>Fly.io</strong> (server) and <strong>Neon</strong> (PostgreSQL database).</li>
        <li><strong>Cloudflare</strong>: web and CDN, aggregate analytics and photo storage (R2).</li>
        <li><strong>Resend</strong>: email delivery (receives your address and the message content).</li>
        <li><strong>ip-api.com</strong>: only at sign-up, to derive country and region. <strong>It receives your IP</strong>, which we store nowhere.</li>
      </ul>

      <h2>Map data</h2>
      <p>
        The base map and fountain data come from{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>,
        © OpenStreetMap contributors, under the{' '}
        <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a> licence.
        {' '}Some fountains come from the <a href="https://www.icgc.cat" target="_blank" rel="noreferrer">ICGC</a> and
        ACA, under the <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> licence.
      </p>
    </>
  )
}
