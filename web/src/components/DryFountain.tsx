import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

/**
 * Ilustración de la fuente seca, para cuando no hay nada que enseñar: una zona sin
 * novedades o una página que no existe.
 *
 * Es la misma imagen en los dos sitios a propósito. Un hueco vacío se explica mejor con
 * la metáfora de la propia app —has llegado a una fuente y no sale agua— que con un
 * icono de error, y repetirla hace que el usuario la reconozca la segunda vez.
 */
export function DryFountain({
  title,
  subtitle,
  children,
  size = 260,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
  size?: number
}) {
  return (
    <Box sx={{ textAlign: 'center', maxWidth: 460, mx: 'auto', py: 4, px: 2 }}>
      <Box
        component="img"
        src="/dry-fountain.jpg"
        alt=""
        sx={{
          width: '100%',
          maxWidth: size,
          borderRadius: 4,
          display: 'block',
          mx: 'auto',
          mb: 2.5,
          // La ilustración es clara y sobre fondo blanco se queda flotando sin bordes.
          boxShadow: 3,
        }}
      />
      <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>{title}</Typography>
      {subtitle && (
        <Typography color="text.secondary" sx={{ mb: 2.5 }}>{subtitle}</Typography>
      )}
      {children}
    </Box>
  )
}
