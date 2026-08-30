import type { ReactNode } from 'react'
import Typography from '@mui/material/Typography'

/**
 * El título de una sección de `/me`, con su icono delante.
 *
 * «Fuentes que dependen de ti» llevaba escudo y las otras tres no, así que en una página
 * de cuatro bloques uno parecía de otra familia. El icono no es adorno: en una pantalla
 * larga es lo que permite volver a encontrar una sección **sin leer** — el escudo, la
 * estrella, el bocadillo. Es la misma razón por la que las filas llevan el emoji del tipo.
 *
 * Se escribe una vez para que los cuatro se vean iguales: mismo tamaño, misma separación
 * y mismo color heredado. Repartido por las páginas, el quinto que se añada acabará con
 * otro tamaño y no se notará hasta verlos juntos.
 */
export function TituloDeSeccion({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <Typography
      variant="h6"
      gutterBottom
      sx={{ display: 'flex', alignItems: 'center', gap: 0.75, '& .MuiSvgIcon-root': { color: 'text.secondary' } }}
    >
      {icono} {children}
    </Typography>
  )
}
