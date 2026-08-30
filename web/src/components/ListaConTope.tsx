import { Fragment, useState } from 'react'
import type { ReactNode } from 'react'
import List from '@mui/material/List'
import Typography from '@mui/material/Typography'
import { useI18n } from '../i18n/I18nContext'

/** Cuántas filas se enseñan antes de pedir «verlas todas». */
export const TOPE = 6

/**
 * Una lista con tope y un «verlas todas (N)» que la despliega.
 *
 * Existe porque en `/me` las tres listas —favoritas, tus fuentes y tus reseñas— **no
 * tienen límite y crecen para siempre**: medido con 21 favoritas ya ocupaban 1.068 px, y
 * entre las tres eran el 70 % de la página. Con 200 favoritas la página son 10.000 px.
 *
 * Y se saca aquí en vez de escribirlo una cuarta vez: `GuardedFonts` ya tenía este mismo
 * corte con su propio `slice` y su propio interruptor, así que lo que había era una copia
 * a punto de multiplicarse. Las claves `guard.showAll` / `guard.showLess` se reutilizan
 * tal cual —ya están en los siete idiomas y el texto es genérico—; el nombre se queda
 * aunque ahora lo use más gente, porque renombrar en siete diccionarios no arregla nada.
 *
 * `fila` devuelve el `<ListItem>` entero y **no** lleva `key`: la pone esta lista con
 * `clave`, que es lo único que sabe cómo identificar cada elemento.
 */
export function ListaConTope<T>({ items, tope = TOPE, clave, fila }: {
  items: T[]
  tope?: number
  clave: (x: T) => string
  fila: (x: T) => ReactNode
}) {
  const { t } = useI18n()
  const [todas, setTodas] = useState(false)
  const lista = todas ? items : items.slice(0, tope)

  return (
    <>
      {/* ## Filas alternadas, y no una línea entre cada dos
          Con filas de una sola línea y un separador de 1 px, seis favoritas se leen como
          un bloque de texto: hay que ir contando para saber dónde acaba una. El rayado
          separa **por superficie** y no por línea, que es lo que hace legible cualquier
          tabla larga, y de paso deja de hacer falta el `divider`.

          Va aquí y no en cada lista por lo mismo que el tope: son cuatro sitios y el que
          se olvide no rompe nada, solo queda distinto.

          Ojo con el color: el rayado usa `action.hover`, que es **el mismo** que MUI da al
          pasar por encima, así que en las filas rayadas el hover no se vería. Por eso el
          hover sube a `action.selected` — sin eso, la mitad de las filas pierden la
          respuesta al dedo, que en móvil es la única señal de que la fila se pulsa. */}
      <List
        disablePadding
        sx={{
          // Se raya el propio `<li>` y no el botón de dentro: así vale igual para las
          // filas que se pulsan (favoritas, tus fuentes) y para las que no (tus reseñas,
          // que son un bloque de texto). El botón es transparente y deja pasar el color.
          '& > li:nth-of-type(odd)': { bgcolor: 'action.hover' },
          '& .MuiListItemButton-root:hover': { bgcolor: 'action.selected' },
        }}
      >
        {lista.map((x) => <Fragment key={clave(x)}>{fila(x)}</Fragment>)}
      </List>
      {items.length > tope && (
        <Typography
          component="button" variant="body2"
          onClick={() => setTodas((v) => !v)}
          // 44 px de alto en móvil: es un control, no una nota al pie, y venía a 20.
          // El acolchado va abajo y a los lados en cero, para que el texto siga alineado
          // con la lista de arriba en vez de aparecer sangrado.
          sx={{
            mt: 1, background: 'none', border: 0, px: 0, color: 'primary.main', cursor: 'pointer',
            display: 'flex', alignItems: 'center',
            minHeight: { xs: 44, sm: 0 }, py: { xs: 0, sm: 0 },
          }}
        >
          {todas ? t('guard.showLess') : t('guard.showAll', { n: String(items.length) })}
        </Typography>
      )}
    </>
  )
}
