// Marcador de carga con efecto shimmer (en lugar de "Cargando…").
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skel-line" />
      ))}
    </div>
  )
}
