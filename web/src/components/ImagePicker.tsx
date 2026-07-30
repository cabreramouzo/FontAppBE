import { useEffect, useState } from 'react'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Box from '@mui/material/Box'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import CloseIcon from '@mui/icons-material/Close'
import { useI18n } from '../i18n/I18nContext'

// Selector de imagen con aspecto de botón (no el input de archivos nativo).
// En móvil abre cámara/galería; muestra miniatura al elegir foto.
export function ImagePicker({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const { t } = useI18n()
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
      <Box sx={{ position: 'relative', display: 'inline-block', alignSelf: 'flex-start' }}>
        <Box component="img" src={preview} alt={t('image.previewAlt')} sx={{ maxWidth: 140, maxHeight: 140, borderRadius: 2, display: 'block', border: 1, borderColor: 'divider' }} />
        <IconButton
          size="small"
          onClick={() => onChange(null)}
          aria-label={t('image.remove')}
          sx={{ position: 'absolute', top: -10, right: -10, bgcolor: 'error.main', color: '#fff', '&:hover': { bgcolor: 'error.dark' } }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    )
  }

  return (
    <Button component="label" variant="outlined" startIcon={<PhotoCameraIcon />} sx={{ alignSelf: 'flex-start', borderStyle: 'dashed' }}>
      {t('image.add').replace(/^[^\p{L}]+/u, '')}
      <input type="file" accept="image/*" hidden onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </Button>
  )
}
