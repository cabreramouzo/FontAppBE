import { useEffect, useState } from 'react'

// Imagen con carga diferida (lazy) que, al tocarla, se amplía en un visor a
// pantalla completa (lightbox). Cerrar tocando fuera o con Escape.
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
      {open && (
        <div className="lightbox" onClick={() => setOpen(false)}>
          <img src={src} alt={alt} />
        </div>
      )}
    </>
  )
}
