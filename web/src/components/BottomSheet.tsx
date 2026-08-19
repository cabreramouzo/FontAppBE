import type { ReactNode } from 'react'
import Drawer from '@mui/material/Drawer'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

/**
 * Hoja que sube desde abajo. **Solo para móvil**: en escritorio cada control se queda
 * donde estaba (un menú anclado, un desplegable), porque allí el ratón apunta fino y una
 * hoja a pantalla completa sería un préstamo del móvil.
 *
 * Existe para que las dos hojas del mapa —filtros y capas— compartan el mismo asa, el
 * mismo acolchado y el mismo trato del borde inferior. Si cada una se lo pusiera por su
 * cuenta, la tercera que se añada no se acordará de la muesca del iPhone.
 */
export function BottomSheet({
  open,
  onClose,
  titulo,
  children,
}: {
  open: boolean
  onClose: () => void
  titulo: string
  children: ReactNode
}) {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      // El contenido puede ser más alto que la pantalla (cinco capas, cinco filtros):
      // se limita y se deja rodar por dentro, nunca empujando la página.
      slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80dvh' } } }}
    >
      {/* El asa: no arrastra nada —cerrar es tocar fuera o el botón—, pero es lo que hace
          que se lea como una hoja y no como un cuadro de diálogo pegado abajo. */}
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.25, pb: 0.5 }}>
        <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
      </Box>
      <Typography variant="subtitle2" sx={{ px: 2, pb: 1, color: 'text.secondary' }}>{titulo}</Typography>
      {/* El acolchado de abajo lleva la muesca **y** un respiro: una hoja que termina justo
          en el indicador del iPhone se toca mal en la última fila. */}
      <Box sx={{ px: 2, pb: 'calc(env(safe-area-inset-bottom) + 16px)', overflowY: 'auto' }}>
        {children}
      </Box>
    </Drawer>
  )
}
