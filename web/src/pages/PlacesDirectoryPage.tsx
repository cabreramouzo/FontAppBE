import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { useI18n } from '../i18n/I18nContext'
import { getPlaces, type PlaceDTO } from '../api/client'
import { PAISES, TODOS, nombrePais, paisRecordado, recuerdaPais } from '../lib/countries'

/**
 * Directorio de pueblos: el **hub de entrada** que le faltaba a las páginas por pueblo.
 *
 * Cada `/places/:slug` ya enlaza a sus seis vecinas, así que el grafo está casi conectado;
 * lo que faltaba era una puerta desde el sitio navegable hacia dentro de ese grafo. Sin
 * ella, las ~4.400 páginas colgaban solo del sitemap, que Google rastrea con menos ganas
 * que lo que encuentra por enlaces. Esta página las enlaza agrupadas por demarcación, y
 * desde cada demarcación se llega a la lista completa (`?region=`).
 *
 * Se enlaza desde el pie. La vista general trae las de más fuentes; una demarcación
 * concreta, todas las suyas.
 */
export function PlacesDirectoryPage() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const region = params.get('region') ?? ''
  const [items, setItems] = useState<PlaceDTO[] | null>(null)
  const [pais, setPais] = useState<string>(() => paisRecordado() ?? TODOS)

  useEffect(() => { document.title = `${t('places.title')} · FontApp` }, [t])

  useEffect(() => {
    setItems(null)
    // Una demarcación: todas las suyas. La vista general: las mayores, como hub.
    getPlaces(region ? { region, limit: 1000 } : { limit: 600 })
      .then(setItems)
      .catch(() => setItems([]))
  }, [region])

  const paisesPresentes = useMemo(
    () => [...new Set((items ?? []).map((p) => p.country).filter(Boolean))] as string[], [items])

  const visibles = useMemo(() => {
    const all = items ?? []
    if (region || pais === TODOS) return all
    const filtrados = all.filter((p) => p.country === pais)
    // Un país recordado que no está entre los mayores dejaría la página en blanco: mejor
    // enseñar todo que nada. (Un rastreador no tiene país recordado, así que ve todo.)
    return filtrados.length ? filtrados : all
  }, [items, pais, region])

  const grupos = useMemo(() => {
    const m = new Map<string, PlaceDTO[]>()
    for (const p of visibles) {
      const k = p.region ?? '—'
      ;(m.get(k) ?? m.set(k, []).get(k)!).push(p)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [visibles])

  function eligePais(v: string) { setPais(v); if (v !== TODOS) recuerdaPais(v) }

  return (
    <Box className="pad" sx={{ maxWidth: 1040, mx: 'auto' }}>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 800, mt: 1 }}>
        {region || t('places.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('places.intro')}</Typography>

      {region ? (
        <Box sx={{ mb: 2 }}><RouterLink to="/places">← {t('places.back')}</RouterLink></Box>
      ) : paisesPresentes.length > 1 && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Chip label={t('zones.allCountries')} clickable
                color={pais === TODOS ? 'primary' : 'default'} variant={pais === TODOS ? 'filled' : 'outlined'}
                onClick={() => eligePais(TODOS)} />
          {PAISES.filter((p) => paisesPresentes.includes(p)).map((p) => (
            <Chip key={p} label={nombrePais(p, t)} clickable
                  color={pais === p ? 'primary' : 'default'} variant={pais === p ? 'filled' : 'outlined'}
                  onClick={() => eligePais(p)} />
          ))}
        </Box>
      )}

      {items === null ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>
      ) : grupos.map(([reg, lugares]) => (
        <Box key={reg} sx={{ mb: 2.5 }}>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
            {region ? reg : <RouterLink to={`/places?region=${encodeURIComponent(reg)}`}>{reg}</RouterLink>}
          </Typography>
          <Typography variant="body2" sx={{ lineHeight: 1.9 }}>
            {lugares.map((p, i) => (
              <Box component="span" key={p.slug}>
                <RouterLink to={`/places/${p.slug}`}>{p.name}</RouterLink>
                <Box component="span" sx={{ color: 'text.secondary' }}> ({p.fontCount})</Box>
                {i < lugares.length - 1 && <Box component="span" sx={{ color: 'text.disabled' }}> · </Box>}
              </Box>
            ))}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}
