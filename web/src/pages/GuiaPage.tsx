import { useEffect } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { useI18n } from '../i18n/I18nContext'
import type { Lang } from '../i18n/dictionaries'
import { WATER_STATUS, NO_STATUS_COLOR } from '../lib/waterStatus'

/**
 * Guía pública de «cómo se usa FontApp», con un ejemplo. Es una página de captación/SEO,
 * no de la app en sí: se enlaza desde el pie y se comparte. El contenido va aquí y NO en
 * los diccionarios —es prosa larga y no una etiqueta— así que no se traduce a los ocho
 * idiomas; de momento CA y ES, y el resto cae al catalán (defecto de la app). Cuando haga
 * falta otro idioma se añade su bloque, sin tocar `check:i18n`.
 *
 * ## Las ilustraciones son esquemáticas a propósito, NO capturas de pantalla
 *
 * Una captura de la app se queda vieja en silencio —un botón que se mueve o se renombra y
 * la guía enseña algo que ya no existe—, sería **por idioma** (la interfaz se ve en el
 * idioma del lector) y pesaría. Justo lo que el resto del repo evita. En cambio los 4
 * colores de pin y el gesto de los tres estados son dominio estable y documentado, así que
 * se dibujan con los colores y emojis **reales** (`waterStatus.ts`): si algún día cambian,
 * cambian aquí también porque salen de la misma fuente. La flecha apunta al control.
 */
type Ilustra = 'pins' | 'chips' | 'gpx'
type Seccion = { titulo: string; parrafos: string[]; ilustra?: Ilustra }
type Ui = {
  pins: { flowing: string; trickle: string; dry: string; unknown: string }
  fuenteEjemplo: string
  chips: { flowing: string; trickle: string; dry: string }
  pista: string
  gpx: string
  enElMapa: string
}
type Contenido = { titulo: string; intro: string; secciones: Seccion[]; cierre: string; verMapa: string; ui: Ui }

const CA: Contenido = {
  titulo: 'Com funciona FontApp',
  intro:
    'FontApp diu si una font raja abans que t’hi desviïs. Ho fa la gent que hi passa: cadascú apunta si en surt aigua, si en surt poca o si està seca, i el següent ja ho sap. Aquí tens com fer-la servir en un minut.',
  secciones: [
    {
      titulo: '1. Trobar aigua a prop teu',
      ilustra: 'pins',
      parrafos: [
        'Obre el mapa i deixa que et situï. Cada xinxeta és una font, i el color diu com està l’aigua: verd si raja, groc si en surt poca, vermell si està seca i blau si encara no ho ha comprovat ningú. Toca’n una i veuràs l’últim que se’n va dir i quan.',
      ],
    },
    {
      titulo: '2. Dir com està una font (el gest que ho sosté tot)',
      ilustra: 'chips',
      parrafos: [
        'És el més important i costa un toc. Des del globus del mapa o des de la fitxa, digues si raja, si en surt poca o si està seca. Amb això el color canvia per a tothom i el següent excursionista ho sap abans de desviar-se. Si algú ja ho havia dit i segueix igual, pots confirmar-ho amb un toc en comptes de repetir-ho.',
        'Mirar no demana res; per aportar, un compte de mig minut. I funciona fins i tot sense cobertura: es guarda al mòbil i s’envia sol quan torna la xarxa —que és justament on ets quan tens una font davant, al mig del no-res.',
      ],
    },
    {
      titulo: '3. Aigua a la teva ruta',
      ilustra: 'gpx',
      parrafos: [
        'Aquí és on la cosa canvia. Si planifiques rutes (Wikiloc, Strava, Komoot…), obre «Aigua a la meva ruta» (el botó GPX del mapa) i tria el teu fitxer: FontApp et diu quines fonts hi ha pel camí, en quin quilòmetre i a quina distància del traçat. El fitxer no surt del teu mòbil.',
        'I el que de veritat decideix si portes un bidó o dos: el tram més llarg sense aigua. Exemple real d’una ruta de 14 km per Barcelona —167 fonts pel camí, però cap comprovada recentment—: el tram sec de debò no són 2 km, són els 14, tota la ruta. Això ho vols saber abans de sortir, no a mig camí.',
        'Pots baixar les fonts al teu GPS (Garmin) i, en tornar, dir com estaven amb un toc: així la ruta que has fet ajuda el següent.',
      ],
    },
    {
      titulo: '4. Emporta-te-la a la muntanya',
      parrafos: [
        'Abans de sortir, guarda la zona i el mapa i les fonts funcionen sense cobertura. Instal·la-la a la pantalla d’inici perquè s’obri com una app i no hagis de buscar-la al navegador.',
      ],
    },
  ],
  cierre:
    'És gratuïta i col·laborativa: com més gent digui com està l’aigua, més serveix a tothom. Si te la fas teva, passa-la a qui fa rutes —és així com creix.',
  verMapa: 'Obre el mapa',
  ui: {
    pins: { flowing: 'raja', trickle: 'poca', dry: 'seca', unknown: 'sense comprovar' },
    fuenteEjemplo: 'Font de la Vall',
    chips: { flowing: 'Raja', trickle: 'Poca', dry: 'Seca' },
    pista: 'toca com està',
    gpx: 'Tria un fitxer GPX',
    enElMapa: 'al mapa',
  },
}

