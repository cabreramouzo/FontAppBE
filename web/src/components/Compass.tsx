import Fab from '@mui/material/Fab'
import Box from '@mui/material/Box'
import Zoom from '@mui/material/Zoom'
import { useI18n } from '../i18n/I18nContext'

/**
 * Brújula: devuelve el mapa al norte.
 *
 * Solo aparece cuando el mapa está girado. Un botón que no hace nada visible es peor
 * que no tenerlo, y mientras el norte está arriba no hay nada que enderezar.
 *
 * En iOS hace doble trabajo: al tocarlo también pide permiso para el sensor de
 * orientación, que Safari solo concede si la petición sale de un gesto del usuario.
 * Es el sitio natural — quien busca el norte es justo quien quiere la brújula.
 */
export function Compass({ bearing, onReset }: { bearing: number; onReset: () => void }) {
  const { t } = useI18n()
  const girado = Math.abs(bearing) > 0.5

  return (
    <Zoom in={girado} unmountOnExit>
      <Fab
        size="medium"
        onClick={onReset}
        aria-label={t('map.northUp')}
        title={t('map.northUp')}
        sx={{ bgcolor: 'background.paper', color: 'text.primary', '&:hover': { bgcolor: 'background.paper' } }}
      >
        {/* La aguja gira al revés que el mapa: si el mapa mira al este, el norte
            queda a la izquierda. La N acompaña a la punta roja. */}
        <Box
          component="svg"
          viewBox="0 0 24 24"
          sx={{ width: 26, height: 26, transform: `rotate(${-bearing}deg)`, transition: 'transform 0.1s linear' }}
        >
          <path d="M12 3 L15.4 12 L12 10.4 L8.6 12 Z" fill="#e5484d" />
          <path d="M12 21 L8.6 12 L12 13.6 L15.4 12 Z" fill="currentColor" opacity="0.45" />
        </Box>
      </Fab>
    </Zoom>
  )
}
