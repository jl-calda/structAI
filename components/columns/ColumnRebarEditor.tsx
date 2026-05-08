'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { recheckColumnAction } from '@/app/actions/rebar'
import { ColumnCrossSection } from './ColumnCrossSection'
import { RebarBlock, Legend, Field2 } from '@/components/beams/RebarBlock'

import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'
import type { CodeStandard } from '@/lib/supabase/types'

export type ColumnRebarInit = {
  bar_dia_mm: number
  bar_count: number
  tie_dia_mm: number
  tie_spacing_mm: number
  tie_spacing_end_mm: number
  tie_end_zone_length_mm: number
}

const A = (d: number) => Math.PI * d * d / 4

export function ColumnRebarEditor({
  projectId,
  columnDesignId,
  initial,
  initialInteraction,
  initialRho,
  b_mm,
  h_mm,
  clear_cover_mm,
  fc_mpa,
  fy_mpa,
  code_standard,
}: {
  projectId: string
  columnDesignId: string
  initial: ColumnRebarInit
  initialInteraction: number | null
  initialRho: number | null
  b_mm: number
  h_mm: number
  clear_cover_mm: number
  fc_mpa: number
  fy_mpa: number
  code_standard: CodeStandard
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const code = getCode(code_standard)

  const [barDia, setBarDia] = useState(initial.bar_dia_mm)
  const [sideX, setSideX] = useState(() => {
    const extra = Math.max(0, initial.bar_count - 4)
    return Math.round(extra / 4)
  })
  const [sideY, setSideY] = useState(() => {
    const extra = Math.max(0, initial.bar_count - 4)
    return Math.max(0, Math.round(extra / 4))
  })
  const [bundleCorners, setBundleCorners] = useState(false)
  const [tieDia, setTieDia] = useState(initial.tie_dia_mm)
  const [tiePattern, setTiePattern] = useState<'perim' | 'perim+x' | 'perim+xtie' | 'spiral'>('perim+x')
  const [sConf, setSConf] = useState(initial.tie_spacing_end_mm)
  const [sMid, setSMid] = useState(initial.tie_spacing_mm)
  const [loConf, setLoConf] = useState(initial.tie_end_zone_length_mm)

  const nLong = 4 + 2 * sideX + 2 * sideY
  const bar_count = nLong
  const AsLong = (bundleCorners ? 8 : 4) * A(barDia) + (2 * sideX + 2 * sideY) * A(barDia)
  const Ag = b_mm * h_mm
  const rhoG = AsLong / Ag
  const rhoOK = rhoG >= code.rho_column_min && rhoG <= code.rho_column_max

  const dEff = h_mm - clear_cover_mm - tieDia - barDia / 2

  const phi = code.phi_axial(0, tiePattern === 'spiral' ? 'spiral' : 'tied')
  const factor = code.Pn_max_factor(tiePattern === 'spiral' ? 'spiral' : 'tied')
  const Po = 0.85 * fc_mpa * (Ag - AsLong) + fy_mpa * AsLong
  const phiPnMax = factor * phi * Po / 1000

  const [result, setResult] = useState(() => {
    if (initialInteraction === null || initialRho === null) {
      return { tone: 'warn' as const, text: 'Run design first to establish a baseline.' }
    }
    return {
      tone: (initialInteraction <= 1 ? 'ok' : 'warn') as 'ok' | 'warn',
      text: `interaction ${(initialInteraction * 100).toFixed(0)}% · ρ ${initialRho.toFixed(2)}%`,
    }
  })

  const onRecheck = () => {
    startTransition(async () => {
      const r = await recheckColumnAction({
        projectId,
        columnDesignId,
        rebar: {
          bar_dia_mm: barDia,
          bar_count,
          tie_dia_mm: tieDia,
          tie_spacing_mm: sMid,
          tie_spacing_end_mm: sConf,
          tie_end_zone_length_mm: loConf,
        },
      })
      if (!r.ok) {
        setResult({ tone: 'err' as 'ok', text: r.error })
        return
      }
      const d = r.data
      setResult({
        tone: d.overall === 'pass' ? 'ok' : 'warn',
        text: `${d.overall.toUpperCase()} · interaction ${(d.interaction_ratio * 100).toFixed(0)}% · ρ ${d.rho_percent.toFixed(2)}%`,
      })
      router.refresh()
    })
  }

  return (
    <div style={{ padding: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
      {/* Col 1: Cross-section + legend */}
      <div style={{ padding: 12, borderRight: '1px solid var(--color-line-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--color-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
          <span>Typical Section</span>
          <span className="mono" style={{ color: 'var(--color-ink-4)', fontWeight: 500, letterSpacing: 0, textTransform: 'none' }}>
            full height · symmetric all 4 faces
          </span>
        </div>
        <ColumnCrossSection
          b_mm={b_mm} h_mm={h_mm} clear_cover_mm={clear_cover_mm}
          bar_dia_mm={barDia} bar_count={bar_count}
          tie_dia_mm={tieDia}
          sideX={sideX} sideY={sideY}
          bundleCorners={bundleCorners}
          tiePattern={tiePattern}
          width={240} height={240}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10, color: 'var(--color-ink-3)', justifyContent: 'center' }}>
          <Legend color="#D4820F" label="Corner" />
          <Legend color="#B06008" label="Side bars" />
          <Legend color="#1755A0" label={tiePattern === 'spiral' ? 'Spiral' : 'Tie'} />
        </div>
      </div>

      {/* Col 2: Longitudinal rebar */}
      <div style={{ padding: 10, borderRight: '1px solid var(--color-line-2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <RebarBlock title="Longitudinal" color="#B06008" hint="symmetric · all 4 faces">
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>Ø</span>
            <select className="input" value={barDia}
              onChange={e => setBarDia(Number.parseInt(e.target.value, 10))}
              style={{ height: 22, fontSize: 11 }}>
              {code.bar_dias_long.map(d => <option key={d} value={d}>Ø{d}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>X</span>
            <Spinner value={sideX} onChange={setSideX} />
            <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>per face (top/bot)</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>Y</span>
            <Spinner value={sideY} onChange={setSideY} />
            <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>per face (L/R)</span>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0 0', fontSize: 10.5, color: 'var(--color-ink-3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={bundleCorners}
              onChange={e => setBundleCorners(e.target.checked)} />
            <span>bundle corners (2-bar)</span>
          </label>
          <div className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)', padding: '4px 0 0' }}>
            {nLong} bars · As = {Math.round(AsLong)} mm² · ρ = {(rhoG * 100).toFixed(2)}%
            {!rhoOK && (
              <span style={{ color: 'var(--color-fail)', marginLeft: 4 }}>
                {rhoG < code.rho_column_min ? `· < ${(code.rho_column_min * 100).toFixed(0)}% min` : `· > ${(code.rho_column_max * 100).toFixed(0)}% max`}
              </span>
            )}
          </div>
        </RebarBlock>

        <RebarBlock title="Code limits" color="#9CA0A8" hint={code.code.replace(/_/g, ' ')}>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>ρmin</span><span>{(code.rho_column_min * 100).toFixed(1)}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>ρmax</span><span>{(code.rho_column_max * 100).toFixed(1)}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>ρ provided</span>
              <span style={{ color: rhoOK ? 'var(--color-pass)' : 'var(--color-fail)' }}>
                {(rhoG * 100).toFixed(2)}% {rhoOK ? '✓' : '✗'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>min bars</span>
              <span>{tiePattern === 'spiral' ? '6' : '4'}</span>
            </div>
          </div>
        </RebarBlock>
      </div>

      {/* Col 3: Ties + capacity */}
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <RebarBlock title="Transverse · ties / spiral" color="#1755A0">
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>Ø</span>
            <select className="input" value={tieDia}
              onChange={e => setTieDia(Number.parseInt(e.target.value, 10))}
              style={{ height: 22, fontSize: 11 }}>
              {code.bar_dias_stirrup.map(d => <option key={d} value={d}>Ø{d}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>Pattern</span>
            <select className="input" value={tiePattern}
              onChange={e => setTiePattern(e.target.value as typeof tiePattern)}
              style={{ height: 22, fontSize: 11 }}>
              <option value="perim">perimeter only (4-leg)</option>
              <option value="perim+x">perim + diamond (6-leg)</option>
              <option value="perim+xtie">perim + crossties (8-leg)</option>
              <option value="spiral">spiral</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>spacing</span>
            <Field2 prefix="conf" unit="mm" value={sConf} onChange={setSConf} />
            <Field2 prefix="mid" unit="mm" value={sMid} onChange={setSMid} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>lo zone</span>
            <Field2 prefix="ends" unit="mm" value={loConf} onChange={setLoConf} />
          </div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-ink-4)', padding: '6px 0 0', lineHeight: 1.4 }}>
            lo ≥ max(h, Hc/6, 450) · so ≤ min(6db, b/4, 100)
          </div>
        </RebarBlock>

        {/* Capacity summary */}
        <div className="card" style={{ borderRadius: 5 }}>
          <div className="card-h" style={{ height: 26, padding: '0 10px' }}>
            <span className="label" style={{ fontSize: 9.5 }}>Capacity</span>
          </div>
          <div style={{ padding: '8px 10px', fontSize: 11 }}>
            <CapRow k="φPn,max" v={`${Math.round(phiPnMax)} kN`} />
            <CapRow k="As,long" v={`${Math.round(AsLong)} mm²`} />
            <CapRow k="ρg" v={`${(rhoG * 100).toFixed(2)}%`} pass={rhoOK} />
            <CapRow k="n bars" v={`${nLong}`} />
            <CapRow k="d eff" v={`${dEff.toFixed(0)} mm`} />
          </div>
        </div>

        <div
          className="mono"
          style={{
            borderRadius: 4, padding: '4px 8px', fontSize: 10.5,
            background: result.tone === 'ok' ? 'var(--color-pass-bg, #E7F0E9)' : 'var(--color-warn-bg, #F4ECD8)',
            color: result.tone === 'ok' ? 'var(--color-pass)' : 'var(--color-warn, #8A6512)',
          }}
        >
          {result.text}
        </div>

        <button
          type="button" onClick={onRecheck} disabled={pending}
          className="btn primary"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {pending ? 'Re-checking…' : 'Re-check'}
        </button>
      </div>
    </div>
  )
}

function CapRow({ k, v, pass }: { k: string; v: string; pass?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, padding: '2px 0' }}>
      <span style={{ fontSize: 10.5, color: 'var(--color-ink-3)', minWidth: 60 }}>{k}</span>
      <span className="mono" style={{
        fontSize: 10.5,
        color: pass === undefined ? 'var(--color-ink)' : pass ? 'var(--color-pass)' : 'var(--color-fail)',
      }}>{v}</span>
    </div>
  )
}

function Spinner({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="spinner" style={{ display: 'flex', alignItems: 'center' }}>
      <button type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        style={{ width: 22, height: 22, border: '1px solid var(--color-line-3)', borderRadius: '3px 0 0 3px', background: 'var(--color-panel)', cursor: 'pointer', fontSize: 12 }}>
        −
      </button>
      <input readOnly value={value}
        style={{ width: 30, height: 22, border: '1px solid var(--color-line-3)', borderLeft: 0, borderRight: 0, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--color-panel)' }} />
      <button type="button"
        onClick={() => onChange(value + 1)}
        style={{ width: 22, height: 22, border: '1px solid var(--color-line-3)', borderRadius: '0 3px 3px 0', background: 'var(--color-panel)', cursor: 'pointer', fontSize: 12 }}>
        +
      </button>
    </div>
  )
}
