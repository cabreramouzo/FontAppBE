import { useEffect, useRef, useState } from 'react'

/**
 * Sonda de diagnóstico para el hueco de la tab bar en iOS.
 *
 * ## Por qué existe y por qué no es un `console.log`
 *
 * El síntoma —una franja en blanco en la barra de abajo que **se arregla sola al tocar
 * otra pestaña**— solo aparece en el primer arranque de la app instalada en la pantalla
 * de inicio de un iPhone. Eso no se reproduce desde aquí: el simulador no reporta los
 * insets igual que un aparato real, y en un navegador de escritorio no existen. Y sin el
 * número, las tres causas posibles dan exactamente el mismo síntoma:
 *
 *  1. `env(safe-area-inset-bottom)` vale **0** en el primer pintado y luego pasa a 34.
 *  2. La ventana mide de más al arrancar (la transición desde la pantalla de inicio) y
 *     lo fijado abajo se coloca contra un alto que después cambia.
 *  3. El inset está bien desde el principio y lo que falla es otra cosa.
 *
 * Se distinguen mirando **cuándo** cambia cada medida, no cuál es. Por eso esto toma
 * varias muestras en el tiempo y una más al primer toque, que es justo el gesto que,
 * según el informe, lo arregla.
 *
 * ## Cómo se enciende
 *
 * `?debug=safearea` una vez, y se queda encendida (`localStorage`). **Tiene que quedarse**:
 * la app instalada arranca siempre en `/`, sin parámetros, así que un flag que solo
 * viviera en la URL no llegaría nunca al arranque que hay que observar. Se apaga con
 * `?debug=off` o con el botón.
 */
const FLAG = 'debug:safearea'

/** Lo que se mide, cada vez. */
function muestra(): Record<string, string> {
    const raiz = getComputedStyle(document.documentElement)
    // El inset no se puede leer directamente: se resuelve pintándolo en algo.
    const sonda = document.createElement('div')
    sonda.style.cssText = 'position:fixed;bottom:0;left:0;width:0;padding-bottom:env(safe-area-inset-bottom);padding-top:env(safe-area-inset-top)'
    document.body.appendChild(sonda)
    const cs = getComputedStyle(sonda)
    const abajo = cs.paddingBottom
    const arriba = cs.paddingTop
    sonda.remove()

    const barra = document.querySelector('.MuiBottomNavigation-root')
    const papel = barra?.parentElement
    const r = papel?.getBoundingClientRect()
    const rb = barra?.getBoundingClientRect()

    return {
        insetAbajo: abajo,
        insetArriba: arriba,
        // Si esto no es 0, hay hueco **debajo** de la barra: la barra no llega al borde.
        huecoBajoLaBarra: r ? String(Math.round(window.innerHeight - r.bottom)) : '(sin barra)',
        // Diferencia entre el papel y la fila de iconos = el acolchado que pinta el fondo
        // sobre el indicador. Si es 0 con `insetAbajo` > 0, el acolchado no se aplicó.
        acolchadoDeLaBarra: r && rb ? String(Math.round(r.bottom - rb.bottom)) : '—',
        altoBarra: r ? String(Math.round(r.height)) : '—',
        bajoElMapa: raiz.getPropertyValue('--bajo-el-mapa').trim(),
        innerHeight: String(window.innerHeight),
        clientHeight: String(document.documentElement.clientHeight),
        visualViewport: window.visualViewport ? String(Math.round(window.visualViewport.height)) : '—',
        standalone: String(window.matchMedia('(display-mode: standalone)').matches ||
            (navigator as unknown as { standalone?: boolean }).standalone === true),
    }
}

export function SafeAreaProbe() {
    const [lineas, setLineas] = useState<string[]>([])
    const [on, setOn] = useState(false)
    // Una sola vez de verdad. StrictMode invoca el efecto dos veces en desarrollo y la
    // muestra `t=0` salía duplicada; aquí eso no es ruido cosmético, porque lo que se
    // está leyendo es **cuántas veces y cuándo** cambia una medida.
    const yaMidio = useRef(false)

    useEffect(() => {
        if (yaMidio.current) return
        const p = new URLSearchParams(location.search).get('debug')
        try {
            if (p === 'safearea') localStorage.setItem(FLAG, '1')
            if (p === 'off') localStorage.removeItem(FLAG)
            if (localStorage.getItem(FLAG) !== '1') return
        } catch { return }
        setOn(true)
        yaMidio.current = true

        const apunta = (cuando: string) => {
            const m = muestra()
            setLineas((v) => [...v, `${cuando}: ` + Object.entries(m).map(([k, x]) => `${k}=${x}`).join(' · ')])
        }
        // Las tres primeras dicen si algo cambia solo; la del toque, si lo arregla el gesto.
        apunta('t=0')
        const a = setTimeout(() => apunta('t=300ms'), 300)
        const b = setTimeout(() => apunta('t=1500ms'), 1500)
        const alTocar = () => apunta('primer toque')
        window.addEventListener('pointerdown', alTocar, { once: true })
        // Girar y volver del segundo plano son los otros dos momentos en que iOS
        // recalcula esto.
        // Solo al volver, no al irse: `visibilitychange` salta en los dos sentidos y
        // una muestra tomada con la app oculta no mide nada.
        const alVolver = () => { if (document.visibilityState === 'visible') apunta('vuelve al primer plano') }
        document.addEventListener('visibilitychange', alVolver)
        return () => {
            clearTimeout(a); clearTimeout(b)
            window.removeEventListener('pointerdown', alTocar)
            document.removeEventListener('visibilitychange', alVolver)
        }
    }, [])

    if (!on) return null

    const texto = lineas.join('\n')
    // El aviso más importante del panel, y por eso va arriba y en rojo: la primera
    // medición que se tomó salió entera con `standalone=false`, o sea desde una pestaña
    // de Safari y no desde la app instalada — que es la única condición en la que el
    // fallo existe. Todo lo demás salía coherente y sin hueco, y eso se lee como «ya no
    // pasa» cuando lo que pasa es que se está mirando el sitio equivocado.
    const enLaApp = window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
            background: '#111', color: '#0f0', font: '11px/1.35 ui-monospace, monospace',
            padding: '6px 8px', maxHeight: '45vh', overflow: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', borderBottom: '2px solid #0f0',
        }}>
            {!enLaApp && (
                <div style={{ color: '#f66', fontWeight: 700, marginBottom: 6 }}>
                    ⚠️ ESTO NO ES LA APP INSTALADA (standalone=false).{'\n'}
                    El hueco solo sale abriendo desde el icono de la pantalla de inicio.{'\n'}
                    Ciérrala del todo y ábrela desde ahí.
                </div>
            )}
            {texto || 'midiendo…'}
            <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                <button
                    onClick={() => { void navigator.clipboard.writeText(texto) }}
                    style={{ font: 'inherit', padding: '4px 8px' }}
                >copiar</button>
                <button
                    onClick={() => { try { localStorage.removeItem(FLAG) } catch { /* da igual */ } setOn(false) }}
                    style={{ font: 'inherit', padding: '4px 8px' }}
                >apagar</button>
            </div>
        </div>
    )
}
