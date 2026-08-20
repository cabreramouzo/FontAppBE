import { useEffect, useRef, useState } from 'react'
import MenuItem from '@mui/material/MenuItem'
import MenuList from '@mui/material/MenuList'
import Paper from '@mui/material/Paper'
import Popper from '@mui/material/Popper'
import TextField, { type TextFieldProps } from '@mui/material/TextField'
import { searchMentions } from '../api/client'
import { insertaMencion, mencionEnCurso } from '../lib/mentions'

/**
 * Una caja de texto que sugiere `@menciones` al escribir.
 *
 * ## Dónde va y dónde no
 *
 * Solo en las cajas donde una mención **hace algo**: reseñas e incidencias. La
 * descripción de una fuente no lleva menciones —el servidor no avisa de esas— y ponerlo
 * ahí ofrecería mencionar a alguien a quien nadie va a avisar, que es justo lo que la
 * paridad cliente/servidor existe para impedir.
 *
 * ## Detalles que se pagan caros
 *
 * - **Dos letras mínimo.** Con una, la lista es el censo por orden alfabético y no
 *   sugiere nada; el servidor tampoco contesta.
 * - **El cursor lo lee el DOM**, no el estado de React: `selectionStart` es la única
 *   fuente de verdad de dónde está, y sin él no se sabe qué mención se está escribiendo
 *   cuando hay dos en la misma frase.
 * - **`Popper` y no un desplegable dentro del campo**: la caja crece con el texto
 *   (`multiline`), así que la lista tiene que colgar de la posición real del campo en
 *   cada momento.
 * - En móvil se toca, y por eso la fila mide 44 px; en escritorio se navega con flechas.
 */
type Props = Omit<TextFieldProps, 'value' | 'onChange'> & {
  value: string
  onChange: (valor: string) => void
}

export function MentionInput({ value, onChange, ...resto }: Props) {
  const caja = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)
  const [sugerencias, setSugerencias] = useState<string[]>([])
  const [activo, setActivo] = useState(0)
  // Cerrado a mano con Escape: no se vuelve a abrir hasta que se escriba otra cosa.
  const cerrado = useRef(false)

  function tokenAhora() {
    const el = campo.current
    if (!el) return null
    return mencionEnCurso(value, el.selectionStart ?? value.length)
  }

  useEffect(() => {
    const token = tokenAhora()
    if (!token || token.prefijo.length < 2 || cerrado.current) {
      setSugerencias([])
      return
    }
    // Un respiro antes de preguntar: escribiendo «maria» sin esto salen cuatro
    // peticiones, tres de ellas ya obsoletas al llegar.
    let vivo = true
    const id = setTimeout(() => {
      searchMentions(token.prefijo)
        .then((lista) => { if (vivo) { setSugerencias(lista); setActivo(0) } })
        .catch(() => { if (vivo) setSugerencias([]) })
    }, 180)
    return () => { vivo = false; clearTimeout(id) }
    // `value` basta como disparador: mover el cursor sin escribir no abre nada, y
    // abrirlo ahí sorprende más de lo que ayuda.
  }, [value])

  function elige(username: string) {
    const token = tokenAhora()
    if (!token) return
    const { texto, caret } = insertaMencion(value, token, username)
    onChange(texto)
    setSugerencias([])
    // El cursor se recoloca **después** de que React repinte el valor nuevo; hacerlo
    // ahora lo dejaría al final del texto viejo.
    requestAnimationFrame(() => {
      const el = campo.current
      if (!el) return
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  const abierto = sugerencias.length > 0

  return (
    <>
      <TextField
        {...resto}
        ref={caja}
        inputRef={campo}
        value={value}
        onChange={(e) => { cerrado.current = false; onChange(e.target.value) }}
        onBlur={() => setSugerencias([])}
        onKeyDown={(e) => {
          if (!abierto) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((i) => (i + 1) % sugerencias.length) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((i) => (i - 1 + sugerencias.length) % sugerencias.length) }
          // Enter y Tab aceptan; en un campo multilínea, Enter sin lista abierta sigue
          // siendo un salto de línea, que es lo que se espera.
          else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); elige(sugerencias[activo]) }
          else if (e.key === 'Escape') { cerrado.current = true; setSugerencias([]) }
        }}
      />
      <Popper
        open={abierto}
        anchorEl={caja.current}
        placement="bottom-start"
        // Sobre el diálogo de reseña, que es donde vive esto.
        sx={{ zIndex: (t) => t.zIndex.modal + 1 }}
      >
        <Paper elevation={8} sx={{ mt: 0.5, borderRadius: 2, overflow: 'hidden', minWidth: 200 }}>
          <MenuList dense sx={{ py: 0 }}>
            {sugerencias.map((u, i) => (
              <MenuItem
                key={u}
                selected={i === activo}
                // `onMouseDown` y no `onClick`: el clic llega después del `blur`, que ya
                // ha cerrado la lista, así que con `onClick` no se elige nunca con ratón.
                onMouseDown={(e) => { e.preventDefault(); elige(u) }}
                sx={{ minHeight: 44 }}
              >
                @{u}
              </MenuItem>
            ))}
          </MenuList>
        </Paper>
      </Popper>
    </>
  )
}
