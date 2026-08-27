import { Component } from 'react'
import { esFalloPorFaltaDeRed, esTrozoCaducado, recargaSiEsTrozoCaducado } from '../lib/staleChunk'
import { recoverAppShell } from '../lib/recoverApp'
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
  /**
   * Para cuando el trozo no llega **porque no hay red**, que da el mismo error que un
   * despliegue nuevo y pide lo contrario: aquí recargar deja a la persona sin ni siquiera
   * lo que tenía en pantalla.
   */
  mensajeSinRed: string
  /** Rótulo del botón cuando lo único útil es volver atrás. */
  volver: string
  /**
   * Para cuando lo que ha fallado es **cargar la aplicación**, no la pantalla.
   *
   * Se intenta recargar solo, pero si ya se recargó hace nada no se insiste —sería un
   * bucle— y entonces hay que decir algo. Y lo que hay que decir no es «esta pantalla ha
   * fallado»: eso le echa la culpa a la página que la persona acaba de abrir y la manda a
   * buscar el problema donde no está.
   */
  mensajeCaducado: string
  reintentar: string
}

interface State {
  roto: boolean
  /** Si lo que falló fue cargar un trozo de la app y no la pantalla en sí. */
  caducado: boolean
  /** Ese mismo fallo, pero por estar sin cobertura. La salida es la contraria. */
  sinRed: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { roto: false, caducado: false, sinRed: false }

  static getDerivedStateFromError(error: Error): State {
    // Sin red va primero: los dos fallos dan el mismo error, pero decir «se ha
    // actualizado, recarga» en pleno modo avión manda a la persona a hacer justo lo que
    // la dejaría sin nada. Reportado con una captura desde el monte.
    if (esFalloPorFaltaDeRed(error)) return { roto: true, caducado: false, sinRed: true }
    return { roto: true, caducado: esTrozoCaducado(error), sinRed: false }
  }

  private recuperarYRecargar = async () => {
    await recoverAppShell()
    window.location.reload()
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Antes de dar la pantalla por rota: si lo que ha fallado es cargar un trozo de la
    // app, no es un fallo de la pantalla — es que se ha desplegado una versión nueva y
    // esta pestaña sigue pidiendo ficheros que ya no existen. Se recarga una vez y ya.
    // Decirle a la persona «esta pantalla ha fallado» le echa la culpa a la página que
    // acaba de abrir y le ofrece justo lo que no toca.
    // Sin red no se recarga: recargar es lo único que puede dejarla peor.
    if (esFalloPorFaltaDeRed(error)) return
    if (recargaSiEsTrozoCaducado(error, Date.now(), () => { void this.recuperarYRecargar() })) return
    // A la consola y nada más: no hay servicio de errores en este proyecto y mandar
    // trazas a un tercero sería añadir una dependencia y un asunto de privacidad para
    // resolver un problema que se ve igual de bien en el navegador.
    console.error('Pantalla rota:', error, info.componentStack)
  }

  render() {
    if (!this.state.roto) return this.props.children
    return (
      <div className="pad" style={{ maxWidth: 640, margin: '0 auto' }}>
        <p>{
          this.state.sinRed ? this.props.mensajeSinRed
            : this.state.caducado ? this.props.mensajeCaducado
              : this.props.mensaje
        }</p>
        {/* Sin red, recargar borra lo que hay en pantalla y no trae nada. El botón vuelve
            atrás, que es lo único útil: el mapa y la lista sí funcionan con lo guardado. */}
        <button type="button" onClick={this.state.sinRed ? () => window.history.back() : this.recuperarYRecargar}>
          {this.state.sinRed ? this.props.volver : this.props.reintentar}
        </button>
      </div>
    )
  }
}
