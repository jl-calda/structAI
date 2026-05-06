'use client'

export function Spinner({
  value,
  onChange,
  step = 1,
  min,
  max,
  unit,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  unit?: string
}) {
  const dec = () => {
    const next = value - step
    if (min !== undefined && next < min) return
    onChange(next)
  }
  const inc = () => {
    const next = value + step
    if (max !== undefined && next > max) return
    onChange(next)
  }
  return (
    <div className="spinner">
      <button type="button" onClick={dec}>−</button>
      <input
        value={unit ? `${value}${unit ? ` ${unit}` : ''}` : value}
        onChange={e => {
          const raw = e.target.value.replace(/[^\d.-]/g, '')
          const n = Number.parseFloat(raw)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
      <button type="button" onClick={inc}>+</button>
    </div>
  )
}
