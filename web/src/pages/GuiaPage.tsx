import { useEffect, type ReactNode } from 'react'
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
  ruta: string
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
        'Aquí és on la cosa canvia. Si planifiques rutes (Wikiloc, Strava, Komoot…): al mapa toca el botó GPX, obre «Aigua a la meva ruta» i tria el teu fitxer. FontApp et diu quines fonts hi ha pel camí, en quin quilòmetre i a quina distància del traçat. El fitxer no surt del teu mòbil.',
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
    ruta: 'Aigua a la meva ruta',
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
        'Aquí es donde la cosa cambia. Si planificas rutas (Wikiloc, Strava, Komoot…): en el mapa toca el botón GPX, abre «Agua en mi ruta» y elige tu archivo. FontApp te dice qué fuentes hay por el camino, en qué kilómetro y a qué distancia del trazado. El archivo no sale de tu móvil.',
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
    ruta: 'Agua en mi ruta',
    gpx: 'Elegir un fichero GPX',
    enElMapa: 'en el mapa',
  },
}

const EN: Contenido = {
  titulo: 'How FontApp works',
  intro:
    'FontApp tells you whether a fountain is running before you go out of your way. The people who pass do it: each one notes whether water is flowing, trickling or dry, so the next person already knows. Here’s how to use it in a minute.',
  secciones: [
    {
      titulo: '1. Find water near you',
      ilustra: 'pins',
      parrafos: [
        'Open the map and let it locate you. Each pin is a fountain, and the colour tells you how the water is: green if it’s flowing, amber if it’s trickling, red if it’s dry, and blue if nobody has checked it yet. Tap one to see the last report and when.',
      ],
    },
    {
      titulo: '2. Say how a fountain is (the gesture that holds it all up)',
      ilustra: 'chips',
      parrafos: [
        'This is the most important part, and it takes one tap. From the map popup or the fountain page, say whether it’s flowing, trickling or dry. That changes the colour for everyone, and the next hiker knows before making a detour. If someone already said it and it’s still the same, you can confirm it with a tap instead of repeating it.',
        'Looking asks nothing; to contribute, a half-minute account. And it works even with no signal: it’s saved on your phone and sent on its own when the network is back — which is exactly where you are when a fountain is in front of you, in the middle of nowhere.',
      ],
    },
    {
      titulo: '3. Water on your route',
      ilustra: 'gpx',
      parrafos: [
        'This is where it changes. If you plan routes (Wikiloc, Strava, Komoot…): on the map tap the GPX button, open «Water on my route» and choose your file. FontApp tells you which fountains are along the way, at which kilometre and how far off the track. The file never leaves your phone.',
        'And the thing that really decides whether you carry one bottle or two: the longest stretch with no water. A real example from a 14 km route across Barcelona —167 fountains along the way, but none checked recently—: the truly dry stretch isn’t 2 km, it’s the full 14, the whole route. You want to know that before you set off, not halfway.',
        'You can download the fountains to your GPS (Garmin) and, when you’re back, say how they were with a tap: that way the route you did helps the next person.',
      ],
    },
    {
      titulo: '4. Take it to the mountains',
      parrafos: [
        'Before you go, save the area and the map and the fountains work with no signal. Install it to your home screen so it opens like an app and you don’t have to look for it in the browser.',
      ],
    },
  ],
  cierre:
    'It’s free and collaborative: the more people say how the water is, the more useful it is for everyone. If you make it yours, pass it on to whoever does routes —that’s how it grows.',
  verMapa: 'Open the map',
  ui: {
    pins: { flowing: 'flowing', trickle: 'trickle', dry: 'dry', unknown: 'unchecked' },
    fuenteEjemplo: 'Valley Spring',
    chips: { flowing: 'Flowing', trickle: 'Trickle', dry: 'Dry' },
    pista: 'tap how it is',
    ruta: 'Water on my route',
    gpx: 'Choose a GPX file',
    enElMapa: 'on the map',
  },
}

const POR_IDIOMA: Partial<Record<Lang, Contenido>> = { ca: CA, es: ES, en: EN }

/** La gota coloreada del pin del mapa, a escala pequeña para la leyenda. */
function Pin({ color }: { color: string }) {
  return (
    <svg width={22} height={32} viewBox="0 0 26 38" aria-hidden style={{ display: 'block' }}>
      <path d="M13 0C5.8 0 0 5.8 0 13c0 9.7 13 25 13 25s13-15.3 13-25C26 5.8 20.2 0 13 0z" fill={color} stroke="white" strokeWidth={1.5} />
      <circle cx="13" cy="13" r="4.5" fill="white" />
    </svg>
  )
}

/** Flecha corta y vertical: sube a los chips que tiene justo encima. */
function Flecha() {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
      <path d="M9 16 L9 5" />
      <path d="M4 9 L9 4 L14 9" />
    </svg>
  )
}

/** Número de paso, un círculo pequeño con el dígito. */
function Paso({ n }: { n: number }) {
  return (
    <Box sx={{ width: 20, height: 20, flexShrink: 0, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
      {n}
    </Box>
  )
}

/** Un botón de MUI imitado (mismos colores del tema), con el icono de subir. `contained`
 *  es el azul relleno («Elegir un fichero GPX»); si no, el `outlined` («Agua en mi ruta»). */
function BotonMock({ children, contained }: { children: ReactNode; contained?: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderRadius: 1, fontWeight: 700, fontSize: 14,
        ...(contained
          ? { bgcolor: 'primary.main', color: 'primary.contrastText', boxShadow: 2 }
          : { border: '1px solid', borderColor: 'primary.main', color: 'primary.main', bgcolor: 'background.paper' }),
      }}
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 16 V4" />
        <path d="M7 9 L12 4 L17 9" />
        <path d="M5 20 H19" />
      </svg>
      {children}
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
          {/* La pista va DENTRO del globo, pegada a los chips: fuera quedaba una flecha
              suelta separada de la tarjeta por el relleno. La flecha corta apunta hacia
              arriba, a los chips que tiene justo encima. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main', mt: 1 }}>
            <Flecha />
            <Typography variant="caption" sx={{ fontWeight: 700 }}>{ui.pista}</Typography>
          </Box>
        </Box>
      </Box>
    )
  }

  // gpx: los TRES botones reales que se tocan, en orden, porque el camino no es obvio
  // (lo reportó un usuario). En el mapa el FAB redondo «GPX» abre una hoja; ahí,
  // «Agua en mi ruta» (outlined) lleva a /gpx; y ahí, «Elegir un fichero GPX» (contained,
  // `gpxIn.pick`). Mockups fieles del tema, no capturas —que se quedan viejas y son por
  // idioma—. En columna: en móvil una fila horizontal de tres botones no cabe, y en
  // columna queda siempre centrada.
  return (
    <Box sx={{ my: 2, display: 'flex', flexDirection: 'column', gap: 1.25, width: 'fit-content', mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Paso n={1} />
        {/* El botón «GPX» del mapa: un FAB redondo, fondo del papel y letras en azul. */}
        <Box sx={{ width: 44, height: 44, flexShrink: 0, borderRadius: '50%', bgcolor: 'background.paper', color: 'primary.main', boxShadow: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, letterSpacing: '0.5px' }}>
          GPX
        </Box>
        <Typography variant="body2" color="text.secondary">{ui.enElMapa}</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Paso n={2} />
        <BotonMock>{ui.ruta}</BotonMock>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Paso n={3} />
        <BotonMock contained>{ui.gpx}</BotonMock>
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
