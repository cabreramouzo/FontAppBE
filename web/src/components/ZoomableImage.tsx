import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

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
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <img
        className={className}
        src={src}
        alt={alt}
        loading="lazy"
        style={{ cursor: 'zoom-in' }}
        onClick={() => setOpen(true)}
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
