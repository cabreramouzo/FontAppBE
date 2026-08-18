import { Fragment, useMemo } from 'react'
import Link from '@mui/material/Link'
import { Link as RouterLink } from 'react-router-dom'
import { tokeniza } from '../lib/richText'

/**
 * Texto escrito por alguien, con sus direcciones y sus `@menciones` pulsables.
 *
 * ## Por qué los enlaces no se ganan por nivel
 *
 * Se pensó dejarlos a partir de cierto nivel, por el spam. No sale a cuenta:
 *
 * - **La dirección ya se ve.** Está escrita ahí; que no sea pulsable no impide que nadie
 *   la copie. Un candado que no cierra solo estorba a quien viene de buenas.
 * - **Lo que mueve el spam de enlaces es el SEO, y eso se corta con `nofollow ugc`**, no
 *   con un nivel. Ahora que hay sitemap, esto importa de verdad: sin el atributo, cada
 *   reseña sería una donación de posicionamiento y los robots lo huelen enseguida.
 * - Para el abuso ya está el sistema de denuncias y los moderadores, que es reactivo y no
 *   castiga a los 9.900 que no hacen nada malo.
 * - Y encima haría que la misma frase se viera distinta según quién la escribe, que es
 *   difícil de explicar y fácil de leer como un castigo.
 *
 * Es además coherente con la regla de la escalera: los niveles dan poder **sobre el
 * mapa**, no sobre las personas — y menos sobre cómo se pintan sus propias palabras.
 *
 * ## Por qué la descripción no lleva menciones
 *
 * Porque el servidor solo avisa de las menciones de reseñas e incidencias. Pintar una
 * mención en la descripción sería subrayar a alguien a quien nadie va a avisar, que es
 * exactamente lo que la regla de paridad cliente/servidor existe para impedir.
 */
export function TextoRico({ texto, menciones = true }: { texto: string; menciones?: boolean }) {
  const trozos = useMemo(() => tokeniza(texto, { menciones }), [texto, menciones])

  return (
    <>
      {trozos.map((t, i) => (
        <Fragment key={i}>
          {t.tipo === 'texto' && t.texto}
          {t.tipo === 'mencion' && (
            <Link
              component={RouterLink}
              to={`/users/${encodeURIComponent(t.nombre)}`}
              sx={{ fontWeight: 700, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
            >
              @{t.nombre}
            </Link>
          )}
          {t.tipo === 'enlace' && (
            <Link
              href={t.href}
              target="_blank"
              // `nofollow ugc` es la pieza antispam de verdad (ver arriba); `noopener
              // noreferrer` es lo que impide que la pestaña de destino toque la nuestra.
              rel="nofollow ugc noopener noreferrer"
              // La dirección completa al pasar por encima: la etiqueta va recortada y
              // hay que poder ver a dónde lleva antes de pulsar.
              title={t.href}
              // Una dirección larga en un móvil rompe la caja si no se le deja partir.
              sx={{ wordBreak: 'break-word' }}
            >
              {t.etiqueta}
            </Link>
          )}
        </Fragment>
      ))}
    </>
  )
}
