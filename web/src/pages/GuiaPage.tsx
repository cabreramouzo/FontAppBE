import { useEffect } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { useI18n } from '../i18n/I18nContext'
import type { Lang } from '../i18n/dictionaries'

/**
 * Guía pública de «cómo se usa FontApp», con un ejemplo. Es una página de captación/SEO,
 * no de la app en sí: se enlaza desde el pie y se comparte. El contenido va aquí y NO en
 * los diccionarios —es prosa larga y no una etiqueta— así que no se traduce a los ocho
 * idiomas; de momento CA y ES, y el resto cae al catalán (defecto de la app). Cuando haga
 * falta otro idioma se añade su bloque, sin tocar `check:i18n`.
 */
type Seccion = { titulo: string; parrafos: string[] }
type Contenido = { titulo: string; intro: string; secciones: Seccion[]; cierre: string; verMapa: string }

const CA: Contenido = {
  titulo: 'Com funciona FontApp',
  intro:
    'FontApp diu si una font raja abans que t’hi desviïs. Ho fa la gent que hi passa: cadascú apunta si en surt aigua, si en surt poca o si està seca, i el següent ja ho sap. Aquí tens com fer-la servir en un minut.',
  secciones: [
    {
      titulo: '1. Trobar aigua a prop teu',
      parrafos: [
        'Obre el mapa i deixa que et situï. Cada xinxeta és una font, i el color diu com està l’aigua: verd si raja, groc si en surt poca, vermell si està seca i blau si encara no ho ha comprovat ningú. Toca’n una i veuràs l’últim que se’n va dir i quan.',
      ],
    },
    {
      titulo: '2. Dir com està una font (el gest que ho sosté tot)',
      parrafos: [
        'És el més important i costa un toc. Des del globus del mapa o des de la fitxa, digues si raja, si en surt poca o si està seca. Amb això el color canvia per a tothom i el següent excursionista ho sap abans de desviar-se. Si algú ja ho havia dit i segueix igual, pots confirmar-ho amb un toc en comptes de repetir-ho.',
        'Mirar no demana res; per aportar, un compte de mig minut. I funciona fins i tot sense cobertura: es guarda al mòbil i s’envia sol quan torna la xarxa —que és justament on ets quan tens una font davant, al mig del no-res.',
      ],
    },
    {
      titulo: '3. Aigua a la teva ruta',
      parrafos: [
        'Aquí és on la cosa canvia. Si planifiques rutes (Wikiloc, Strava, Komoot…), puja el teu GPX a «Aigua a la meva ruta» i FontApp et diu quines fonts hi ha pel camí, en quin quilòmetre i a quina distància del traçat. El fitxer no surt del teu mòbil.',
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
}

const ES: Contenido = {
  titulo: 'Cómo funciona FontApp',
  intro:
    'FontApp te dice si una fuente mana antes de que te desvíes. Lo hace la gente que pasa: cada uno apunta si sale agua, si sale poca o si está seca, y el siguiente ya lo sabe. Aquí tienes cómo usarla en un minuto.',
  secciones: [
    {
      titulo: '1. Encontrar agua cerca de ti',
      parrafos: [
        'Abre el mapa y deja que te sitúe. Cada chincheta es una fuente, y el color dice cómo está el agua: verde si mana, amarillo si sale poca, rojo si está seca y azul si aún no lo ha comprobado nadie. Toca una y verás lo último que se dijo y cuándo.',
      ],
    },
    {
      titulo: '2. Decir cómo está una fuente (el gesto que lo sostiene todo)',
      parrafos: [
        'Es lo más importante y cuesta un toque. Desde el globo del mapa o desde la ficha, di si mana, si sale poca o si está seca. Con eso el color cambia para todo el mundo y el siguiente excursionista lo sabe antes de desviarse. Si alguien ya lo había dicho y sigue igual, puedes confirmarlo con un toque en vez de repetirlo.',
        'Mirar no pide nada; para aportar, una cuenta de medio minuto. Y funciona incluso sin cobertura: se guarda en el móvil y se envía solo cuando vuelve la red —que es justo donde estás cuando tienes una fuente delante, en mitad de la nada.',
      ],
    },
    {
      titulo: '3. Agua en tu ruta',
      parrafos: [
        'Aquí es donde la cosa cambia. Si planificas rutas (Wikiloc, Strava, Komoot…), sube tu GPX a «Agua en mi ruta» y FontApp te dice qué fuentes hay por el camino, en qué kilómetro y a qué distancia del trazado. El archivo no sale de tu móvil.',
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
}

const POR_IDIOMA: Partial<Record<Lang, Contenido>> = { ca: CA, es: ES }

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
        </Box>
      ))}

      <Typography sx={{ mb: 3, lineHeight: 1.6 }}>{c.cierre}</Typography>

      <Button component={RouterLink} to="/" variant="contained" disableElevation size="large">
        {c.verMapa}
      </Button>
    </Box>
  )
}
