import Rating from '@mui/material/Rating'

// Valoración por estrellas. Solo lectura si no hay `onChange`.
export function StarRating({
  value,
  onChange,
  size = 20,
}: {
  value: number
  onChange?: (v: number) => void
  size?: number
}) {
  return (
    <Rating
      value={value}
      precision={onChange ? 1 : 0.5}
      readOnly={!onChange}
      onChange={onChange ? (_, v) => onChange(v ?? 0) : undefined}
      sx={{ fontSize: size, verticalAlign: 'middle' }}
    />
  )
}
