import MuiSkeleton from '@mui/material/Skeleton'
import Box from '@mui/material/Box'

// Marcador de carga (MUI Skeleton) en lugar de "Cargando…".
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <Box aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <MuiSkeleton key={i} variant="rounded" height={14} sx={{ my: 1, width: `${100 - i * 18}%` }} />
      ))}
    </Box>
  )
}
