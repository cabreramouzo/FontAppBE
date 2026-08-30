import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { FontSummary, MapCluster } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { statusIcon } from '../lib/statusMarker'
import { waterStatusInfo } from '../lib/waterStatus'
import { drinkableInfo, sourceInfo } from '../lib/waterType'
import { isStale, timeAgo } from '../lib/time'
import { nombreFuente } from '../lib/fontName'
import { CONFIDENCE_EMOJI, confidenceDetailKey, confidenceLabelKey, confidenceOf } from '../lib/confidence'
import { createComment, deleteComment, describeError, getGamificationScale, setFontPhoto, trackInteraction, uploadImage } from '../api/client'
import { prepararFoto } from '../lib/image'
import { useAuth } from '../auth/AuthContext'
import { enqueue, isOffline } from '../lib/outbox'

/**
 * Los estados que se pueden decir de un toque desde el globo del mapa.
 *
 * Los mismos tres que el atajo de después de la foto y los de la lista de la ruta, y por
 * las mismas razones: **`unknown` no dice nada** viniendo de alguien que está delante, y
 * **`gone` es el estado más caro** —dos testimonios retiran la fuente del mapa—, así que
 * no puede estar a un toque en un globo que se abre sin querer. Para eso está la ficha.
 */
const ESTADOS_RAPIDOS = ['flowing', 'trickle', 'dry'] as const

/**
 * Cuánto se puede deshacer una reseña puesta de un toque.
 *
 * Diez segundos: lo que tarda alguien en darse cuenta de que ha pulsado el chip que no
 * era. Pasado eso queda como cualquier otra reseña y se borra desde la ficha — dejar el
 * botón para siempre convertiría el globo en un sitio donde se edita, y no lo es.
 */
const DESHACER_MS = 10_000

/**
 * Las gotas que paga la primera foto de una fuente, para poder decirlo en el globo.
 *
 * **No se escribe aquí**: viene de `/gamification/scale`, como todo lo demás del baremo.
 * Se ha recalibrado varias veces —la primera foto y la primera reseña llegaron a
 * intercambiar sus valores— y un cartel que promete 120 cuando el servidor paga otra cosa
 * es peor que no poner cartel. Se pide una vez por sesión y se comparte.
 */
let gotasFoto: Promise<number | null> | null = null
function gotasPrimeraFoto(): Promise<number | null> {
  if (!gotasFoto) {
    gotasFoto = getGamificationScale()
      .then((e) => e.kinds.find((k) => k.kind === 'firstPhoto')?.base ?? null)
      .catch(() => null)
  }
  return gotasFoto
}

const HEATMAP_MAX_ZOOM = 6

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

