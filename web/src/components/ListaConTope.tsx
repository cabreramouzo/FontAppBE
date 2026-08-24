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
      <List disablePadding>
        {lista.map((x) => <Fragment key={clave(x)}>{fila(x)}</Fragment>)}
      </List>
      {items.length > tope && (
        <Typography
          component="button" variant="body2"
          onClick={() => setTodas((v) => !v)}
          sx={{ mt: 1, background: 'none', border: 0, p: 0, color: 'primary.main', cursor: 'pointer' }}
        >
          {todas ? t('guard.showLess') : t('guard.showAll', { n: String(items.length) })}
        </Typography>
      )}
    </>
  )
}
