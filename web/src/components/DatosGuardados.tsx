import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useI18n } from '../i18n/I18nContext'
import { mideAlmacen, ocupado, vaciaParte, type Parte, type Recuento } from '../lib/almacen'
import { formateaTamano } from '../lib/tamanos'
import { borraZona, zonaGuardada, type Zona } from '../lib/zonaAlmacen'

/**
 * Qué guarda la app en este aparato, y un botón para vaciar cada cosa.
 *
 * Se llamaba «Espacio en el móvil» y el nombre decía lo contrario de lo que hace: parecía
 * que fueras a gestionar el almacenamiento del teléfono, cuando esto es **lo que FontApp
 * guarda dentro de él**. Tampoco se llama «caché»: es la palabra exacta y no la entiende
 * casi nadie fuera del oficio.
 *
 * Existe porque el caché **fijado** —las fotos y el mapa de una zona guardada— no lo
 * recorta el LRU ni lo caduca nada, a propósito: para eso se guarda. El precio es que era
 * lo único de la app que crecía sin techo y **sin puerta de salida**; quien guardara varias
 * zonas no tenía forma de recuperar ese espacio salvo desinstalando.
 *
 * El orden es de más a menos deliberado: primero lo que la persona guardó a propósito
 * (zona, fijado) y después lo que se llenó solo (mapa navegado, fotos vistas, respuestas).
 * Lo primero avisa de qué se pierde; lo segundo se vacía sin ceremonia porque se repone
 * con la siguiente visita.
 */
/** `sinTitulo`: cuando ya lo pone la pantalla que la contiene, para no repetirlo. */
export function DatosGuardados({ sinTitulo = false }: { sinTitulo?: boolean }) {
  const { t, lang } = useI18n()
  const [n, setN] = useState<Recuento | null>(null)
  const [total, setTotal] = useState<{ usado: number; libre: number | null } | null>(null)
  const [zona, setZona] = useState<Zona | null>(null)
  const [haySW, setHaySW] = useState(true)

  const mide = useCallback(async () => {
    setHaySW(Boolean(navigator.serviceWorker?.controller))
    setN(await mideAlmacen())
    setTotal(await ocupado())
    setZona(await zonaGuardada())
  }, [])

  useEffect(() => { void mide() }, [mide])

  async function vacia(cual: Parte) {
    await vaciaParte(cual)
    await mide()
  }

  const filas: { clave: Parte; etiqueta: string; unidad: string }[] = [
    { clave: 'fijado', etiqueta: t('storage.pinned'), unidad: t('storage.items') },
    { clave: 'teselas', etiqueta: t('storage.tiles'), unidad: t('storage.tilesUnit') },
    { clave: 'fotos', etiqueta: t('storage.photos'), unidad: t('storage.items') },
    { clave: 'api', etiqueta: t('storage.api'), unidad: t('storage.items') },
  ]

  return (
    <Box component="section" sx={{ mb: 2 }}>
      {!sinTitulo && <Typography variant="h6" gutterBottom>{t('storage.title')}</Typography>}

      {/* La cifra total sale de `navigator.storage.estimate()`, que es del origen entero y
          aproximada. Por eso va sola y NUNCA repartida por filas: repartirla sería
          inventarse cuánto ocupa cada cosa. Si el navegador no la da, no se pinta. */}
      {total && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {total.libre !== null
            ? t('storage.used', { mb: formateaTamano(total.usado, lang), libre: formateaTamano(total.libre, lang) })
            : t('storage.usedOnly', { mb: formateaTamano(total.usado, lang) })}
        </Typography>
      )}

      {/* Sin service worker no se pueden leer los cachés, y decía «todavía no hay nada
          guardado» — que es falso y encima contradecía la fila de justo debajo, donde la
          zona guardada (que vive en IndexedDB y sí se lee) enseñaba sus 110 fuentes. Lo
          que pasa es que los contadores no se pueden medir, no que no haya nada. */}
      {!haySW && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {t('storage.noSW')}
        </Typography>
      )}

      {/* La zona guardada vive en IndexedDB y no en un caché, así que se borra por su
          propio camino. Se pinta aquí porque para quien mira esta pantalla es una cosa
          más que ocupa sitio, y no le importa dónde la hayamos metido. */}
      {zona && (
        <Fila
          etiqueta={t('storage.zone')}
          valor={t('storage.fonts', { n: String(zona.fuentes.length) })}
          onVaciar={() => void borraZona().then(mide)}
          vaciar={t('storage.empty')}
        />
      )}

      {n && filas.map((f) => (
        <Fila
          key={f.clave}
          etiqueta={f.etiqueta}
          valor={n[f.clave] > 0 ? `${n[f.clave]} ${f.unidad}` : t('storage.none')}
          onVaciar={n[f.clave] > 0 ? () => void vacia(f.clave) : undefined}
          vaciar={t('storage.empty')}
        />
      ))}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {t('storage.pinnedHint')}
      </Typography>
      {/* Lo que NO se puede tocar se dice en voz alta: quien llega a una pantalla de
          «vaciar» viene con miedo a perder algo suyo, y esto contesta esa pregunta. */}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {t('storage.safe')}
      </Typography>
    </Box>
  )
}

function Fila({ etiqueta, valor, onVaciar, vaciar }: {
  etiqueta: string; valor: string; onVaciar?: () => void; vaciar: string
}) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.75, borderTop: 1, borderColor: 'divider' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{etiqueta}</Typography>
        <Typography variant="caption" color="text.secondary">{valor}</Typography>
      </Box>
      {onVaciar && (
        <Button size="small" color="inherit" onClick={onVaciar} sx={{ textTransform: 'none', minHeight: 40 }}>
          {vaciar}
        </Button>
      )}
    </Stack>
  )
}
