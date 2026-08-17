import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import { useTheme } from '@mui/material/styles'
import { useI18n } from '../i18n/I18nContext'
import { badgeArtURL, levelBadgeURL } from '../lib/levelBadges'
import { TIER_COLOR } from '../lib/tierColors'

/**
 * La insignia en grande, a pantalla completa, con brillo y respuesta al gesto.
 *
 * Es el momento de admirarla: a 26 px en la ficha de una fuente o a 88 px en la vitrina,
 * un escudo dibujado con este nivel de detalle no se ve. Aquí ocupa media pantalla, gira
 * siguiendo el dedo o el ratón, y le cruza un destello.
 *
 * ## Cómo está hecho el efecto
 *
 * Tres capas, y ninguna necesita una librería de animación:
 *
 * 1. **Inclinación 3D** (`rotateX`/`rotateY`) según dónde esté el puntero o el dedo
 *    sobre la insignia. Es lo que da la sensación de objeto físico: la medalla no se
 *    mueve de sitio, se orienta hacia ti.
 * 2. **Un destello** que barre la superficie en diagonal, en bucle lento. Va en un
 *    `::after` con `mix-blend-mode: overlay` recortado al mismo tamaño que la imagen.
 * 3. **La entrada**: aparece pequeña y girada, y se asienta. Sin rebote elástico, que
 *    envejece mal.
 *
 * ## Lo que respeta
 *
 * Con `prefers-reduced-motion` **no hay ni entrada, ni destello, ni inclinación**: la
 * insignia sale grande y quieta, que es lo que se venía a ver. Un efecto de lucimiento
 * es exactamente el tipo de movimiento que hay que poder apagar.
 *
 * El bloqueo del cuerpo mientras está abierto lo hace `Dialog` de MUI, igual que el
 * resto de modales de la app; no hay que gestionarlo aquí.
 */
/**
 * Hace que una insignia se pueda abrir en el visor, si toca.
 *
 * La vitrina también abre lo bloqueado para explicar cómo se consigue. En ese caso el
 * visor mantiene la medalla en gris: se puede entender el objetivo sin confundirlo con
 * algo ya ganado. Fuera de la vitrina, `puede` sigue permitiendo desactivar la apertura.
 *
 * Cuando sí se puede, es un `button` de verdad y no un `div` con `onClick`: así se llega
 * con el tabulador y se abre con Intro, que es lo que espera quien no usa ratón.
 *
 * Vive aquí, al lado del visor, porque lo usan la vitrina (`/me/badges`) y el marcador
 * del perfil: si se pudiera abrir en un sitio y en el otro no, el otro parecería roto.
 */
export function Abrible({ puede, nombre, onOpen, redondo = true, children }: {
  puede: boolean
  nombre: string
  onOpen: () => void
  /** Los chips no son redondos; las chapas y los escudos sí. */
  redondo?: boolean
  children: React.ReactNode
}) {
  const { t } = useI18n()
  if (!puede) return <>{children}</>
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      aria-label={t('badges.view', { name: nombre })}
      sx={{
        p: 0, border: 0, background: 'none', cursor: 'pointer', display: 'flex',
        borderRadius: redondo ? '50%' : 999,
        transition: 'transform 160ms ease',
        '&:hover': { transform: 'scale(1.06)' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 3 },
      }}
    >
      {children}
    </Box>
  )
}

