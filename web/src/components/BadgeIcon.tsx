import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined'
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import EditLocationAltOutlinedIcon from '@mui/icons-material/EditLocationAltOutlined'
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined'
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined'
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined'
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined'
import type { SvgIconProps } from '@mui/material/SvgIcon'

/**
 * Un icono por familia de insignia.
 *
 * Iconos y no dibujos: las insignias de nivel son diez y se pueden encargar, pero las
 * familias tienen además tres grados cada una y el mismo dibujo en tres metales es una
 * biblioteca que no se mantiene sola. Aquí el grado lo lleva el **color**, que además
 * funciona igual de bien en gris cuando la casilla está bloqueada.
 *
 * Cada icono dice de qué va la familia sin leer el nombre: la cámara es la de las
 * primeras fotos, el sol el estiaje, el calendario las cuatro estaciones.
 */
const ICONS: Record<string, React.ComponentType<SvgIconProps>> = {
  discoverer: AddLocationAltOutlinedIcon,
  firstLight: PhotoCameraOutlinedIcon,
  sentinel: VisibilityOutlinedIcon,
  cartographer: EditLocationAltOutlinedIcon,
  counties: PublicOutlinedIcon,
  drySeason: WbSunnyOutlinedIcon,
  fourSeasons: CalendarMonthOutlinedIcon,
  // Una brújula y no una bandera: la ficha de la fuente tiene banderas de verdad para
  // denunciar reseñas, unos centímetros más abajo. Con la misma forma, la insignia se
  // leería como "esto está reportado" en vez de "fuiste el primero en llegar".
  pioneer: ExploreOutlinedIcon,
}

export function BadgeIcon({ family, ...props }: { family: string } & SvgIconProps) {
  // Una familia nueva en el backend no debe dejar un hueco en la vitrina antes de que
  // alguien le elija icono: la copa sirve de comodín.
  const Icon = ICONS[family] ?? EmojiEventsOutlinedIcon
  return <Icon {...props} />
}
