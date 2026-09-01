import { useEffect, useState } from 'react'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import ContentCopyIcon from '@mui/icons-material/ContentCopyOutlined'
import { describeError, suggestDuplicate } from '../api/client'
import type { Font } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { useToast } from './ToastContext'
import { capabilities } from '../lib/capabilities'
import { ElegirFuenteCercana } from './ElegirFuenteCercana'

/**
 * «Aquesta és la mateixa que aquella», al alcance de cualquiera con sesión.
 *
 * Decidirlo sigue siendo `Capabilities.markDuplicate` (nivel 5), y con razón: esconder un
 * punto de la vista de todo el mundo no debería ser la opinión de uno. Lo que faltaba es
 * la otra mitad — **quien ve el duplicado casi nunca es quien puede marcarlo**. Medido en
 * producción: 7 personas llegan a las gotas de ese nivel y solo 1 a los ocho días, así
 * que el vecino que conoce el pueblo no tenía más salida que escribir un correo. Pasó,
 * con una fuente triplicada en Castellcir.
 *
 * Viaja como comentario y **nunca como incidencia**: un duplicado no es una fuente rota y
 * no puede engordar el recuento de averías abiertas que se le enseña a un ayuntamiento.
 * Lo fuerza el servidor.
 */
export function SugerirDuplicado({ font, onPosted }: { font: Font; onPosted: () => void }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const toast = useToast()
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [puedeMarcar, setPuedeMarcar] = useState(false)

  // Quien puede marcarlo de verdad ya tiene su botón en el bloque de mantenimiento: dos
  // botones parecidos que hacen cosas distintas es peor que uno.
  useEffect(() => { capabilities().then((c) => setPuedeMarcar((c as string[]).includes('markDuplicate'))) }, [])

  // Sin sesión no se pinta: no hay nada que hacer si no puedes aportar. Y sobre una ficha
  // ya marcada no hay nada que señalar.
  if (!user || puedeMarcar || font.duplicateOf) return null

  async function elegida(id: string) {
    setAbierto(false); setError(''); setOcupado(true)
    try {
      await suggestDuplicate(font.id, id, t('dup.message'))
      toast.show(t('dup.sent'))
      onPosted()
    } catch (e) {
      setError(describeError(e, t))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      <Button
        size="small" color="inherit" startIcon={<ContentCopyIcon />} disabled={ocupado}
        sx={{ mt: 2, ml: 1, color: 'text.secondary' }} onClick={() => setAbierto(true)}
      >
        {t('dup.suggest')}
      </Button>
      <ElegirFuenteCercana
        font={font} open={abierto} ocupado={ocupado}
        titulo={t('dup.suggest')} ayuda={t('dup.help')}
        onClose={() => setAbierto(false)} onElegir={elegida}
      />
    </>
  )
}