export function BadgeShowcase({
  open,
  onClose,
  kind,
  badgeKey,
  tier = null,
  locked = false,
  subtitle,
}: {
  open: boolean
  onClose: () => void
  /** De qué colección sale: cambia la carpeta y el rótulo. */
  kind: 'level' | 'badge'
  badgeKey: string
  tier?: string | null
  /** La vitrina puede abrir lo pendiente para explicar cómo se consigue. */
  locked?: boolean
  /** Línea de apoyo: «Desde 800 gotas», «3 de 5»… La pone quien abre el visor. */
  subtitle?: string
}) {
  const { t } = useI18n()
  const modo = useTheme().palette.mode === 'dark' ? 'dark' : 'light'
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLDivElement>(null)

  const quieto =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  // Al cerrar, la inclinación vuelve a cero: si no, la próxima vez que se abra la
  // insignia aparece torcida con el ángulo que dejó el dedo la vez anterior.
  useEffect(() => {
    if (!open) setTilt({ x: 0, y: 0 })
  }, [open])

  const url = kind === 'level' ? levelBadgeURL(badgeKey) : badgeArtURL(badgeKey)
  const nombre = t(kind === 'level' ? `game.level.${badgeKey}` : `game.badge.${badgeKey}`)
  const aro = tier && tier !== 'unique' ? TIER_COLOR[modo][tier] : null

  // Qué es y por qué se tiene. `t()` devuelve la clave cruda cuando falta la traducción,
  // así que una familia nueva sin descripción enseñaría `game.badgeAbout.loQueSea` en
  // mitad del diálogo. Mejor no pintar el párrafo que pintar el nombre de una variable.
  // Un nivel que todavía no has alcanzado se explica al revés que uno ganado: no «de
  // dónde salió» sino «qué falta». Las familias no lo necesitan porque su texto ya está
  // escrito en infinitivo («Por poner fuentes nuevas…»), que sirve para las dos caras.
  const claveExplicacion = kind === 'level'
    ? (locked ? 'game.levelAboutLocked' : 'game.levelAbout')
    : `game.badgeAbout.${badgeKey}`
  const traducida = t(claveExplicacion)
  const explicacion = traducida === claveExplicacion ? null : traducida

  /** Inclina la medalla hacia el punto tocado, con el centro como reposo. */
  function mover(clientX: number, clientY: number) {
    if (quieto) return
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    // −0.5…0.5 desde el centro. El tope de 14° está medido a ojo: más y la insignia
    // parece que se cae, menos y no se nota que responde.
    const dx = (clientX - r.left) / r.width - 0.5
    const dy = (clientY - r.top) / r.height - 0.5
    setTilt({ x: -dy * 28, y: dx * 28 })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: {
            bgcolor: 'transparent', boxShadow: 'none', overflow: 'visible',
            backgroundImage: 'none', m: 2,
          },
        },
        // Un fondo bastante opaco: la gracia es que no compita nada con la medalla.
        backdrop: { sx: { backgroundColor: 'rgba(0,0,0,0.86)', backdropFilter: 'blur(3px)' } },
      }}
    >
      <Box sx={{ position: 'relative', textAlign: 'center', px: 2, pb: 3 }}>
        <IconButton
          onClick={onClose}
          aria-label={t('waterHelp.close')}
          sx={{ position: 'absolute', top: -8, right: -8, color: 'common.white' }}
        >
          <CloseIcon />
        </IconButton>

        <Box
          ref={ref}
          onMouseMove={(e) => mover(e.clientX, e.clientY)}
          onMouseLeave={() => setTilt({ x: 0, y: 0 })}
          onTouchMove={(e) => {
            const p = e.touches[0]
            if (p) mover(p.clientX, p.clientY)
          }}
          onTouchEnd={() => setTilt({ x: 0, y: 0 })}
          sx={{
            // La perspectiva va en el contenedor y la rotación dentro: puesta en el
            // mismo nodo que rota, el efecto sale plano.
            perspective: '900px',
            display: 'flex', justifyContent: 'center',
            mb: 3, mt: 2,
            touchAction: 'none',
          }}
        >
          <Box
            sx={{
              position: 'relative',
              width: 'min(62vw, 260px)',
              height: 'min(62vw, 260px)',
              transformStyle: 'preserve-3d',
              transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
              // Sin transición mientras se arrastra el dedo se ve a tirones; con una
              // demasiado larga, la medalla va por detrás del gesto. 120 ms es el punto.
              transition: 'transform 120ms ease-out',
              ...(quieto ? null : { animation: 'fontapp-badge-in 520ms cubic-bezier(.2,.8,.3,1)' }),
              ...(aro && {
                borderRadius: '50%',
                p: '10px',
                border: '3px solid',
                borderColor: aro,
                boxShadow: `0 0 28px ${aro}66`,
              }),
              // El destello: una banda diagonal que cruza en bucle. `pointer-events:none`
              // o se comería los gestos de la capa de abajo.
              ...(quieto
                ? null
                : {
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      inset: 0,
                      background:
                        'linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.42) 50%, transparent 62%)',
                      backgroundSize: '260% 260%',
                      mixBlendMode: 'overlay',
                      pointerEvents: 'none',
                      // Recortado con la propia insignia: el escudo no llena el cuadrado
                      // y sin máscara el destello se ve como un recuadro gris flotando
                      // alrededor, porque `overlay` sobre el fondo negro aclara igual el
                      // vacío. La máscara lo deja solo donde hay dibujo.
                      ...(url && {
                        maskImage: `url(${url})`,
                        WebkitMaskImage: `url(${url})`,
                        maskSize: 'contain',
                        WebkitMaskSize: 'contain',
                        maskPosition: 'center',
                        WebkitMaskPosition: 'center',
                        maskRepeat: 'no-repeat',
                        WebkitMaskRepeat: 'no-repeat',
                      }),
                      animation: 'fontapp-badge-sheen 3.6s ease-in-out infinite',
                    },
                  }),
            }}
          >
            {url ? (
              <Box
                component="img"
                src={url}
                alt={nombre}
                sx={{
                  width: '100%', height: '100%', objectFit: 'contain', display: 'block',
                  ...(locked ? { filter: 'grayscale(1)', opacity: 0.48 } : null),
                }}
              />
            ) : (
              // Sin dibujo todavía: el visor sigue teniendo sentido con el nombre en
              // grande, y así quien abre no se encuentra un hueco negro.
              <Box sx={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="h2" sx={{ color: 'common.white', opacity: 0.25, fontWeight: 900 }}>
                  {nombre.slice(0, 1)}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        <Typography variant="h5" sx={{ color: 'common.white', fontWeight: 800 }}>{nombre}</Typography>
        {tier && (
          <Chip
            size="small"
            label={t(`game.tier.${tier}`)}
            sx={{
              mt: 1, fontWeight: 700,
              color: aro ?? 'common.white',
              borderColor: aro ?? 'rgba(255,255,255,0.5)',
            }}
            variant="outlined"
          />
        )}
        {subtitle && (
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)', mt: 1.5 }}>
            {subtitle}
          </Typography>
        )}

        {/* Qué es y por qué se tiene. Va DEBAJO del progreso y en un tono más apagado:
            quien abre la medalla ya sabe cuál es, y lo que viene a mirar es el dibujo.
            La explicación está para quien se pregunte «¿y esto de qué me ha salido?»,
            que es justo lo que no contaba ninguna otra parte de la interfaz — la vitrina
            enseña un número («60 de 200») sin decir de qué son esos 60. */}
        {explicacion && (
          <Typography
            variant="body2"
            sx={{
              color: 'rgba(255,255,255,0.58)', mt: 1.5, mx: 'auto',
              // Ancho de lectura: a pantalla completa, una línea suelta cruzaría todo el
              // diálogo y se leería peor que centrada y estrecha.
              maxWidth: 320, lineHeight: 1.5,
            }}
          >
            {explicacion}
          </Typography>
        )}
      </Box>
    </Dialog>
  )
}
