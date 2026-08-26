import { Component } from 'react'
import { recargaSiEsTrozoCaducado } from '../lib/staleChunk'
import type { ErrorInfo, ReactNode } from 'react'

/**
 * La red de seguridad: un error al pintar deja de apagar la aplicación entera.
 *
 * Sin esto, React desmonta **todo el árbol** cuando un componente lanza, y lo que queda
 * es el fondo del `body`: una pantalla negra, sin barra, sin pie y sin nada que tocar.
 * No es un fallo hipotético — ha pasado tres veces, y siempre por lo mismo: un campo
 * opcional que el servidor omite en vez de mandar `null`, y un `undefined.algo` en el
 * cliente. Cada vez, el precio de que faltara un dato pequeño fue la app completa.
 *
 * El arreglo de cada caso concreto es leer a la defensiva donde toca. Esto es lo otro:
 * que el precio no vuelva a ser desproporcionado. Peor caso, se pierde una pantalla.
 *
 * Va por dentro del layout a propósito, no envolviéndolo: así la barra y el pie
 * sobreviven y desde la pantalla rota se puede navegar a otra sin recargar.
 *
 * `key={pathname}` desde donde se usa: sin eso, una vez roto se queda roto para toda la
 * sesión, porque el estado del error no se limpia al cambiar de ruta.
 */
interface Props {
  children: ReactNode
  /** Se pinta cuando algo revienta. Es texto plano y ya traducido. */
  mensaje: string
  reintentar: string
}

interface State {
  roto: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { roto: false }

  static getDerivedStateFromError(): State {
    return { roto: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Antes de dar la pantalla por rota: si lo que ha fallado es cargar un trozo de la
    // app, no es un fallo de la pantalla — es que se ha desplegado una versión nueva y
    // esta pestaña sigue pidiendo ficheros que ya no existen. Se recarga una vez y ya.
    // Decirle a la persona «esta pantalla ha fallado» le echa la culpa a la página que
    // acaba de abrir y le ofrece justo lo que no toca.
    if (recargaSiEsTrozoCaducado(error)) return
    // A la consola y nada más: no hay servicio de errores en este proyecto y mandar
    // trazas a un tercero sería añadir una dependencia y un asunto de privacidad para
    // resolver un problema que se ve igual de bien en el navegador.
    console.error('Pantalla rota:', error, info.componentStack)
  }

  render() {
    if (!this.state.roto) return this.props.children
    return (
      <div className="pad" style={{ maxWidth: 640, margin: '0 auto' }}>
        <p>{this.props.mensaje}</p>
        <button type="button" onClick={() => window.location.reload()}>
          {this.props.reintentar}
        </button>
      </div>
    )
  }
}
