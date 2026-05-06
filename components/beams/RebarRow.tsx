'use client'

import { Spinner } from '@/components/ui/Spinner'

const BAR_DIAS = [10, 12, 16, 20, 25, 28, 32]

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
}: {
  label: string
  count: number
  setCount?: (v: number) => void
  countDisabled?: boolean
  dia: number
  setDia: (v: number) => void
  bentArr?: BentMode[]
  onCycleBent?: (idx: number) => void
}) {
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
        onChange={e => setDia(Number.parseInt(e.target.value, 10))}
        style={{ height: 22, fontSize: 11 }}
      >
        {BAR_DIAS.map(d => (
          <option key={d} value={d}>Ø{d}</option>
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
