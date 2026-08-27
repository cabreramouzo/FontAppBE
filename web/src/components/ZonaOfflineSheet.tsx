import { useEffect, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import DownloadIcon from '@mui/icons-material/CloudDownloadOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import { apiFetch, assetUrl } from '../api/client'
import type { FontSummary } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { borraZona, guardaZona, zonaGuardada, type Zona } from '../lib/zonaAlmacen'
import { estimaMB, megas } from '../lib/zonaOffline'
import { timeAgo } from '../lib/time'
import { fijaParaOffline } from '../lib/fijarOffline'
import PhotoIcon from '@mui/icons-material/PhotoLibraryOutlined'
import MapIcon from '@mui/icons-material/MapOutlined'
import { savedLayer } from '../lib/mapLayers'
import { estimaMBTeselas, teselasDe, urlDeTesela } from '../lib/teselas'

/**
 * Guardar las fuentes de la zona que estás mirando, para andar sin cobertura.
 *
 * Es para el excursionista: sale el sábado a un valle que no conoce, no tiene GPX que
 * subir, y pierde la cobertura justo al meterse. El ciclista ya lo tiene resuelto por otro
 * lado —al importar su recorrido se le fijan sus fuentes— porque él sí sabe el viernes por
 * dónde va a ir.
 *
 * Los **datos** se guardan siempre; las **fotos** y el **mapa** se ofrecen después, con su
 * número y su peso delante. El orden no es casual: lo que la app viene a contestar se
 * contesta sin una sola tesela —la lista ordena por distancia y la flecha de los últimos
 * metros apunta con el GPS—, así que los datos van solos y al momento y lo demás es un
 * extra que se puede rechazar sin perder nada.
 *
 * Las teselas son de **servidores ajenos y gratuitos**, así que se guarda lo que estás
 * mirando y dos niveles de zoom más, no una comarca entera: eso serían miles de peticiones
 * a gente que nos deja usar su mapa. Si algún día hace falta de verdad una descarga de
 * región, el camino honesto es pagar un proveedor, no exprimir el de voluntarios.
 */
export function ZonaOfflineSheet({ map, onClose }: { map: LeafletMap; onClose?: () => void }) {
  const { t } = useI18n()
  const [zona, setZona] = useState<Zona | null | undefined>(undefined)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  /**
   * Las fotos de la zona, como **segundo paso**.
   *
   * Se guardan aparte de los datos y con la decisión de la persona porque son dos órdenes
   * de magnitud distintos: 110 fuentes son 42 KB y sus fotos pueden ser megas. Y sobre todo
   * porque la cifra **no se puede saber antes** de pedir la lista — hay que traer las
   * fuentes para contar cuántas tienen foto, así que preguntar antes sería preguntar a
   * ciegas.
   *
   * El orden importa: los datos se guardan siempre y al momento —que es lo que de verdad
   * hace falta en el monte— y las fotos son un extra que se ofrece después. Si dice que no,
   * no se ha perdido nada.
   */
  const [fotos, setFotos] = useState<string[]>([])
  const [bajandoFotos, setBajandoFotos] = useState(false)
  const [fotosGuardadas, setFotosGuardadas] = useState<{ n: number; bytes: number } | null>(null)
  const [teselas, setTeselas] = useState<string[]>([])
  const [bajandoMapa, setBajandoMapa] = useState(false)
  const [mapaGuardado, setMapaGuardado] = useState<{ n: number; bytes: number } | null>(null)

  useEffect(() => { void zonaGuardada().then(setZona) }, [])

  async function guarda() {
    setGuardando(true); setError('')
    try {
      // Los límites se leen AL PULSAR y no en el render: calculados antes, React no
      // repinta al mover el mapa y te llevarías la caja de la última vez que se pintó. Es
      // el mismo fallo que ya costó una prueba con el botón de exportar GPX.
      const b = map.getBounds()
      const params = new URLSearchParams({
        minLat: String(b.getSouth()), maxLat: String(b.getNorth()),
        minLong: String(b.getWest()), maxLong: String(b.getEast()),
      })
      const fuentes = await apiFetch<FontSummary[]>(`/fonts/in-bounds?${params}`)
      // Guardar una zona vacía y decirlo en verde sería lo peor posible: te vas al monte
      // creyendo que la llevas. Pasa con el mapa muy cerca o sobre una zona sin datos.
      if (fuentes.length === 0) {
        setError(t('zonaOff.empty'))
        return
      }
      const nueva: Zona = {
        minLat: b.getSouth(), maxLat: b.getNorth(), minLong: b.getWest(), maxLong: b.getEast(),
        cuando: new Date().toISOString(),
        fuentes,
      }
      await guardaZona(nueva)
      setZona(nueva)
      setFotosGuardadas(null)
      setFotos(fuentes.filter((f) => f.image).map((f) => assetUrl(f.image!)))
      // Las teselas de la capa QUE ESTÁS USANDO. Guardar las de OSM a quien camina con el
      // topográfico del IGN sería guardar un mapa que no va a mirar.
      setMapaGuardado(null)
      const capa = savedLayer()
      const z = Math.min(map.getZoom(), capa.maxZoom ?? 19)
      setTeselas(
        teselasDe({ minLat: b.getSouth(), maxLat: b.getNorth(), minLong: b.getWest(), maxLong: b.getEast() }, z)
          .map((t) => urlDeTesela(capa.url, t)),
      )
    } catch {
      setError(t('zonaOff.failed'))
    } finally {
      setGuardando(false)
    }
  }

  async function guardaFotos() {
    setBajandoFotos(true); setError('')
    try {
      // Van al caché FIJADO, así que el descarte por orden de llegada no se las lleva. Y
      // de paso dejan de pedirse al servidor: esto es tanto backup como caché.
      const r = await fijaParaOffline(fotos)
      setFotosGuardadas({ n: r.guardadas, bytes: r.bytes })
      if (r.guardadas === 0) setError(t('zonaOff.photosFailed'))
    } finally {
      setBajandoFotos(false)
    }
  }

  async function guardaMapa() {
    setBajandoMapa(true); setError('')
    try {
      const r = await fijaParaOffline(teselas, 300)
      setMapaGuardado({ n: r.guardadas, bytes: r.bytes })
      if (r.guardadas === 0) setError(t('zonaOff.tilesFailed'))
    } finally {
      setBajandoMapa(false)
    }
  }

  return (
    <Stack spacing={1.25}>
      <Typography variant="body2" color="text.secondary">{t('zonaOff.intro')}</Typography>

      {zona && (
        <Alert severity="success" icon={false} sx={{ py: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {t('zonaOff.saved', { n: String(zona.fuentes.length) })}
          </Typography>
          <Typography variant="body2">{timeAgo(zona.cuando, t)}</Typography>
        </Alert>
      )}

      <Button variant="contained" disableElevation startIcon={<DownloadIcon />} disabled={guardando}
              onClick={() => void guarda()} sx={{ textTransform: 'none', minHeight: 48 }}>
        {guardando ? t('zonaOff.saving') : t(zona ? 'zonaOff.replace' : 'zonaOff.save')}
      </Button>

      {/* Las fotos, con su número y su peso: quien decide tiene que ver la cifra. El peso
          es una estimación hasta que se bajan —489 KB de media, medido en producción— y se
          dice que lo es; después se enseña el tamaño real. */}
      {fotos.length > 0 && !fotosGuardadas && (
        <Button
          variant="outlined" startIcon={<PhotoIcon />} disabled={bajandoFotos}
          onClick={() => void guardaFotos()}
          sx={{ textTransform: 'none', minHeight: 48 }}
        >
          {bajandoFotos
            ? t('zonaOff.savingPhotos', { n: String(fotos.length) })
            : t('zonaOff.savePhotos', { n: String(fotos.length), mb: estimaMB(fotos.length) })}
        </Button>
      )}

      {fotosGuardadas && (
        <Alert severity="success" icon={false} sx={{ py: 0.5 }}>
          <Typography variant="body2">
            {fotosGuardadas.bytes > 0
              ? t('zonaOff.photosSaved', { n: String(fotosGuardadas.n), mb: megas(fotosGuardadas.bytes) })
              : t('zonaOff.photosSavedNoSize', { n: String(fotosGuardadas.n) })}
          </Typography>
        </Alert>
      )}

      {/* El mapa, tercero y también con la cifra delante. Va al caché fijado, así que el
          descarte no se lo lleva; el normal caduca a los 30 días y éste no. */}
      {teselas.length > 0 && !mapaGuardado && (
        <Button
          variant="outlined" startIcon={<MapIcon />} disabled={bajandoMapa}
          onClick={() => void guardaMapa()}
          sx={{ textTransform: 'none', minHeight: 48 }}
        >
          {bajandoMapa
            ? t('zonaOff.savingTiles', { n: String(teselas.length) })
            : t('zonaOff.saveTiles', { n: String(teselas.length), mb: estimaMBTeselas(teselas.length) })}
        </Button>
      )}

      {mapaGuardado && (
        <Alert severity="success" icon={false} sx={{ py: 0.5 }}>
          <Typography variant="body2">
            {t('zonaOff.tilesSaved', { n: String(mapaGuardado.n), mb: megas(mapaGuardado.bytes) })}
          </Typography>
        </Alert>
      )}

      {zona && (
        <Button startIcon={<DeleteIcon />} color="inherit"
                onClick={() => void borraZona().then(() => setZona(null))}
                sx={{ textTransform: 'none', minHeight: 48 }}>
          {t('zonaOff.delete')}
        </Button>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {/* Se dice lo que NO se guarda, y antes de salir al monte. Prometer «funciona sin
          cobertura» y que el mapa salga en blanco es peor que no prometer nada. */}
      <Typography variant="caption" color="text.secondary">{t('zonaOff.note')}</Typography>
      <Box sx={{ display: 'none' }} onClick={onClose} />
    </Stack>
  )
}
