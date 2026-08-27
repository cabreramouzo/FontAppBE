import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import BrokenImageIcon from '@mui/icons-material/BrokenImageOutlined'
import { useI18n } from '../i18n/I18nContext'

// Imagen con carga diferida (lazy) que, al tocarla, se amplía en un visor a
// pantalla completa (lightbox). Cerrar tocando fuera o con Escape.
//
// El visor se pinta **en `document.body` con un portal, no donde está la imagen**, y eso
// no es un detalle: `position: fixed` con `z-index: 2500` NO basta para estar por encima
// de todo. Basta con que un ancestro cree un contexto de apilamiento —`position: sticky`,
// un `transform`, una opacidad— para que ese 2500 se resuelva DENTRO de él y el visor no
// pueda subir por encima de los hermanos del ancestro.
//
// Pasó de verdad: al dejar pegada la columna izquierda de la ficha, `sticky` creó un
// contexto y las reseñas de la columna de al lado se pintaban sobre la foto ampliada. El
// arreglo no es subir el número —dentro de ese contexto no hay número que valga— sino
// sacar el visor del árbol. Así queda inmune a cualquier contenedor futuro.
export function ZoomableImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  /**
   * La foto no ha cargado.
   *
   * Sin esto sale **el icono de imagen rota del navegador**, que parece que la app esté
   * estropeada. Y pasa constantemente sin cobertura: una foto solo queda guardada si
   * alguien la vio antes, así que en una zona guardada casi ninguna lo está.
   *
   * Se reportó probándolo en el monte: la ficha ya cargaba, pero unas fuentes tenían foto
   * y otras el icono roto.
   */
  const [roto, setRoto] = useState(false)

  // Al volver la red se vuelve a intentar. El navegador no reintenta una imagen que ya
  // falló, así que hay que sacarla y reponerla — de ahí la `key` con el contador.
  const [intento, setIntento] = useState(0)
  useEffect(() => {
    if (!roto) return
    const vuelve = () => { setRoto(false); setIntento((n) => n + 1) }
    window.addEventListener('online', vuelve)
    return () => window.removeEventListener('online', vuelve)
  }, [roto])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (roto) {
    // A propósito **no** se parece al hueco de «esta fuente no tiene foto»: ese invita a
    // poner una, y aquí la fuente sí tiene — solo que no está en este móvil. Confundirlos
    // llevaría a alguien a subir una foto repetida creyendo que falta.
    return (
      <Box
        className={className}
        sx={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 0.5, minHeight: 120, p: 2, borderRadius: 2,
          bgcolor: 'action.hover', color: 'text.secondary', textAlign: 'center',
        }}
      >
        <BrokenImageIcon fontSize="small" />
        <Typography variant="caption">
          {typeof navigator !== 'undefined' && navigator.onLine === false
            ? t('photo.notSaved')
            : t('photo.failed')}
        </Typography>
      </Box>
    )
  }

  return (
    <>
      <img
        key={intento}
        className={className}
        src={src}
        alt={alt}
        loading="lazy"
        style={{ cursor: 'zoom-in' }}
        onClick={() => setOpen(true)}
        onError={() => setRoto(true)}
      />
      {open && createPortal(
        <div className="lightbox" onClick={() => setOpen(false)}>
          <img src={src} alt={alt} />
        </div>,
        document.body,
      )}
    </>
  )
}
