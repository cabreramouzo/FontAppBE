import { useI18n } from '../../i18n/I18nContext'
import { DatosGuardados } from '../../components/DatosGuardados'
import { PantallaDeAjustes } from './comun'

export function StorageSettingsPage() {
  const { t } = useI18n()
  // No usa `useAjustes`: aquí no se guarda nada en el perfil. Lo que hay son cachés del
  // navegador y la zona guardada, que viven en este aparato y solo en este.
  return (
    <PantallaDeAjustes titulo={t('storage.title')} intro={t('storage.intro')}>
      <DatosGuardados sinTitulo />
    </PantallaDeAjustes>
  )
}
