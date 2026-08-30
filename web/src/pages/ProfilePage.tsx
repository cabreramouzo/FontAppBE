import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Chip from '@mui/material/Chip'
import Avatar from '@mui/material/Avatar'
import ListItem from '@mui/material/ListItem'
import SettingsIcon from '@mui/icons-material/SettingsOutlined'
import ShieldIcon from '@mui/icons-material/GppMaybeOutlined'
import type { Font, MyComment } from '../api/types'
import { getMyComments, getMyFavorites, getMyFonts } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { waterStatusInfo } from '../lib/waterStatus'
import { timeAgo } from '../lib/time'
import { canModerate } from '../lib/roles'
import { GamificationCard } from '../components/GamificationCard'
import { GuardedFonts } from '../components/GuardedFonts'
import { TextoLargo } from '../components/TextoLargo'
import { ListaConTope } from '../components/ListaConTope'
import { FilaDeFuente } from '../components/FilaDeFuente'
import { TituloDeSeccion } from '../components/TituloDeSeccion'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlineOutlined'
import { nombreFuente, rotulo } from '../lib/fontName'

/**
 * Tu perfil: **lo tuyo**, y nada de lo que se toca.
 *
 * Los ajustes viven en `/me/settings` desde que se partió esta pantalla. Antes salían
 * aquí en TRES islas separadas por contenido —privacidad y avisos arriba, el interruptor
 * del nivel en medio, la zona de peligro al final— y esa alternancia, no la cantidad de
 * información, es lo que se leía como caos. Medido con una cuenta con datos de verdad
 * (21 favoritas, 12 fuentes, 8 reseñas): 4.082 px en escritorio y 4.749 en móvil, y las
 * favoritas no empezaban hasta 1.458 y 1.613 px respectivamente. O sea, dos pantallas de
 * interruptores por delante de aquello a lo que vienes.
 *
 * La regla del reparto es la misma que decide qué baja a la tab bar: **un sitio donde se
 * está frente a una cosa que se hace.**
 */
