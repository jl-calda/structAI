'use client'

import { Spinner } from '@/components/ui/Spinner'

export type BentMode = 'none' | 'both'

const isBent = (v: BentMode | undefined) => v === 'both'

export function RebarRow({
  label,
  count,
  setCount,
  countDisabled,
  dia,
  setDia,
  bentArr,
  onCycleBent,
  diaOptions,
  diaLabel,
}: {
  label: string
  count: number
  setCount?: (v: number) => void
  countDisabled?: boolean
  dia: number
  setDia: (v: number) => void
  bentArr?: BentMode[]
  onCycleBent?: (idx: number) => void
  /** Available bar diameters from the active CodeProvider (mm). */
  diaOptions?: readonly number[]
  /** Formatter for bar size display (defaults to `Ø{N}`). */
  diaLabel?: (mm: number) => string
}) {
  const opts = diaOptions ?? [10, 12, 16, 20, 25, 28, 32]
  const fmt = diaLabel ?? ((mm: number) => `Ø${Math.round(mm)}`)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr', gap: 6, alignItems: 'center', marginBottom: 4 }}>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>{label}</span>
      {countDisabled || !setCount ? (
        <Spinner value={count} onChange={() => {}} />
      ) : (
        <Spinner value={count} onChange={setCount} min={0} />
      )}
      <select
        className="select"
        value={dia}
        onChange={e => setDia(Number.parseFloat(e.target.value))}
        style={{ height: 22, fontSize: 11 }}
      >
        {opts.map(d => (
          <option key={d} value={d}>{fmt(d)}</option>
        ))}
      </select>
      {bentArr && count > 0 && onCycleBent && (
        <div
          style={{
            gridColumn: '1 / -1', display: 'flex', alignItems: 'center',
            gap: 4, padding: '2px 0 4px 28px', flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 9.5, color: 'var(--color-ink-4)', letterSpacing: '0.04em', textTransform: 'uppercase', marginRight: 2 }}>bars:</span>
          {Array.from({ length: count }).map((_, i) => {
            const bent = isBent(bentArr[i])
            return (
              <button
                key={i}
                type="button"
                onClick={() => onCycleBent(i)}
                title={bent ? 'Truss bar — bent up at both supports — click to make straight' : 'Straight bottom bar — click to bend up at both supports'}
                className="bar-toggle"
                data-bent={bent ? 'true' : 'false'}
              >
                {bent ? '⇈' : '—'}
              </button>
            )
          })}
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--color-ink-4)', marginLeft: 4 }}>
            {bentArr.filter(isBent).length}/{count} bent
          </span>
        </div>
      )}
    </div>
  )
}
