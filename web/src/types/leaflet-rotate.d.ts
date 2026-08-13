// `leaflet-rotate` no trae tipos. Solo declaramos lo que usamos: el plugin parchea
// `L.Map` al importarlo, así que basta con ampliar los tipos de Leaflet.
declare module 'leaflet-rotate'

import 'leaflet'

declare module 'leaflet' {
  interface MapOptions {
    /** Habilita la rotación del mapa. Sin esto el plugin no hace nada. */
    rotate?: boolean
    /** Rotar con dos dedos (el gesto de pellizcar y girar). */
    touchRotate?: boolean
    /** Rotar con teclado/rueda. Lo dejamos apagado. */
    shiftKeyRotate?: boolean
    /** Orientación inicial, en grados. */
    bearing?: number
  }

  interface LeafletEventHandlerFnMap {
    /** Lo dispara el plugin cada vez que cambia la orientación del mapa. */
    rotate?: LeafletEventHandlerFn
  }

  interface Map {
    /** Grados que está girado el mapa (0 = norte arriba). */
    getBearing(): number
    setBearing(grados: number): this
  }
}
