import { useEffect, useState } from 'react'

// Selector de imagen con aspecto de botón/placeholder (no el input de archivos
// nativo de escritorio). En móvil abre la cámara o la galería. Muestra una
// miniatura al elegir foto, con opción de quitarla.
export function ImagePicker({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (preview) {
    return (
      <div className="imgpick-preview">
        <img src={preview} alt="Vista previa" />
        <button type="button" className="imgpick-remove" onClick={() => onChange(null)} aria-label="Quitar foto">✕</button>
      </div>
    )
  }

  return (
    <label className="imgpick-btn">
      <span>📷 Añadir foto</span>
      <input type="file" accept="image/*" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </label>
  )
}