const ES: Contenido = {
  titulo: 'Cómo funciona FontApp',
  intro:
    'FontApp te dice si una fuente mana antes de que te desvíes. Lo hace la gente que pasa: cada uno apunta si sale agua, si sale poca o si está seca, y el siguiente ya lo sabe. Aquí tienes cómo usarla en un minuto.',
  secciones: [
    {
      titulo: '1. Encontrar agua cerca de ti',
      ilustra: 'pins',
      parrafos: [
        'Abre el mapa y deja que te sitúe. Cada chincheta es una fuente, y el color dice cómo está el agua: verde si mana, amarillo si sale poca, rojo si está seca y azul si aún no lo ha comprobado nadie. Toca una y verás lo último que se dijo y cuándo.',
      ],
    },
    {
      titulo: '2. Decir cómo está una fuente (el gesto que lo sostiene todo)',
      ilustra: 'chips',
      parrafos: [
        'Es lo más importante y cuesta un toque. Desde el globo del mapa o desde la ficha, di si mana, si sale poca o si está seca. Con eso el color cambia para todo el mundo y el siguiente excursionista lo sabe antes de desviarse. Si alguien ya lo había dicho y sigue igual, puedes confirmarlo con un toque en vez de repetirlo.',
        'Mirar no pide nada; para aportar, una cuenta de medio minuto. Y funciona incluso sin cobertura: se guarda en el móvil y se envía solo cuando vuelve la red —que es justo donde estás cuando tienes una fuente delante, en mitad de la nada.',
      ],
    },
    {
      titulo: '3. Agua en tu ruta',
      ilustra: 'gpx',
      parrafos: [
        'Aquí es donde la cosa cambia. Si planificas rutas (Wikiloc, Strava, Komoot…), abre «Agua en mi ruta» (el botón GPX del mapa) y elige tu archivo: FontApp te dice qué fuentes hay por el camino, en qué kilómetro y a qué distancia del trazado. El archivo no sale de tu móvil.',
        'Y lo que de verdad decide si llevas un bidón o dos: el tramo más largo sin agua. Ejemplo real de una ruta de 14 km por Barcelona —167 fuentes por el camino, pero ninguna comprobada recientemente—: el tramo seco de verdad no son 2 km, son los 14, toda la ruta. Eso lo quieres saber antes de salir, no a medio camino.',
        'Puedes bajarte las fuentes a tu GPS (Garmin) y, al volver, decir cómo estaban con un toque: así la ruta que has hecho ayuda al siguiente.',
      ],
    },
    {
      titulo: '4. Llévatela al monte',
      parrafos: [
        'Antes de salir, guarda la zona y el mapa y las fuentes funcionan sin cobertura. Instálala en la pantalla de inicio para que se abra como una app y no tengas que buscarla en el navegador.',
      ],
    },
  ],
  cierre:
    'Es gratuita y colaborativa: cuanta más gente diga cómo está el agua, más sirve a todo el mundo. Si te la haces tuya, pásasela a quien hace rutas —es así como crece.',
  verMapa: 'Abre el mapa',
  ui: {
    pins: { flowing: 'mana', trickle: 'poca', dry: 'seca', unknown: 'sin comprobar' },
    fuenteEjemplo: 'Fuente del Valle',
    chips: { flowing: 'Mana', trickle: 'Poca', dry: 'Seca' },
    pista: 'toca cómo está',
    gpx: 'Elegir un fichero GPX',
    enElMapa: 'en el mapa',
  },
}

const POR_IDIOMA: Partial<Record<Lang, Contenido>> = { ca: CA, es: ES }

/** La gota coloreada del pin del mapa, a escala pequeña para la leyenda. */
function Pin({ color }: { color: string }) {
  return (
    <svg width={22} height={32} viewBox="0 0 26 38" aria-hidden style={{ display: 'block' }}>
      <path d="M13 0C5.8 0 0 5.8 0 13c0 9.7 13 25 13 25s13-15.3 13-25C26 5.8 20.2 0 13 0z" fill={color} stroke="white" strokeWidth={1.5} />
      <circle cx="13" cy="13" r="4.5" fill="white" />
    </svg>
  )
}

/** Flecha corta que sube hacia la derecha, para clavar la punta en el control de arriba. */
function Flecha() {
  return (
    <svg width={46} height={32} viewBox="0 0 46 32" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
      <path d="M5 29 C 11 16, 24 10, 38 9" />
      <path d="M31 6 L39 8.5 L34 16" />
    </svg>
  )
}

/** Número de paso, un círculo pequeño con el dígito. */
function Paso({ n }: { n: number }) {
  return (
    <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
      {n}
    </Box>
  )
}

