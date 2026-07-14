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
    <span className="stars" style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          className={'star' + (s <= Math.round(value) ? ' on' : '')}
          onClick={onChange ? () => onChange(s) : undefined}
          disabled={!onChange}
          aria-label={`${s} estrellas`}
        >
          ★
        </button>
      ))}
    </span>
  )
}
