// Capas del mapa que puede elegir el usuario.
//
// Añadir una capa es añadir una entrada aquí: el selector se construye solo, en el
// mapa principal y en el de reubicar. La elegida se recuerda entre sesiones.
//
// Sobre las fuentes de teselas: son servidores ajenos y gratuitos, así que hay que
// atribuirlos (lo pide la licencia y lo pinta Leaflet en la esquina) y no abusar.
// Si algún día el tráfico crece de verdad, lo correcto es pagar un proveedor o
// montar una caché propia, no exprimir servidores de voluntarios.

export interface MapLayer {
  id: string
  /** Clave de i18n con el nombre visible. */
  labelKey: string
  url: string
  attribution: string
  maxZoom: number
  /** Solo cubre España; fuera se ve en blanco. */
  soloES?: boolean
}

export const MAP_LAYERS: MapLayer[] = [
  {
    id: 'mapa',
    labelKey: 'layer.map',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  {
    id: 'topo',
    // Curvas de nivel y senderos: es la capa útil caminando.
    labelKey: 'layer.topo',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Dades &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, estil &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
  },
  {
    // Mapa base oficial del ICGC. El servicio WMTS publica teselas XYZ en
    // Web Mercator, por lo que Leaflet puede consumirlo sin ningún adaptador.
    id: 'icgc',
    labelKey: 'layer.icgc',
    url: 'https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/topografic/MON3857NW/{z}/{x}/{y}.png',
    attribution: 'Catalunya &copy; <a href="https://www.icgc.cat/">ICGC</a> (CC BY 4.0); resta del món &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  },
  {
    id: 'satelit',
    labelKey: 'layer.satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imatges &copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  {
    // Ortofoto del IGN: bastante más detalle que la global sobre España, y con
    // licencia CC BY 4.0. Es LA capa para colocar un pin bajo arbolado.
    id: 'pnoa',
    labelKey: 'layer.pnoa',
    url: 'https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&format=image/jpeg&tilematrix={z}&tilerow={y}&tilecol={x}',
    attribution: 'Ortofoto PNOA &copy; <a href="https://www.ign.es">Instituto Geográfico Nacional</a> (CC BY 4.0)',
    maxZoom: 19,
    soloES: true,
  },
  {
    // El MTN rotula las fuentes con su topónimo: para esta app, oro.
    id: 'mtn',
    labelKey: 'layer.mtn',
    url: 'https://www.ign.es/wmts/mapa-raster?service=WMTS&request=GetTile&version=1.0.0&layer=MTN&style=default&tilematrixset=GoogleMapsCompatible&format=image/jpeg&tilematrix={z}&tilerow={y}&tilecol={x}',
    attribution: 'MTN &copy; <a href="https://www.ign.es">Instituto Geográfico Nacional</a> (CC BY 4.0)',
    maxZoom: 18,
    soloES: true,
  },
]

const KEY = 'fontapp_map_layer'

export function savedLayer(): MapLayer {
  try {
    const id = localStorage.getItem(KEY)
    return MAP_LAYERS.find((l) => l.id === id) ?? MAP_LAYERS[0]
  } catch {
    return MAP_LAYERS[0]
  }
}

export function saveLayer(id: string) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* sin almacenamiento: se usará la capa por defecto en cada visita */
  }
}