function Ilustracion({ tipo, ui }: { tipo: Ilustra; ui: Ui }) {
  if (tipo === 'pins') {
    const filas = [
      { color: WATER_STATUS.flowing.color, l: ui.pins.flowing },
      { color: WATER_STATUS.trickle.color, l: ui.pins.trickle },
      { color: WATER_STATUS.dry.color, l: ui.pins.dry },
      { color: NO_STATUS_COLOR, l: ui.pins.unknown },
    ]
    return (
      <Box sx={{ my: 2, display: 'flex', gap: 2.5, flexWrap: 'wrap' }}>
        {filas.map((f) => (
          <Box key={f.l} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            <Pin color={f.color} />
            <Typography variant="caption" color="text.secondary">{f.l}</Typography>
          </Box>
        ))}
      </Box>
    )
  }

  if (tipo === 'chips') {
    // Cada chip con el color de su estado (verde/ámbar/rojo), igual que los chips reales
    // del globo: el color sale de `waterStatus`, la misma fuente que pinta los pines.
    const chips = [
      { emoji: WATER_STATUS.flowing.emoji, l: ui.chips.flowing, color: WATER_STATUS.flowing.color },
      { emoji: WATER_STATUS.trickle.emoji, l: ui.chips.trickle, color: WATER_STATUS.trickle.color },
      { emoji: WATER_STATUS.dry.emoji, l: ui.chips.dry, color: WATER_STATUS.dry.color },
    ]
    return (
      <Box sx={{ my: 2 }}>
        {/* Un globo del mapa esquemático: nombre de la fuente y los tres chips debajo. */}
        <Box sx={{ display: 'inline-block', maxWidth: 320, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', boxShadow: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>📍 {ui.fuenteEjemplo}</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {chips.map((c) => (
              <Box key={c.l} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.25, py: 0.5, borderRadius: 999, border: '1.5px solid', borderColor: c.color, bgcolor: 'background.paper', fontSize: 14, fontWeight: 600 }}>
                <span aria-hidden>{c.emoji}</span>{c.l}
              </Box>
            ))}
          </Box>
        </Box>
        {/* La flecha sube desde la esquina inferior izquierda del globo y clava la punta en
            el PRIMER chip (el estado más común). El `ml` deja la punta bajo su centro sin
            depender del ancho exacto de la etiqueta; la pista va a su derecha. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'primary.main', mt: 0.25, ml: 1 }}>
          <Flecha />
          <Typography variant="caption" sx={{ fontWeight: 700 }}>{ui.pista}</Typography>
        </Box>
      </Box>
    )
  }

  // gpx: los DOS botones reales que se tocan, en orden, porque el primero cuesta de
  // encontrar (lo reportó un usuario: no está a la vista, está en el botón «GPX» del
  // mapa). Se reproducen fieles —el FAB redondo blanco con «GPX» en azul y el botón azul
  // «Elegir un fichero GPX» (`gpxIn.pick`)— en vez de una captura, que se quedaría vieja.
  return (
    <Box sx={{ my: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
        <Paso n={1} />
        {/* El botón «GPX» del mapa: un FAB redondo, fondo del papel y letras en azul. */}
        <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: 'background.paper', color: 'primary.main', boxShadow: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, letterSpacing: '0.5px' }}>
          GPX
        </Box>
        <Typography variant="caption" color="text.secondary">{ui.enElMapa}</Typography>
      </Box>
      <Box aria-hidden sx={{ color: 'text.disabled', fontSize: 24, lineHeight: 1, alignSelf: 'center', mt: -1.5 }}>›</Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
        <Paso n={2} />
        {/* El botón real de «Agua en mi ruta»: azul, con icono de subir y el rótulo pick. */}
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderRadius: 1, bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700, fontSize: 14, boxShadow: 2 }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 16 V4" />
            <path d="M7 9 L12 4 L17 9" />
            <path d="M5 20 H19" />
          </svg>
          {ui.gpx}
        </Box>
      </Box>
    </Box>
  )
}

export function GuiaPage() {
  const { lang } = useI18n()
  const c = POR_IDIOMA[lang] ?? CA

  useEffect(() => {
    document.title = `${c.titulo} · FontApp`
  }, [c.titulo])

  return (
    <Box className="pad" sx={{ maxWidth: 720, mx: 'auto' }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
        {c.titulo}
      </Typography>
      <Typography sx={{ fontSize: 18, color: 'text.secondary', mb: 3 }}>{c.intro}</Typography>

      {c.secciones.map((s) => (
        <Box key={s.titulo} sx={{ mb: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            {s.titulo}
          </Typography>
          {s.parrafos.map((p, i) => (
            <Typography key={i} sx={{ mb: 1.5, lineHeight: 1.6 }}>{p}</Typography>
          ))}
          {s.ilustra && <Ilustracion tipo={s.ilustra} ui={c.ui} />}
        </Box>
      ))}

      <Typography sx={{ mb: 3, lineHeight: 1.6 }}>{c.cierre}</Typography>

      <Button component={RouterLink} to="/" variant="contained" disableElevation size="large">
        {c.verMapa}
      </Button>
    </Box>
  )
}
