import { Link as RouterLink } from 'react-router-dom'
import Button from '@mui/material/Button'
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder'
import { useI18n } from '../i18n/I18nContext'
import { FeedbackButton } from './FeedbackButton'
import { estaInstalada } from '../lib/install'


export function Footer() {
  const { t } = useI18n()

  return (
    <footer className="footer">
      {/* Lleva a la pantalla y ya no abre un diálogo propio: decía menos (solo dinero) y
          mantener el mismo contenido en dos sitios garantiza que uno se quede viejo. */}
      <Button component={RouterLink} to="/support" size="small" startIcon={<FavoriteBorderIcon />} sx={{ textTransform: 'none' }}>
        {t('donate.button')}
      </Button>
      <FeedbackButton />
      {/* En móvil el icono de zonas no cabe en la barra: aquí es donde se llega. */}
      <RouterLink to="/zones">{t('zones.title')}</RouterLink>
      {/* La explicación del juego, en el pie y no en la barra: no es algo que se busque
          a diario, pero tiene que estar donde se mira cuando surge la duda. */}
      <RouterLink to="/gamification">{t('gamePage.title')}</RouterLink>
      {/* Instalar, en el pie y también en el cajón (⋮): un aviso que se ve una vez no
          enseña nada —la gente lo cierra sin leerlo— y después no había ningún sitio
          donde volver a mirarlo. No se pinta si ya la tiene instalada. */}
      {!estaInstalada() && <RouterLink to="/install">{t('install.button')}</RouterLink>}
      <RouterLink to="/legal">{t('footer.legal')}</RouterLink>
      <span className="muted">
        {t('footer.dataPrefix')}{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{' '}
        (ODbL) ·{' '}
        <a href="https://www.icgc.cat" target="_blank" rel="noreferrer">
          ICGC
        </a>
        /ACA (CC BY 4.0)
      </span>

    </footer>
  )
}
