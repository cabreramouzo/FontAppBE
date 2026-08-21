import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import IosShareIcon from '@mui/icons-material/IosShare'
import LocalCafeIcon from '@mui/icons-material/LocalCafe'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import { useI18n } from '../i18n/I18nContext'
import { useToast } from '../components/ToastContext'
import { FeedbackButton } from '../components/FeedbackButton'
import { comparteTexto } from '../lib/share'

// Ko-fi se retiró el 19/08/2026, cuando entró el mecenatge d'Aixeta. Dos botones que
// decían «invita'm a un cafè» competían por ser lo mismo, y el texto de arriba pide algo
// **recurrente**, que es justo lo que Ko-fi no era aquí. Se deja escrito el enlace porque
// la razón para quitarlo puede caducar: si algún día llega gente que no puede pagar por
// Aixeta, volver a ponerlo es un minuto y no una excavación.
//   Ko-fi: https://ko-fi.com/G5G724DC37   (etiqueta antigua: 'donate.kofi')
const BTC_ADDRESS = 'bc1qu29jxn37wwwrqz6f6qyrwsaa8xn72xy9wmeh0w'
// Mecenatge recurrent (Aixeta). Va PRIMER y en botón lleno porque es lo que el texto de
// arriba pide —«la ayuda que más sirve es la que se repite»—, y sería raro pedir algo
// mensual y ofrecer primero el pago único.
const AIXETA_URL = 'https://fontapp.aixeta.cat/'

// El enlace que se comparte lleva su código de campaña, como los carteles: así el panel
// de administración puede decir cuánta gente entró porque un amigo se lo pasó, que es
// justo lo que esta pantalla pretende y lo único que diría si funciona. Se guarda en
// `users.signup_source` al registrarse (primera visita gana).
const ENLACE = 'https://fontapp.net/?p=amigos'

/**
 * Apoyar el proyecto. **Una pantalla y no un diálogo**: lo que se pide aquí —que invites
 * a alguien— no se hace de un vistazo, y un cuadro flotante sobre el mapa invita a
 * cerrarlo.
 *
 * El orden es el mensaje: **primero invitar, después dinero**. Lo que le falta a esta app
 * no son euros, son personas mirando fuentes; y decirlo en ese orden evita que la pantalla
 * se lea como un cepillo.
 */
