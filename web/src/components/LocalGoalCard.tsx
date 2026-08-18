import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined'
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import { getLocalZone } from '../api/client'
import type { ZoneLocal } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { askPosition, positionIfAllowed } from '../lib/quietPosition'
import { CoverageBar } from './CoverageBar'
import { Skeleton } from './Skeleton'

/**
 * «Tu entorno»: la misma cobertura que las demarcaciones, pero sobre las treinta fuentes
 * que tienes andando.
 *
 * ## Qué arregla
 *
 * La barra de una demarcación entera no se mueve nunca. «Barcelona: 24 de 8.007 con foto»
 * es verdad y es inútil — nadie va a terminar eso, así que tampoco invita a empezar. La
 * misma barra sobre treinta fuentes se termina entre unos pocos vecinos y **una sola foto
 * la sube un 3 %**, que es justo lo que la tarjeta dice en voz alta.
 *
 * ## Por qué no es un pueblo, y por qué no hay una lista de pueblos
 *
 * Poner «Castellcir» sería mejor que «lo que tienes alrededor», pero pide una columna de
 * municipio y un fichero de fronteras municipales que hoy no tenemos —ni `region` está
 * poblada del todo—, y convertiría `/zones` en un directorio de cientos de pueblos que
 * nadie lee. Esto no añade **ninguna** fila a **ninguna** lista: es una tarjeta, y hay
 * exactamente una, la tuya.
 *
 * El recuento fijo (treinta) tampoco es capricho: a 5 km hay 53 fuentes en Castellcir y
 * 1.482 en el centro de Barcelona, así que con un radio fijo el objetivo saldría
 * terminable en un sitio e imposible en el otro. Ver `ZoneStats.localFonts`.
 */
export function LocalGoalCard() {
  const { t, lang } = useI18n()
  const [datos, setDatos] = useState<ZoneLocal | null>(null)
  const [estado, setEstado] = useState<'ubicando' | 'sinPermiso' | 'cargando' | 'ok' | 'error'>('ubicando')

  // Al montar, la posición solo si el permiso YA estaba dado: nunca se lanza el diálogo
  // del navegador a bocajarro (ver `positionIfAllowed`).
  useEffect(() => {
    let vivo = true
    positionIfAllowed().then((p) => {
      if (!vivo) return
      if (!p) { setEstado('sinPermiso'); return }
      void cargar(p)
    })
    return () => { vivo = false }

    async function cargar([lat, long]: [number, number]) {
      setEstado('cargando')
      try {
        const d = await getLocalZone(lat, long)
        if (!vivo) return
        setDatos(d)
        setEstado('ok')
      } catch {
        if (vivo) setEstado('error')
      }
    }
  }, [])

  /** Pulsado el botón: ahí sí se puede pedir permiso, porque es un gesto del usuario. */
  async function pedir() {
    const p = await askPosition()
    if (!p) return
    setEstado('cargando')
    try {
      setDatos(await getLocalZone(p[0], p[1]))
      setEstado('ok')
    } catch {
      setEstado('error')
    }
  }

  // Un fallo de red aquí no se enseña: la página tiene debajo las demarcaciones, que son
  // lo que la persona ha venido a ver. Una alerta roja por una tarjeta accesoria estorba.
  if (estado === 'error') return null
  if (estado === 'ubicando') return null

  if (estado === 'sinPermiso') {
    return (
      <Card variant="outlined" sx={{ mb: 2, borderRadius: 2, p: 2 }}>
        <Typography sx={{ fontWeight: 800, mb: 0.5 }}>📍 {t('local.title')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t('local.ask')}</Typography>
        <Button size="small" variant="outlined" startIcon={<MyLocationIcon />} onClick={() => void pedir()}>
          {t('local.askButton')}
        </Button>
      </Card>
    )
  }

  if (estado === 'cargando' || !datos) {
    return <Card variant="outlined" sx={{ mb: 2, borderRadius: 2, p: 2 }}><Skeleton lines={4} /></Card>
  }

  if (datos.fonts === 0) {
    return (
      <Card variant="outlined" sx={{ mb: 2, borderRadius: 2, p: 2 }}>
        <Typography sx={{ fontWeight: 800, mb: 0.5 }}>📍 {t('local.title')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('local.empty')}</Typography>
      </Card>
    )
  }

  const num = (v: number) => v.toLocaleString(lang, { maximumFractionDigits: 1 })
  // Lo que mueve una sola aportación. Es el dato que la barra de demarcación no puede dar:
  // allí una foto es el 0,01 % y aquí es un escalón que se ve.
  const paso = num(100 / datos.fonts)

  return (
    <Card
      variant="outlined"
      // Destacada respecto a las demarcaciones de abajo: es la que se puede terminar.
      sx={{ mb: 2, borderRadius: 2, p: 2, borderColor: 'primary.main', borderWidth: 2 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', mb: 0.25 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.1rem' }}>📍 {t('local.title')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('local.scope', { n: datos.fonts.toLocaleString(lang), km: num(datos.radiusKm) })}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {t('local.hint', { p: paso })}
      </Typography>

      <CoverageBar
        icon={<PhotoCameraOutlinedIcon fontSize="small" />}
        label={t('zones.withPhoto')}
        hint={t('zones.withPhotoHint')}
        done={datos.withPhoto} total={datos.fonts} pct={datos.photoPct} lang={lang}
      />
      <CoverageBar
        icon={<EventAvailableOutlinedIcon fontSize="small" />}
        label={t('zones.checked')}
        hint={t('zones.checkedHint')}
        done={datos.checkedRecently} total={datos.fonts} pct={datos.freshPct} lang={lang}
      />

      {/* La mitad colectiva: sin esto la tarjeta es otro marcador personal. No sale ningún
          nombre, solo cuántos — el territorio no es de nadie. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, color: 'text.secondary' }}>
        <GroupsOutlinedIcon fontSize="small" />
        <Typography variant="body2">
          {datos.contributors === 0
            ? t('local.nobody')
            : datos.contributors === 1
              ? t('local.oneContributor')
              : t('local.contributors', { n: datos.contributors.toLocaleString(lang) })}
        </Typography>
      </Box>
    </Card>
  )
}
