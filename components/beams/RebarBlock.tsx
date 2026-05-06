'use client'

export function RebarBlock({
  title,
  color,
  badge,
  hint,
  children,
}: {
  title: string
  color?: string
  badge?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="rebar-block">
      <div className="rh">
        {color && <span style={{ width: 8, height: 8, background: color, borderRadius: '50%' }} />}
        {title}
        {hint && (
          <span style={{ marginLeft: 6, color: 'var(--color-ink-4)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
            · {hint}
          </span>
        )}
        {badge && <span style={{ marginLeft: 'auto', color: 'var(--color-ink-4)' }}>{badge}</span>}
      </div>
      <div className="rb">{children}</div>
    </div>
  )
}

export function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ width: 7, height: 7, background: color, borderRadius: '50%' }} />
      {label}
    </span>
  )
}

export function Field2({
  prefix,
  unit,
  value,
  onChange,
}: {
  prefix?: string
  unit: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 3,
        border: '1px solid var(--color-line-3)', borderRadius: 3,
        padding: '0 4px', background: 'var(--color-panel)', height: 22,
      }}
    >
      {prefix && <span style={{ fontSize: 9.5, color: 'var(--color-ink-4)', textTransform: 'uppercase' }}>{prefix}</span>}
      <input
        style={{
          flex: 1, minWidth: 0, border: 0, outline: 0,
          fontFamily: 'var(--font-mono)', fontSize: 11,
          background: 'transparent', padding: 0,
        }}
        value={value}
        onChange={e => {
          const n = Number.parseInt(e.target.value, 10)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
      <span className="mono" style={{ fontSize: 9.5, color: 'var(--color-ink-4)' }}>{unit}</span>
    </div>
  )
}
