'use client'

/**
 * Property row primitives — used in Member Properties cards.
 * All visual styling comes from `.prop-row` in globals.css.
 */

export function PropGroup({
  title,
  border,
  children,
}: {
  title: string
  border?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className="prop-group"
      style={border ? { borderLeft: '1px solid var(--color-line-2)' } : undefined}
    >
      <div className="prop-title">{title}</div>
      {children}
    </div>
  )
}

export function PropTextRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="prop-row">
      <span className="k">{label}</span>
      <span className={'v' + (mono ? '' : '')}>
        {mono ? <span className="mono">{value}</span> : value}
      </span>
    </div>
  )
}

export function PropStaticRow({
  label,
  value,
  unit,
  desc,
}: {
  label: string
  value: string
  unit?: string
  desc?: string
}) {
  return (
    <div className="prop-row">
      <span className="k">{label}</span>
      <span className="v">
        {value}{unit ? ` ${unit}` : ''}
        {desc && <span className="desc">{desc}</span>}
      </span>
    </div>
  )
}

export function PropInputRow({
  label,
  unit,
  value,
  onChange,
  desc,
}: {
  label: string
  unit?: string
  value: number
  onChange: (v: number) => void
  desc?: string
}) {
  return (
    <div className="prop-row">
      <span className="k">{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <input
          className="input"
          type="number"
          value={value}
          onChange={e => {
            const n = Number.parseFloat(e.target.value)
            if (Number.isFinite(n)) onChange(n)
          }}
          style={{ width: 84, height: 20 }}
        />
        {unit && <span style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>{unit}</span>}
        {desc && <span className="desc">{desc}</span>}
      </span>
    </div>
  )
}

export function PropSelectRow({
  label,
  value,
  opts,
  onChange,
}: {
  label: string
  value: string
  opts: string[]
  onChange?: (v: string) => void
}) {
  return (
    <div className="prop-row">
      <span className="k">{label}</span>
      <span>
        <select
          className="select"
          value={value}
          onChange={e => onChange?.(e.target.value)}
          style={{ height: 20 }}
        >
          {opts.map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </span>
    </div>
  )
}

export function PropCalcRow({
  label,
  value,
  unit,
  formula,
  expr,
}: {
  label: string
  value: string
  unit?: string
  formula?: string
  expr?: string
}) {
  return (
    <div className="prop-row">
      <span className="k">{label}</span>
      <span>
        <span className="v" style={{ color: 'var(--color-sel)' }}>
          {value}{unit ? ` ${unit}` : ''}
        </span>
        {formula && <span className="formula">{formula}</span>}
        {expr && <span className="formula" style={{ color: 'var(--color-ink-3)' }}>{expr}</span>}
      </span>
    </div>
  )
}