// Marcadores agrupados (clustering) gestionados imperativamente con leaflet.markercluster,
// para no depender de un wrapper de react-leaflet. Los popups navegan por SPA.
//
// La fuente seleccionada NO entra en el cluster: se añade suelta sobre el mapa para
// que quede siempre visible (nunca se combina con las demás al alejar el zoom).
export function ClusteredMarkers({
  fonts, clusters, selectedID,
}: { fonts: FontSummary[]; clusters: MapCluster[]; selectedID?: string | null }) {
  const map = useMap()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { user } = useAuth()
  // Fuente cuyo popup ha cerrado el usuario a mano. Los marcadores se reconstruyen con
  // cada movimiento del mapa, y sin esto el popup volvía a salir una y otra vez.
  const cerradoPorElUsuario = useRef<string | null>(null)
  // Y la inversa: fuente cuyo popup está abierto AHORA, para reponerlo. Reconstruir los
  // marcadores destruye el popup, y eso solo se compensaba para la fuente enfocada; el
  // que abres tocando un pin —el caso normal— se perdía. Con el GPS detrás de ti el mapa
  // se recentra cada pocos segundos, así que desaparecía solo al segundo de abrirlo.
  const popupAbierto = useRef<string | null>(null)

  useEffect(() => {
    const group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 })
    const serverClusters = L.layerGroup()
    let selectedMarker: L.Marker | null = null
    const porID = new Map<string, L.Marker>()

    // Los dos únicos cierres deliberados: el aspa del popup y tocar el mapa.
    const cerrarAMano = () => {
      if (popupAbierto.current === selectedID) cerradoPorElUsuario.current = selectedID ?? null
      popupAbierto.current = null
    }
    map.on('click', cerrarAMano)

    /**
     * Decir cómo está la fuente de un toque, sin salir del mapa.
     *
     * Es el camino más corto entre estar delante de una fuente y contarlo: antes había que
     * tocar el pin, tocar el globo, esperar la ficha y buscar el botón. Con 116 reseñas
     * sobre 160.738 fuentes, acortar esto es lo único que mueve la aguja.
     *
     * **Un solo escuchador delegado en el contenedor, en captura y parando la
     * propagación.** Enganchado al elemento del globo, el clic sí publicaba —comprobado en
     * la base— pero el globo **se cerraba en el mismo gesto**: `L.DomEvent
     * .disableClickPropagation` no bastó, el clic llegó al mapa y `cerrarAMano` lo cerró.
     * Desde fuera parecía que no hacía nada, porque la confirmación se escribía en un nodo
     * ya desprendido del documento.
     *
     * Delegando se para el evento antes de que llegue a nadie, y de paso da igual qué
     * instancia del nodo del globo esté viva: el id de la fuente viaja en el propio HTML
     * (`data-font`) en vez de en una clausura.
     */
    const alTocarChip = (ev: Event) => {
      // Cualquier botón de este bloque, no solo los de estado. El de deshacer no lleva
      // `data-estado` y por eso se escapaba al mapa: el globo se cerraba en el mismo gesto
      // y el mensaje acababa escrito en un nodo ya desprendido — exactamente el fallo que
      // esta delegación vino a arreglar, repetido en el botón nuevo.
      const objetivo = (ev.target as Element | null)?.closest?.('.popup-quick button, .popup-quick .popup-photo')
      if (!objetivo) return
      const caja = objetivo.closest('.popup-quick') as HTMLElement | null
      const fontID = caja?.dataset.font
      if (!caja || !fontID) return
      // Apartar el toque del mapa vale para todo lo de este bloque —incluida la etiqueta
      // de la foto, que si no cierra el globo y deja el `<input>` desprendido, con lo que
      // el `change` no llegaría nunca aquí: el mismo fallo de siempre, en un tercer
      // control—. Lo que NO se le puede quitar a la etiqueta es su comportamiento por
      // defecto, que es lo único que abre la cámara.
      ev.stopPropagation()
      if (!objetivo.matches('button')) return
      ev.preventDefault()

      // Deshacer: borra la reseña que se acaba de crear y devuelve el pin a su color.
      if (objetivo.classList.contains('popup-undo')) {
        const reseña = caja.dataset.resena
        if (!reseña) return
        caja.innerHTML = `<span class="muted small">${escapeHtml(t('popup.sending'))}</span>`
        void deleteComment(fontID, reseña)
          .then(() => {
            caja.innerHTML = `<span class="muted small">${escapeHtml(t('popup.undone'))}</span>`
            porID.get(fontID)?.setIcon(statusIcon(caja.dataset.antes || null, fontID === selectedID))
          })
          .catch((e) => {
            caja.innerHTML = `<span class="muted small">${escapeHtml(describeError(e, t))}</span>`
          })
        return
      }

      const estado = objetivo.getAttribute('data-estado')
      if (!estado) return
      caja.innerHTML = `<span class="muted small">${escapeHtml(t('popup.sending'))}</span>`
      void (async () => {
        try {
          const creada = await createComment(fontID, { waterStatus: estado })
          // **Con deshacer.** Un toque de más aquí no es inocuo: una reseña cambia el color
          // del pin para todo el mundo, refresca la frescura, paga gotas y, si dice que
          // sale agua, cierra sola las incidencias abiertas de esa fuente. Y los chips
          // están dentro de un globo que se abre al rozar un pin, con objetivos de unos
          // 50 px. Poder deshacerlo convierte un error irreversible en uno recuperable,
          // que es más barato que hacer los objetivos más grandes o pedir confirmación.
          //
          // Solo se ofrece un rato: pasado eso queda como cualquier otra reseña y se borra
          // desde la ficha, que es donde vive el resto de lo que has escrito.
          caja.innerHTML =
            `<span class="muted small">${escapeHtml(t('popup.thanks'))}</span>` +
            (creada.id ? ` <button type="button" class="popup-undo">${escapeHtml(t('popup.undo'))}</button>` : '')
          // ## Y después, la foto — nunca antes
          //
          // El atajo del globo hace más probable que una reseña llegue **sin foto y sin
          // texto**, y eso preocupaba con razón. Pero medido en producción, la reseña rica
          // ya era minoría antes de existir el atajo: de 122 reseñas, 39 llevaban texto y
          // **21 llevaban foto**. Así que lo que hay que hacer no es entorpecer el camino
          // corto —lo escaso es la señal, no la riqueza— sino **encadenar** el paso
          // siguiente cuando el valor ya está guardado.
          //
          // Se pide la **foto y no el texto**, por orden de utilidad para quien se va a
          // desviar: estado → foto → valoración → texto. Y **solo si la fuente no tiene
          // ninguna** (hoy, 64.150 de 64.295): sustituir una que ya existe no es de
          // cualquiera y además invita a la guerra de ediciones.
          if (caja.dataset.sinfoto) void ofreceFoto(caja)
          if (creada.id) {
            caja.dataset.resena = creada.id
            // Pasado el plazo se quita el botón y queda como cualquier otra reseña: se
            // borra desde la ficha, que es donde vive el resto de lo que has escrito.
            window.setTimeout(() => { caja.querySelector('.popup-undo')?.remove() }, DESHACER_MS)
          }
          // El pin cambia de color al momento: es la prueba de que ha servido de algo, y
          // sin ella hay que esperar a que el mapa se recargue solo.
          porID.get(fontID)?.setIcon(statusIcon(estado, fontID === selectedID))
          trackInteraction('map_quick_review')
        } catch (e) {
          if (isOffline(e)) {
            // En el monte, que es donde se sabe cómo está la fuente, no hay cobertura.
            await enqueue({ kind: 'comment', fontID, data: { waterStatus: estado } })
            caja.innerHTML = `<span class="muted small">${escapeHtml(t('offline.savedUpdate'))}</span>`
            // También sin cobertura, que es donde más se está delante de la fuente: la
            // foto se encola igual. Las gotas no se sabrán si el baremo no está cacheado,
            // y entonces el rótulo va sin cifra en vez de inventarse una.
            if (caja.dataset.sinfoto) void ofreceFoto(caja)
            porID.get(fontID)?.setIcon(statusIcon(estado, fontID === selectedID))
          } else {
            caja.innerHTML = `<span class="muted small">${escapeHtml(describeError(e, t))}</span>`
          }
        }
      })()
    }
    /** Añade al globo el ofrecimiento de foto, con las gotas que paga si se saben. */
    async function ofreceFoto(caja: HTMLElement) {
      const gotas = await gotasPrimeraFoto()
      // La caja pudo cerrarse mientras llegaba el baremo.
      if (!caja.isConnected) return
      const rotulo = gotas
        ? t('popup.addPhotoDrops', { n: String(gotas) })
        : t('popup.addPhoto')
      caja.insertAdjacentHTML('beforeend',
        `<label class="popup-photo">` +
        `<input type="file" accept="image/*" capture="environment" hidden>` +
        `📷 ${escapeHtml(rotulo)}</label>`)
    }

    /** La foto elegida desde el globo: se sube y pasa a ser la portada de la fuente. */
    const alElegirFoto = (ev: Event) => {
      const input = ev.target as HTMLInputElement | null
      const caja = input?.closest?.('.popup-quick') as HTMLElement | null
      const fontID = caja?.dataset.font
      const file = input?.files?.[0]
      if (!caja || !fontID || !file) return
      ev.stopPropagation()
      caja.innerHTML = `<span class="muted small">${escapeHtml(t('popup.sending'))}</span>`
      void (async () => {
        // El EXIF se lee y la imagen se comprime en el mismo sitio que en el resto de
        // subidas: `prepararFoto` existe justo para que el orden no sea una decisión. Va
        // FUERA del try, y una sola vez: preparándola otra vez en la rama de la bandeja se
        // encolaría sin el EXIF, que es lo único que después no se puede recuperar.
        const { photo, meta } = await prepararFoto(file)
        try {
          const image = await uploadImage(photo, meta)
          await setFontPhoto(fontID, image)
          caja.innerHTML = `<span class="muted small">${escapeHtml(t('popup.photoThanks'))}</span>`
          trackInteraction('map_quick_photo')
        } catch (e) {
          if (isOffline(e)) {
            // Delante de una fuente sin foto es justo donde peor se está de cobertura.
            await enqueue({ kind: 'photo', fontID, photo, photoName: photo.name, photoMeta: meta })
            caja.innerHTML = `<span class="muted small">${escapeHtml(t('offline.savedUpdate'))}</span>`
          } else {
            caja.innerHTML = `<span class="muted small">${escapeHtml(describeError(e, t))}</span>`
          }
        }
      })()
    }

    const contenedorMapa = map.getContainer()
    contenedorMapa.addEventListener('click', alTocarChip, true)
    contenedorMapa.addEventListener('change', alElegirFoto, true)

    for (const f of fonts) {
      const isSelected = !!f.id && f.id === selectedID
      const marker = L.marker([f.latitude, f.longitude], { icon: statusIcon(f.lastWaterStatus, isSelected) })
      const ws = waterStatusInfo(f.lastWaterStatus)
      const src = sourceInfo(f.source)
      const dr = drinkableInfo(f.drinkable)
      const stale = f.lastUpdate ? isStale(f.lastUpdate) : false
      const confidence = confidenceOf(f)
      const srcText = src ? `${src.emoji} ${t(src.labelKey)}` : ''
      const drText = dr ? `${dr.emoji} ${t(dr.labelKey)}` : ''
      const el = document.createElement('div')
      // ## Qué es pulsable aquí, y por qué cambió
      //
      // Antes **todo el globo** era un enlace a la ficha, con un botón dentro como señal.
      // Tenía sentido cuando esa era la única acción y el botón medía 142×40 px sobre un
      // mapa en movimiento. Ya no:
      //
      //  · el objetivo pequeño se arregló —el enlace ocupa ahora el ancho y 48 px de alto—,
      //    así que la razón original desapareció;
      //  · con los chips de estado hay **controles dentro de un control**, que es lo que la
      //    guía de Apple dice que no se haga: apuntar a «poca agua» y caer dos milímetros
      //    arriba no fallaba el chip, te **sacaba del mapa**, que es el peor error posible
      //    porque pierdes el contexto;
      //  · y la jerarquía decía lo contrario de lo que quiere esta app: lo más llamativo
      //    era un botón relleno que lleva a **leer**, cuando lo que hace falta es que la
      //    gente **cuente** cómo está la fuente.
      //
      // Así que la tarjeta ya **no** es pulsable, el enlace baja al final como salida —no
      // como acción principal— y los chips suben justo debajo del estado. El orden se lee
      // solo: qué es → cómo está → dime cómo está ahora → ver más.
      //
      // Sigue siendo un `<a>` de verdad y no un `<div>` con `onclick`, para que funcionen
      // el teclado, «abrir en pestaña nueva» y los lectores de pantalla.
      el.innerHTML = `
        <div class="popup-card">
          <strong>${escapeHtml(nombreFuente(f, t))}</strong>
          <div class="muted small">${srcText}${src && dr ? ' · ' : ''}${drText}</div>
          ${ws ? `<div class="badge">${ws.emoji} ${t(`status.${ws.key}`)}</div>` : ''}
          <div class="muted small" title="${escapeHtml(t(confidenceDetailKey(confidence)))}">${CONFIDENCE_EMOJI[confidence]} ${escapeHtml(t(confidenceLabelKey(confidence)))}</div>
          ${f.lastUpdate ? `<div class="muted small">${t('popup.updated', { when: timeAgo(f.lastUpdate, t) })}${stale ? ' ⚠️' : ''}</div>` : ''}
        </div>
        ${user ? `<div class="popup-quick" data-font="${f.id}" data-antes="${f.lastWaterStatus ?? ''}" data-sinfoto="${f.image ? '' : '1'}" role="group" aria-label="${escapeHtml(t('popup.howIsIt'))}">
          <span class="muted small">${escapeHtml(t('popup.howIsIt'))}</span>
          <div class="popup-quick-row">
            ${ESTADOS_RAPIDOS.map((e) => {
              const info = waterStatusInfo(e)
              return `<button type="button" data-estado="${e}" title="${escapeHtml(t(`status.${e}`))}">${info?.emoji ?? ''} ${escapeHtml(t(`status.${e}`))}</button>`
            }).join('')}
          </div>
        </div>` : ''}
        <a href="/fonts/${f.id}" class="popup-link">${t('popup.detail')}</a>`
      el.querySelector('.popup-link')?.addEventListener('click', (e) => {
        e.preventDefault()
        navigate(`/fonts/${f.id}`)
      })

      // autoPan off: al enfocar centramos el pin nosotros (arriba, sobre la lista);
      // el autoPan de Leaflet lo recentraba y quedaba tapado por el bottom-sheet.
      marker.bindPopup(el, { autoPan: false })
      marker.on('popupopen', () => {
        popupAbierto.current = f.id
        // Abrir el popup de otra fuente cuenta como descartar el de la enfocada: si no,
        // al reponer ganaría ella y le robaría el popup al pin que acabas de tocar.
        cerradoPorElUsuario.current = isSelected ? null : (selectedID ?? null)
        // El aspa es el ÚNICO cierre que se apunta desde aquí. `popupclose` no vale:
        // markercluster quita y repone marcadores al agrupar, y nuestro propio ciclo de
        // vida los quita enteros — los dos disparan `popupclose` sin que nadie haya
        // cerrado nada, y eso es justo lo que hay que reponer, no olvidar.
        const aspa = marker.getPopup()?.getElement()?.querySelector('.leaflet-popup-close-button')
        aspa?.addEventListener('click', cerrarAMano, { once: true })
      })
      porID.set(f.id, marker)
      if (isSelected) {
        // Suelta sobre el mapa (fuera del cluster) → siempre visible.
        selectedMarker = marker
        marker.addTo(map)
      } else {
        group.addLayer(marker)
      }
    }
    map.addLayer(group)

    for (const cluster of clusters) {
      const density = cluster.count < 100 ? 'small' : cluster.count < 1_000 ? 'medium' : 'large'
      const size = density === 'small' ? 34 : density === 'medium' ? 40 : 48
      const marker = L.marker([cluster.latitude, cluster.longitude], {
        icon: L.divIcon({
          className: `server-map-cluster server-map-cluster--${density}`,
          html: `<span>${cluster.count.toLocaleString()}</span>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        title: t('map.clusterCount', { n: cluster.count }),
      })
      marker.on('click', () => {
        trackInteraction('map_cluster_click')
        map.setView([cluster.latitude, cluster.longitude], Math.min(18, map.getZoom() + 2))
      })
      serverClusters.addLayer(marker)
    }

    // En una vista de país/continente, decenas de etiquetas numéricas esconden justo
    // lo que se quiere explorar. El mismo agregado exacto se dibuja entonces como una
    // capa de densidad Canvas; al acercarse reaparecen clusters tocables y después pins.
    const heatCanvas = document.createElement('canvas')
    heatCanvas.className = 'server-map-heatmap'
    heatCanvas.setAttribute('aria-hidden', 'true')
    map.getPanes().overlayPane.appendChild(heatCanvas)
    let drawFrame: number | null = null

    const heatIsVisible = () => clusters.length > 0 && map.getZoom() <= HEATMAP_MAX_ZOOM
    const drawHeatmap = () => {
      drawFrame = null
      if (!heatIsVisible()) {
        heatCanvas.hidden = true
        return
      }
      heatCanvas.hidden = false
      const size = map.getSize()
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      heatCanvas.width = Math.round(size.x * ratio)
      heatCanvas.height = Math.round(size.y * ratio)
      heatCanvas.style.width = `${size.x}px`
      heatCanvas.style.height = `${size.y}px`
      L.DomUtil.setPosition(heatCanvas, map.containerPointToLayerPoint([0, 0]))
      const ctx = heatCanvas.getContext('2d')
      if (!ctx) return
      ctx.scale(ratio, ratio)
      ctx.clearRect(0, 0, size.x, size.y)
      const maxLog = Math.max(...clusters.map((c) => Math.log1p(c.count)), 1)

      // Los focos ligeros se pintan primero y los densos encima: así una gran ciudad
      // conserva un núcleo reconocible sin convertir todo el territorio en una mancha.
      for (const cluster of [...clusters].sort((a, b) => a.count - b.count)) {
        const point = map.latLngToContainerPoint([cluster.latitude, cluster.longitude])
        const weight = Math.log1p(cluster.count) / maxLog
        const radius = 22 + 28 * weight
        if (point.x < -radius || point.y < -radius || point.x > size.x + radius || point.y > size.y + radius) continue
        const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius)
        gradient.addColorStop(0, `rgba(239, 83, 80, ${0.32 + 0.28 * weight})`)
        gradient.addColorStop(0.32, `rgba(251, 192, 45, ${0.24 + 0.20 * weight})`)
        gradient.addColorStop(0.68, `rgba(102, 187, 106, ${0.12 + 0.14 * weight})`)
        gradient.addColorStop(1, 'rgba(102, 187, 106, 0)')
        ctx.fillStyle = gradient
        ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2)
      }
    }
    const scheduleHeatmap = () => {
      if (drawFrame === null) drawFrame = window.requestAnimationFrame(drawHeatmap)
    }
    const syncDensityMode = () => {
      if (heatIsVisible()) {
        if (map.hasLayer(serverClusters)) map.removeLayer(serverClusters)
      } else if (clusters.length > 0 && !map.hasLayer(serverClusters)) {
        map.addLayer(serverClusters)
      }
      scheduleHeatmap()
    }
    const zoomIntoHeat = (event: L.LeafletMouseEvent) => {
      if (!heatIsVisible()) return
      const click = map.latLngToContainerPoint(event.latlng)
      const closest = clusters.reduce<{ cluster: MapCluster; distance: number } | null>((best, cluster) => {
        const point = map.latLngToContainerPoint([cluster.latitude, cluster.longitude])
        const distance = point.distanceTo(click)
        return !best || distance < best.distance ? { cluster, distance } : best
      }, null)
      if (closest && closest.distance <= 50) {
        trackInteraction('map_heatmap_click')
        map.setView([closest.cluster.latitude, closest.cluster.longitude], map.getZoom() + 2)
      }
    }
    map.on('move zoom resize', scheduleHeatmap)
    map.on('zoomend', syncDensityMode)
    map.on('click', zoomIntoHeat)
    syncDensityMode()

    // Repone el popup que estuviera abierto. Manda el seleccionado —salvo que el usuario
    // ya lo hubiera descartado— y si no, el que abrió tocando un pin. Nunca movemos el
    // mapa: el encuadre es cosa de <FocusOn>.
    const reponer = () => {
      if (selectedMarker && cerradoPorElUsuario.current !== selectedID) {
        if (!selectedMarker.isPopupOpen()) selectedMarker.openPopup()
        return
      }
      const m = popupAbierto.current ? porID.get(popupAbierto.current) : undefined
      if (m && map.hasLayer(m) && !m.isPopupOpen()) m.openPopup()
    }
    reponer()
    // Al hacer zoom, markercluster agrupa y desagrupa: quita el marcador y lo vuelve a
    // poner sin que esto se reconstruya, así que el popup también hay que reponerlo ahí.
    group.on('animationend', reponer)

    return () => {
      map.off('click', cerrarAMano)
      contenedorMapa.removeEventListener('click', alTocarChip, true)
      contenedorMapa.removeEventListener('change', alElegirFoto, true)
      map.off('click', zoomIntoHeat)
      map.off('move zoom resize', scheduleHeatmap)
      map.off('zoomend', syncDensityMode)
      group.off('animationend', reponer)
      map.removeLayer(group)
      if (map.hasLayer(serverClusters)) map.removeLayer(serverClusters)
      if (drawFrame !== null) window.cancelAnimationFrame(drawFrame)
      heatCanvas.remove()
      if (selectedMarker) map.removeLayer(selectedMarker)
    }
  }, [fonts, clusters, map, navigate, t, selectedID])

  return null
}
