import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import DownloadIcon from '@mui/icons-material/Download'
import PlaceIcon from '@mui/icons-material/Place'
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined'
import { getMunicipality, type MunicipalReport } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { CoverageBar } from '../components/CoverageBar'
import { FilaDeFuente } from '../components/FilaDeFuente'
import { ListaConTope } from '../components/ListaConTope'
import { TituloDeSeccion } from '../components/TituloDeSeccion'
import { SOURCE_EMOJI } from '../lib/waterType'
import { waterStatusInfo } from '../lib/waterStatus'
import { rotulo } from '../lib/fontName'
import type { WaterSource } from '../api/types'

/**
 * La página pública de un municipio: «Fuentes de Castellcir».
 *
 * ## Qué contesta, y en qué orden
 *
 * Es el primer esquema del producto territorial de `docs/ayuntamientos.md`, y el orden es
 * la mitad del mensaje: **qué hay, qué no sabemos, qué se puede hacer y cuáles son.** Un
 * ayuntamiento que la abra tiene que ver en tres segundos que su inventario existe y que
 * el estado está por llenar, porque eso segundo es justo lo que se le va a proponer.
 *
 * **La cobertura se dice sin maquillaje.** La tentación es enseñar solo lo bonito —«26
 * fuentes»— y es justo lo que rompería la confianza el día que alguien vaya a una y esté
 * seca. Aquí el número grande viene acompañado de cuántas ha comprobado alguien alguna
 * vez, que en casi toda la base es muy poco.
 *
 * ## Lo que NO hace
 *
 * - **No certifica potabilidad.** Se llama «declarada» porque es lo que dice el origen del
 *   dato o quien editó la ficha; ningún ayuntamiento firma esto por abrir la página.
 * - **No es un panel de gestión.** No hay sesión, ni permisos, ni edición: lo que enseña
 *   ya es público y sale del mismo mapa. Lo que se cobrará algún día es lo otro —avisos,
 *   histórico, campañas—, y eso no se construye hasta que haya alguien que lo pague.
 * - **No se enlaza desde la navegación** todavía: es una dirección que se manda por correo
 *   mientras se valida. No hace falta esconderla; hace falta no prometer una sección que
 *   aún no existe.
 */