export function ProfilePage() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const [fonts, setFonts] = useState<Font[] | null>(null)
  const [favorites, setFavorites] = useState<Font[] | null>(null)
  const [comments, setComments] = useState<MyComment[] | null>(null)

  useEffect(() => {
    if (loading) return // esperamos a que se restaure la sesión antes de decidir
    if (!user) {
      window.location.replace('/login')
      return
    }
    getMyFonts().then(setFonts).catch(() => setFonts([]))
    getMyFavorites().then(setFavorites).catch(() => setFavorites([]))
    getMyComments().then(setComments).catch(() => setComments([]))
  }, [user, loading])

  if (loading) return null
  if (!user) return null

  return (
    // 720 mientras es una columna y 1.180 desde `md`, igual que la ficha de fuente: el
    // ancho lo decide lo que contiene, y esto son tarjetas y listas, no prosa.
    <Box className="pad profile" sx={{ maxWidth: { xs: 720, md: 1180 }, mx: 'auto' }}>
      <Link component={RouterLink} to="/">{t('detail.backMap')}</Link>
      <Typography variant="h4" sx={{ my: 1, fontWeight: 800 }}>{t('nav.profile')}</Typography>

      {/* Dos columnas en escritorio: **quién eres y qué estás haciendo** a la izquierda
          —identidad, accesos, tu marcador y las fuentes que cuidas—, y **tus cosas** a la
          derecha —favoritas, tus fuentes, tus reseñas—. La izquierda es el resumen y lo
          accionable; la derecha, el archivo.
          El orden en que colapsa en móvil es exactamente el que ya tenía la página, así
          que aquí no hace falta el truco de pintar algo en uno de los dos huecos: partir
          una página en dos reordena el móvil solo, y eso ya nos costó un arreglo en la
          ficha de fuente. Comprobado midiendo el orden de los títulos. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 5fr) minmax(0, 7fr)' },
          gap: { xs: 0, md: 4 },
          alignItems: 'start',
        }}
      >
      <Box>
      <Box
        component="section"
        sx={{ mb: 3, p: 2, border: 1, borderColor: 'divider', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}
      >
        <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56, fontSize: 22 }}>{initials(user.name)}</Avatar>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{user.name}</Typography>
          <Typography color="text.secondary">@{user.username}</Typography>
          {user.email && <Typography variant="body2" color="text.secondary" noWrap>{user.email}</Typography>}
        </Box>
      </Box>

      {/* La puerta a lo que se toca. Va aquí arriba, pegada a la identidad, porque es lo
          que sustituye a las tres islas de interruptores: si no se ve de entrada, partir
          la pantalla no habría arreglado nada — habría escondido los ajustes. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
        <Button component={RouterLink} to="/me/settings" variant="outlined" startIcon={<SettingsIcon />}>
          {t('settings.title')}
        </Button>
        <Button component={RouterLink} to={`/users/${encodeURIComponent(user.username)}`} variant="outlined">
          {t('privacy.viewPublic')}
        </Button>
        {canModerate(user) && (
          <Button component={RouterLink} to="/admin" variant="outlined" startIcon={<ShieldIcon />}>
            {t('admin.title')}
          </Button>
        )}
      </Box>

      {!user.gamificationOptOut && <GamificationCard />}

      {/* Va después del marcador: es lo accionable de esta pantalla. Y **no** depende de
          `gamificationOptOut` — cuidar una fuente no es puntuar, y quien apagó los puntos
          sigue queriendo saber qué se le está quedando viejo. */}
      <GuardedFonts />
      </Box>

      <Box>
      <Box component="section" sx={{ mb: 3 }}>
        {/* La estrella y no un marcapáginas: es la misma con la que se marca una fuente
            en su ficha, así que el rótulo y el gesto se reconocen el uno al otro. */}
        <TituloDeSeccion icono={<StarBorderIcon fontSize="small" />}>{t('profile.myFavorites')}</TituloDeSeccion>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('profile.myFavoritesHint')}</Typography>
        {favorites === null && <Skeleton lines={2} />}
        {favorites?.length === 0 && <Typography color="text.secondary">{t('profile.noFavorites')}</Typography>}
        {favorites && (
          <ListaConTope
            items={favorites}
            clave={(f) => f.id}
            fila={(f) => (
              <FilaDeFuente
                to={`/fonts/${f.id}`}
                source={f.source}
                primary={nombreFuente(f, t)}
                // El municipio y no el tipo: el emoji ya dice qué clase de punto es, y
                // repetirlo escrito no añade nada. Lo que falta para reconocer una fuente
                // de una lista es DÓNDE está, que es lo mismo que ya hacen los resultados
                // del buscador. `municipality` está fuera de España en nulo, así que cae
                // en la demarcación, y si tampoco hay, la fila se queda en una línea:
                // nunca se inventa un sitio.
                secondary={f.municipality ?? f.region ?? undefined}
              />
            )}
          />
        )}
      </Box>

      <Box component="section" sx={{ mb: 3 }}>
        {/* El chincheta-con-más: es literalmente lo que dice el subtítulo —«las que
            pusiste tú en el mapa»— y el mismo icono del botón de añadir una fuente. */}
        <TituloDeSeccion icono={<AddLocationAltOutlinedIcon fontSize="small" />}>{t('profile.myFonts')}</TituloDeSeccion>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('profile.myFontsHint')}</Typography>
        {fonts === null && <Skeleton lines={2} />}
        {fonts?.length === 0 && <Typography color="text.secondary">{t('profile.noFonts')}</Typography>}
        {fonts && (
          <ListaConTope
            items={fonts}
            clave={(f) => f.id}
            fila={(f) => (
              <FilaDeFuente
                to={`/fonts/${f.id}`}
                source={f.source}
                primary={nombreFuente(f, t)}
                // El municipio y no el tipo: el emoji ya dice qué clase de punto es, y
                // repetirlo escrito no añade nada. Lo que falta para reconocer una fuente
                // de una lista es DÓNDE está, que es lo mismo que ya hacen los resultados
                // del buscador. `municipality` está fuera de España en nulo, así que cae
                // en la demarcación, y si tampoco hay, la fila se queda en una línea:
                // nunca se inventa un sitio.
                secondary={f.municipality ?? f.region ?? undefined}
              />
            )}
          />
        )}
      </Box>

      <Box component="section">
        <TituloDeSeccion icono={<ChatBubbleOutlineIcon fontSize="small" />}>{t('profile.myReviews')}</TituloDeSeccion>
        {comments === null && <Skeleton lines={3} />}
        {comments?.length === 0 && <Typography color="text.secondary">{t('profile.noReviews')}</Typography>}
        {comments && (
          <ListaConTope
            items={comments}
            clave={(c) => c.id}
            fila={(c) => {
              const ws = waterStatusInfo(c.waterStatus)
              return (
                <ListItem alignItems="flex-start" sx={{ display: 'block', py: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Link component={RouterLink} to={`/fonts/${c.fontID}`} sx={{ fontWeight: 600 }}>{rotulo(c.fontName, t)}</Link>
                  {ws && <Chip size="small" label={`${ws.emoji} ${t(`status.${ws.key}`)}`} />}
                  <Typography variant="caption" color="text.secondary">· {c.createdAt ? timeAgo(c.createdAt, t) : ''}</Typography>
                </Box>
                  <TextoLargo texto={c.body} variant="body2" sx={{ mt: 0.5 }} />
                </ListItem>
              )
            }}
          />
        )}
      </Box>
      </Box>
      </Box>
    </Box>
  )
}

/// Iniciales para el avatar: primeras letras de las dos primeras palabras.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}