export function SupportPage() {
  const { t } = useI18n()
  const toast = useToast()
  const [copiado, setCopiado] = useState(false)
  const [pagant, setPagant] = useState<'once' | 'monthly' | null>(null)
  const stripeResult = new URLSearchParams(window.location.search).get('stripe')
  // `null` mientras no se sabe, y mientras no se sabe **no se pinta nada**. Enseñar el
  // botón y quitarlo medio segundo después es peor que tardar medio segundo en ponerlo:
  // lo primero mueve la página bajo el dedo de quien ya iba a pulsar.
  const [potPagar, setPotPagar] = useState<boolean | null>(null)

  // Si la cuenta de Stripe está configurada en ESTE entorno. Sin esto, el botón se
  // desplegó a producción antes que las claves y durante ese rato ofrecía un pago que
  // contestaba «no podemos abrir el pago» — que es la peor forma posible de pedir dinero.
  // Falla cerrado: si la consulta no llega, no hay botón.
  useEffect(() => {
    let viu = true
    fetch('/stripe/checkout')
      .then((r) => (r.ok ? r.json() as Promise<{ once?: boolean }> : { once: false }))
      .then((d) => { if (viu) setPotPagar(Boolean(d.once)) })
      .catch(() => { if (viu) setPotPagar(false) })
    return () => { viu = false }
  }, [])

  async function pagarAmbStripe(kind: 'once' | 'monthly') {
    setPagant(kind)
    try {
      const response = await fetch('/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind }),
      })
      const result = await response.json() as { url?: string }
      if (!response.ok || !result.url) throw new Error('checkout unavailable')
      window.location.assign(result.url)
    } catch {
      toast.show(t('donate.stripeError'))
      setPagant(null)
    }
  }

  async function compartir() {
    if (await comparteTexto(`${t('support.shareText')} ${ENLACE}`) === 'copiado') {
      toast.show(t('toast.linkCopied'))
    }
  }

  async function copiarBTC() {
    try {
      await navigator.clipboard.writeText(BTC_ADDRESS)
      setCopiado(true)
      toast.show(t('donate.copied'))
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      /* portapapeles no disponible */
    }
  }

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', px: 2, py: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>❤️ {t('support.title')}</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>{t('support.intro')}</Typography>

      {/* Lo primero y lo más grande. */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{t('support.inviteTitle')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('support.inviteBody')}</Typography>
        <Button
          fullWidth variant="contained" disableElevation size="large"
          startIcon={<IosShareIcon />} onClick={compartir} sx={{ textTransform: 'none', mb: 1 }}
        >
          {t('support.share')}
        </Button>
        {/* WhatsApp aparte del botón de compartir, y no dentro: es por dónde se mueve esto
            de verdad aquí, y `wa.me` abre la app instalada sin pasar por la hoja del
            sistema. En escritorio abre WhatsApp Web, que también sirve. */}
        <Button
          fullWidth variant="outlined" size="large"
          startIcon={<WhatsAppIcon />}
          component="a"
          href={`https://wa.me/?text=${encodeURIComponent(`${t('support.shareText')} ${ENLACE}`)}`}
          target="_blank" rel="noreferrer"
          sx={{ textTransform: 'none' }}
        >
          {t('support.whatsapp')}
        </Button>
      </Paper>

      {/* Contar qué falla es la otra forma de ayudar que no cuesta dinero, así que va con
          la de invitar y **antes** que la de pagar. Y es la que más rinde en una app tan
          joven: un mensaje bien detallado vale más que un café. */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{t('support.feedbackTitle')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('support.feedbackBody')}</Typography>
        <FeedbackButton destacado />
      </Paper>

      {/* Y solo después, el dinero. */}
      <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{t('support.costsTitle')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('support.costsBody')}</Typography>

      {stripeResult === 'success' && (
        <Alert severity="success" sx={{ mb: 2 }}>{t('donate.stripeThanks')}</Alert>
      )}

      {/* La línea de debajo se queda aunque ya no haya con qué comparar: dice que es una
          suscripción **antes** de pulsar, que es lo mínimo si el botón lleva a pagar. */}
      <Button
        fullWidth variant="contained" disableElevation startIcon={<LocalCafeIcon />}
        component="a" href={AIXETA_URL} target="_blank" rel="noreferrer"
        sx={{ textTransform: 'none' }}
      >
        {t('donate.aixeta')}
      </Button>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}>
        {t('donate.monthly')}
      </Typography>

      {potPagar && (
        <>
          <Button
            fullWidth variant="outlined" startIcon={<CreditCardIcon />}
            disabled={pagant !== null} onClick={() => pagarAmbStripe('once')}
            sx={{ textTransform: 'none', mt: 2 }}
          >
            {pagant === 'once' ? t('donate.stripeOpening') : t('donate.stripeOnce')}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}>
            {t('donate.stripeSecure')}
          </Typography>
        </>
      )}

      <Divider sx={{ my: 2 }}>{t('donate.orBtc')}</Divider>

      <Typography variant="caption" sx={{ fontWeight: 700 }}>{t('donate.btcLabel')}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flexGrow: 1 }}>
          {BTC_ADDRESS}
        </Typography>
        <IconButton size="small" onClick={copiarBTC} aria-label={t('donate.copy')} title={t('donate.copy')}>
          <ContentCopyIcon fontSize="small" color={copiado ? 'primary' : undefined} />
        </IconButton>
      </Box>
    </Box>
  )
}