export function MunicipalityPage() {
  const { ine = '' } = useParams()
  const { t, lang } = useI18n()
  const [datos, setDatos] = useState<MunicipalReport | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setDatos(null); setError(false)
    getMunicipality(ine).then(setDatos).catch(() => setError(true))
  }, [ine])

  if (error) return <Box className="pad"><Alert severity="info">{t('muni.notFound')}</Alert></Box>
  if (!datos) return <Box className="pad"><Skeleton lines={6} /></Box>

  const sinFoto = datos.fonts - datos.withPhoto
  // Lo que falta, de más a menos accionable. Solo se pinta lo que de verdad es mayor que
  // cero: una lista de ceros parece un panel roto y no invita a nada.
  const faltan: { n: number; texto: string }[] = [
    { n: datos.neverChecked, texto: t('muni.neverChecked') },
    { n: datos.staleOverYear, texto: t('muni.staleOverYear') },
    { n: sinFoto, texto: t('muni.noPhoto') },
    { n: datos.openReports, texto: t('muni.openReports') },
  ].filter((x) => x.n > 0)

  // Primero lo que nadie ha mirado nunca, después lo más olvidado. Es el mismo orden que
  // «fuentes que dependen de ti»: una lista de un territorio se lee para decidir a dónde
  // ir, no para admirar el inventario.
  const lista = [...datos.items].sort((a, b) => (b.days ?? 1e9) - (a.days ?? 1e9))

  return (
    <Box className="pad" sx={{ maxWidth: 1040, mx: 'auto' }}>
      <Typography variant="h4" sx={{ fontWeight: 800 }}>
        {t('muni.title', { name: datos.municipality })}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        {t('muni.lead')}
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
          <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1 }}>
            {datos.fonts.toLocaleString(lang)}
          </Typography>
          <Typography color="text.secondary">{t('muni.fountains')}</Typography>
        </Box>
        <CoverageBar
          icon={<WaterDropOutlinedIcon fontSize="small" />}
          label={t('muni.checked')}
          hint={t('muni.checkedHint')}
          done={datos.checkedEver}
          total={datos.fonts}
          // Redondeado aquí: `CoverageBar` pinta el número tal cual —en `/zones` se lo
          // da el servidor ya redondeado— y sin esto salía «73.07692307692308 %».
          pct={datos.fonts ? Math.round((1000 * datos.checkedEver) / datos.fonts) / 10 : 0}
          lang={lang}
        />
        {faltan.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
            {faltan.map((f) => (
              <Chip key={f.texto} size="small" variant="outlined" label={`${f.n} ${f.texto}`} />
            ))}
          </Box>
        )}
      </Paper>

      <TituloDeSeccion icono={<PlaceIcon fontSize="small" />}>{t('muni.whatThereIs')}</TituloDeSeccion>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
        {Object.entries(datos.bySource)
          .sort((a, b) => b[1] - a[1])
          .map(([clave, n]) => (
            <Chip
              key={clave}
              size="small"
              label={clave === 'unknown'
                ? `${n} ${t('muni.unknownType')}`
                : `${SOURCE_EMOJI[clave as WaterSource] ?? ''} ${n} ${t(`source.${clave}`)}`}
            />
          ))}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('muni.drinkableNote')}
      </Typography>

      <TituloDeSeccion icono={<WaterDropOutlinedIcon fontSize="small" />}>{t('muni.list')}</TituloDeSeccion>
      <ListaConTope
        items={lista}
        clave={(f) => f.id}
        fila={(f) => {
          const estado = waterStatusInfo(f.lastStatus)
          return (
            <FilaDeFuente
              to={`/fonts/${f.id}`}
              source={f.source as WaterSource | null}
              primary={rotulo(f.name, t)}
              secondary={
                f.days == null
                  ? t('muni.neverCheckedRow')
                  : <>
                      {estado && <span title={t(`status.${estado.key}`)}>{estado.emoji} </span>}
                      {t('muni.checkedAgo', { d: String(f.days) })}
                    </>
              }
            />
          )
        }}
      />

      <Box sx={{ mt: 3 }}>
        <TituloDeSeccion icono={<DownloadIcon fontSize="small" />}>{t('muni.download')}</TituloDeSeccion>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('muni.downloadNote')}</Typography>
        {/* Los ficheros se componen **en el navegador** con lo que la página ya ha pedido,
            igual que el GPX: cero coste de servidor y ninguna ruta nueva que mantener. */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => baja(csvDe(datos), `${datos.ine}-fuentes.csv`, 'text/csv')}>CSV</Button>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => baja(geojsonDe(datos), `${datos.ine}-fuentes.geojson`, 'application/geo+json')}>GeoJSON</Button>
        </Box>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
        {t('muni.licence')}
      </Typography>
    </Box>
  )
}

/** Comillas alrededor y dobladas dentro: un topónimo con una coma parte la fila en dos. */
function escapaCSV(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csvDe(r: MunicipalReport): string {
  const cab = 'id,nombre,latitud,longitud,tipo,potabilidad_declarada,tiene_foto,resenas,ultimo_estado,dias_desde_la_ultima,incidencias_abiertas\n'
  return cab + r.items.map((f) => [
    f.id, f.name ?? '', f.latitude.toFixed(6), f.longitude.toFixed(6), f.source ?? '',
    f.drinkable ?? '', f.hasPhoto ? 'sí' : 'no', String(f.reviews), f.lastStatus ?? '',
    f.days == null ? '' : String(f.days), String(f.openReports),
  ].map(escapaCSV).join(',')).join('\n') + '\n'
}

function geojsonDe(r: MunicipalReport): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    name: `Fuentes de ${r.municipality} (INE ${r.ine})`,
    // La atribución viaja DENTRO del fichero: un GeoJSON se reenvía suelto por correo,
    // sin la página que lo explicaba.
    attribution: 'FontApp y sus colaboradores · OpenStreetMap (ODbL) · ICGC/ACA (CC BY 4.0)',
    features: r.items.map((f) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [f.longitude, f.latitude] },
      properties: {
        id: f.id, nombre: f.name, tipo: f.source, potabilidad_declarada: f.drinkable,
        tiene_foto: f.hasPhoto, resenas: f.reviews, ultimo_estado: f.lastStatus,
        incidencias_abiertas: f.openReports,
      },
    })),
  }, null, 2)
}

function baja(texto: string, nombre: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }))
  const a = document.createElement('a')
  a.href = url; a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
