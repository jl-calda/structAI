'use client'

import { useMemo, useState } from 'react'

import type { BentMode } from './RebarRow'

/**
 * Material Take-Off — rebar cutting list per beam.
 *
 * For each bar mark (M1, M2, …) computes:
 *   - cut length (incl. ldh hooks at each end, lap splices for pieces > stock)
 *   - splice count if cut len > stock
 *   - net mass per piece × count
 *   - aggregated by diameter with First-Fit Decreasing bin packing
 *     to estimate stock-bar requirement and waste
 *
 * Bar mass (kg/m) per ASTM/PNS deformed bars (ASTM A615 / PNS 49):
 *   Ø10 = 0.617, Ø12 = 0.888, Ø16 = 1.578, Ø20 = 2.466,
 *   Ø25 = 3.853, Ø28 = 4.834, Ø32 = 6.313
 */

const BAR_MASS: Record<number, number> = {
  10: 0.617, 12: 0.888, 16: 1.578, 20: 2.466,
  25: 3.853, 28: 4.834, 32: 6.313,
}

type BarShape = 'straight-hooked' | 'L-hooked' | 'bent-truss' | 'stirrup'
type Mark = {
  mark: string
  desc: string
  shape: BarShape
  count: number
  db: number
  cutLen: number
  splices: number
}

export type RebarMTOProps = {
  beamId: string
  span: number
  h: number
  b: number
  cover: number
  perimDia: number
  t1Count: number
  t1Dia: number
  t1Bent: BentMode[]
  t2Count: number
  t2Dia: number
  t2Bent: BentMode[]
  c1Count: number
  c1Dia: number
  c2Count: number
  c2Dia: number
  torsCount: number
  torsDia: number
  stirDia: number
  stirSpacingEnd: number
  stirSpacingMid: number
  bendL: number
  fc?: number
  fy?: number
}

export function RebarMTO(props: RebarMTOProps) {
  const {
    beamId, span, h, b, cover, perimDia,
    t1Count, t1Dia, t1Bent, t2Count, t2Dia, t2Bent,
    c1Count, c1Dia, c2Count, c2Dia,
    torsCount, torsDia,
    stirDia, stirSpacingEnd, stirSpacingMid,
    bendL,
    fc = 28, fy = 415,
  } = props

  const [stockLen, setStockLen] = useState(12000)
  const [selectedMark, setSelectedMark] = useState<string | null>(null)

  const result = useMemo(() => buildMarks({
    span, h, b, cover, perimDia,
    t1Count, t1Dia, t1Bent, t2Count, t2Dia, t2Bent,
    c1Count, c1Dia, c2Count, c2Dia,
    torsCount, torsDia,
    stirDia, stirSpacingEnd, stirSpacingMid,
    bendL, fc, fy,
    stockLen,
  }), [
    span, h, b, cover, perimDia,
    t1Count, t1Dia, t1Bent, t2Count, t2Dia, t2Bent,
    c1Count, c1Dia, c2Count, c2Dia,
    torsCount, torsDia,
    stirDia, stirSpacingEnd, stirSpacingMid,
    bendL, fc, fy, stockLen,
  ])

  const { marks, byDia, totalMass, totalNetMass, totalWasteMass, totalStockBars, totalWasteMm } = result

  return (
    <div className="card" data-step="6-mto">
      <div className="card-h">
        <span className="num-badge">6</span>
        <span className="label">Material Take-Off · Rebar Cutting List</span>
        <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
          per beam {beamId} · cut lengths include ldh (hooks) &amp; ls·B (splices)
        </span>
        <div className="right">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="sub-label">stock</span>
            <div className="toggle-strip" style={{ height: 22 }}>
              {[6000, 9000, 12000].map(s => (
                <button
                  key={s}
                  type="button"
                  className={stockLen === s ? 'active' : ''}
                  onClick={() => setStockLen(s)}
                  style={{ padding: '0 8px', fontSize: 10.5 }}
                >
                  {s / 1000}m
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--color-line-2)', background: 'var(--color-bg)' }}>
        <SummaryCell label="Total mass" value={`${totalMass.toFixed(1)} kg`} sub={`stock × ${stockLen / 1000}m`} />
        <SummaryCell label="Net (in-place)" value={`${totalNetMass.toFixed(1)} kg`} sub={`${(totalNetMass / Math.max(0.001, totalMass) * 100).toFixed(1)}% utilization`} />
        <SummaryCell label="Waste" value={`${totalWasteMass.toFixed(2)} kg`} sub={`${(totalWasteMass / Math.max(0.001, totalMass) * 100).toFixed(1)}% scrap`} />
        <SummaryCell label="Stock bars" value={`${totalStockBars} pcs`} sub={`across ${Object.keys(byDia).length} dia${Object.keys(byDia).length > 1 ? 's' : ''}`} />
      </div>

      <div className="card-b" style={{ padding: 0 }}>
        {/* Cutting list */}
        <table className="t" style={{ fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ width: 50 }}>mark</th>
              <th>description</th>
              <th style={{ width: 55 }}>shape</th>
              <th className="num" style={{ width: 36, textAlign: 'right' }}>db</th>
              <th className="num" style={{ width: 50, textAlign: 'right' }}>qty</th>
              <th className="num" style={{ width: 80, textAlign: 'right' }}>cut len</th>
              <th className="num" style={{ width: 55, textAlign: 'right' }}>splices</th>
              <th className="num" style={{ width: 75, textAlign: 'right' }}>total len</th>
              <th className="num" style={{ width: 65, textAlign: 'right' }}>kg/m</th>
              <th className="num" style={{ width: 70, textAlign: 'right' }}>mass</th>
            </tr>
          </thead>
          <tbody>
            {marks.map(m => {
              const totLen = m.cutLen * m.count
              const mass = (totLen / 1000) * (BAR_MASS[m.db] || 0)
              const isSel = selectedMark === m.mark
              return (
                <tr
                  key={m.mark}
                  onClick={() => setSelectedMark(isSel ? null : m.mark)}
                  style={{ cursor: 'pointer', background: isSel ? '#FEF3E0' : undefined }}
                >
                  <td><span className="mono" style={{ fontWeight: 700, color: 'var(--color-ink)' }}>{m.mark}</span></td>
                  <td style={{ color: 'var(--color-ink-2)' }}>{m.desc}</td>
                  <td><BarShapeIcon shape={m.shape} /></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono">Ø{m.db}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono">{m.count}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono">{m.cutLen.toLocaleString()}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    <span className="mono" style={{ color: m.splices > 0 ? '#A12424' : 'var(--color-ink-4)' }}>
                      {m.splices > 0 ? `+${m.splices}` : '—'}
                    </span>
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono">{totLen.toLocaleString()}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ color: 'var(--color-ink-3)' }}>{(BAR_MASS[m.db] || 0).toFixed(3)}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ fontWeight: 600 }}>{mass.toFixed(2)}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* By diameter aggregation */}
        <div style={{ borderTop: '1px solid var(--color-line-2)', padding: '8px 12px', background: 'var(--color-bg)' }}>
          <div className="sub-label" style={{ marginBottom: 6 }}>Aggregated by diameter · stock bar requirement</div>
          <table className="t" style={{ fontSize: 11, background: '#fff' }}>
            <thead>
              <tr>
                <th style={{ width: 50 }}>db</th>
                <th className="num" style={{ width: 70, textAlign: 'right' }}>pieces</th>
                <th className="num" style={{ width: 90, textAlign: 'right' }}>net cut</th>
                <th className="num" style={{ width: 80, textAlign: 'right' }}>net mass</th>
                <th className="num" style={{ width: 80, textAlign: 'right' }}>stock bars</th>
                <th className="num" style={{ width: 90, textAlign: 'right' }}>stock mass</th>
                <th className="num" style={{ width: 80, textAlign: 'right' }}>scrap</th>
                <th className="num" style={{ width: 60, textAlign: 'right' }}>waste %</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(byDia).sort((a, b) => a.db - b.db).map(g => (
                <tr key={g.db}>
                  <td><span className="mono" style={{ fontWeight: 600 }}>Ø{g.db}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono">{g.pieces}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono">{Math.round(g.totalCut).toLocaleString()}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono">{g.mass.toFixed(2)}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ fontWeight: 700 }}>{g.stockBars}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ fontWeight: 600 }}>{g.stockMass.toFixed(2)}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ color: 'var(--color-ink-3)' }}>{(g.waste / 1000).toFixed(2)}m</span></td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    <span
                      className="mono"
                      style={{
                        color: g.wastePct > 15 ? 'var(--color-fail)' : g.wastePct > 8 ? 'var(--color-warn)' : 'var(--color-pass)',
                      }}
                    >
                      {g.wastePct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#F5F2EB', fontWeight: 600 }}>
                <td><span className="mono">TOTAL</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono">{Object.values(byDia).reduce((s, g) => s + g.pieces, 0)}</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono">{Math.round(Object.values(byDia).reduce((s, g) => s + g.totalCut, 0)).toLocaleString()}</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono">{totalNetMass.toFixed(2)}</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono">{totalStockBars}</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono">{totalMass.toFixed(2)} kg</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono">{(totalWasteMm / 1000).toFixed(2)}m</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono">{(totalWasteMass / Math.max(0.001, totalMass) * 100).toFixed(1)}%</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Notes */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-line-2)', fontSize: 10.5, color: 'var(--color-ink-3)', lineHeight: 1.5 }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)', marginBottom: 3 }}>
            cut-length basis · ACI 318-19 §25.3 / §25.4 / §25.5 · NSCP 2015 §425
          </div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            <li>Straight bars: <span className="mono">L = span + 2·ldh</span> (90° hook each end into column)</li>
            <li>Bent-up truss: <span className="mono">L = (span − 2·bendL − 2·run) + 2·diag + 2·bendL + 2·ldh</span></li>
            <li>Pieces &gt; {stockLen / 1000} m stock are split → Class B lap added at <span className="mono">ls = 1.3·ld</span></li>
            <li>Stirrup: <span className="mono">L = 2(b+h) − 8·cover + 2·hook</span> (135°, tail = max 6db, 75 mm)</li>
            <li>Stock bars from First-Fit Decreasing bin packing — actual jobsite waste ≈ 2–4% higher</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function SummaryCell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ padding: '8px 12px', borderRight: '1px solid var(--color-line-2)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="sub-label">{label}</span>
      <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{value}</span>
      <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>{sub}</span>
    </div>
  )
}

function BarShapeIcon({ shape }: { shape: BarShape }) {
  const stroke = shape === 'L-hooked' ? '#157A6A' : shape === 'stirrup' ? '#1755A0' : '#B06008'
  if (shape === 'stirrup') {
    return (
      <svg width={36} height={20} viewBox="0 0 36 20">
        <rect x={4} y={3} width={28} height={14} fill="none" stroke={stroke} strokeWidth={1.4} />
        <line x1={32} y1={3} x2={36} y2={0} stroke={stroke} strokeWidth={1.2} />
      </svg>
    )
  }
  if (shape === 'bent-truss') {
    return (
      <svg width={36} height={20} viewBox="0 0 36 20">
        <path d="M 2 18 L 2 14 L 8 14 L 14 6 L 22 6 L 28 14 L 34 14 L 34 18" fill="none" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    )
  }
  if (shape === 'L-hooked') {
    return (
      <svg width={36} height={20} viewBox="0 0 36 20">
        <path d="M 4 18 L 4 6 L 32 6" fill="none" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width={36} height={20} viewBox="0 0 36 20">
      <path d="M 4 18 L 4 6 L 32 6 L 32 18" fill="none" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Pure helpers — outside component so they don't recompute on every render
// ---------------------------------------------------------------------------

type BuildArgs = Omit<RebarMTOProps, 'beamId'> & { stockLen: number }

function buildMarks(args: BuildArgs) {
  const {
    span, h, b, cover, perimDia,
    t1Count, t1Dia, t1Bent, t2Count, t2Dia, t2Bent,
    c1Count, c1Dia, c2Count, c2Dia,
    torsCount, torsDia,
    stirDia, stirSpacingEnd, stirSpacingMid,
    bendL, fc, fy, stockLen,
  } = args

  const sqrtFc = Math.sqrt(fc!)
  const ld = (db: number) => {
    const psiS = db <= 20 ? 0.8 : 1.0
    const cb = cover + perimDia / 2
    const conf = Math.min(2.5, cb / db)
    return Math.max(300, Math.ceil(((fy! * psiS) / (1.1 * sqrtFc * conf) * db) / 10) * 10)
  }
  const ldh = (db: number) => Math.max(8 * db, 150, Math.ceil((fy! / (23 * sqrtFc) * Math.pow(db, 1.5)) / 10) * 10)
  const lapB = (db: number) => Math.max(300, Math.ceil(ld(db) * 1.3 / 10) * 10)

  const denseEnd = 1500
  let stirCount = 0
  for (let x = 0; x < denseEnd; x += stirSpacingEnd) stirCount++
  for (let x = denseEnd; x < span - denseEnd; x += stirSpacingMid) stirCount++
  for (let x = span - denseEnd; x <= span; x += stirSpacingEnd) stirCount++
  const stirCutLen = 2 * (b + h) - 8 * cover + 2 * Math.max(75, 6 * stirDia)

  const dy = h - 2 * cover - perimDia
  const bendRun = dy * 1.2
  const diag = Math.sqrt(dy * dy + bendRun * bendRun)
  const bentBarLen = (db: number) => 2 * ldh(db) + 2 * bendL + 2 * diag + (span - 2 * bendL - 2 * bendRun)
  const straightBotLen = (db: number) => span + 2 * ldh(db)
  const hangerLen = (db: number) => bendL + ld(db) + ldh(db)

  const t1BentCount = t1Bent.filter(x => x === 'both').length
  const t1StraightCount = t1Count - t1BentCount
  const t2BentCount = t2Bent.filter(x => x === 'both').length
  const t2StraightCount = t2Count - t2BentCount

  const marks: Mark[] = [
    { mark: 'M1', desc: 'Perimeter — top corners', shape: 'straight-hooked', count: 2, db: perimDia, cutLen: span + 2 * ldh(perimDia), splices: 0 },
    { mark: 'M2', desc: 'Perimeter — bot corners', shape: 'straight-hooked', count: 2, db: perimDia, cutLen: span + 2 * ldh(perimDia), splices: 0 },
  ]
  if (t1StraightCount > 0) marks.push({ mark: 'M3', desc: 'Bottom L1 · straight', shape: 'straight-hooked', count: t1StraightCount, db: t1Dia, cutLen: straightBotLen(t1Dia), splices: 0 })
  if (t1BentCount > 0) marks.push({ mark: 'M4', desc: 'Bottom L1 · bent-up (truss)', shape: 'bent-truss', count: t1BentCount, db: t1Dia, cutLen: bentBarLen(t1Dia), splices: 0 })
  if (t2StraightCount > 0) marks.push({ mark: 'M5', desc: 'Bottom L2 · straight', shape: 'straight-hooked', count: t2StraightCount, db: t2Dia, cutLen: straightBotLen(t2Dia), splices: 0 })
  if (t2BentCount > 0) marks.push({ mark: 'M6', desc: 'Bottom L2 · bent-up', shape: 'bent-truss', count: t2BentCount, db: t2Dia, cutLen: bentBarLen(t2Dia), splices: 0 })
  if (c1Count > 0) marks.push({ mark: 'M7', desc: 'Top hanger L1 · @ supports', shape: 'L-hooked', count: c1Count * 2, db: c1Dia, cutLen: hangerLen(c1Dia), splices: 0 })
  if (c2Count > 0) marks.push({ mark: 'M8', desc: 'Top hanger L2 · @ supports', shape: 'L-hooked', count: c2Count * 2, db: c2Dia, cutLen: hangerLen(c2Dia), splices: 0 })
  if (torsCount > 0) marks.push({ mark: 'M9', desc: 'Torsional / skin · pairs', shape: 'straight-hooked', count: torsCount * 2, db: torsDia, cutLen: span + 2 * ldh(torsDia), splices: 0 })
  marks.push({ mark: 'M10', desc: `Stirrup · Ø${stirDia} closed tie`, shape: 'stirrup', count: stirCount, db: stirDia, cutLen: stirCutLen, splices: 0 })

  marks.forEach(m => {
    if (m.cutLen > stockLen) {
      const segs = Math.ceil(m.cutLen / stockLen)
      m.splices = segs - 1
      m.cutLen = m.cutLen + m.splices * lapB(m.db)
    }
  })

  // Aggregate by diameter
  const byDia: Record<number, {
    db: number
    totalCut: number
    pieces: number
    mass: number
    stockBars: number
    waste: number
    wastePct: number
    stockMass: number
  }> = {}
  marks.forEach(m => {
    const totalCut = m.cutLen * m.count
    if (!byDia[m.db]) byDia[m.db] = { db: m.db, totalCut: 0, pieces: 0, mass: 0, stockBars: 0, waste: 0, wastePct: 0, stockMass: 0 }
    byDia[m.db].totalCut += totalCut
    byDia[m.db].pieces += m.count
    byDia[m.db].mass += (totalCut / 1000) * (BAR_MASS[m.db] || 0)
  })

  // Bin packing per dia (FFD)
  Object.values(byDia).forEach(g => {
    const pieces: number[] = []
    marks.filter(m => m.db === g.db).forEach(m => {
      for (let i = 0; i < m.count; i++) pieces.push(m.cutLen)
    })
    pieces.sort((a, b) => b - a)
    const bins: number[] = []
    pieces.forEach(p => {
      if (p > stockLen) {
        const fullBars = Math.floor(p / stockLen)
        const rem = p - fullBars * stockLen
        for (let i = 0; i < fullBars; i++) bins.push(0)
        if (rem > 0) {
          let placed = false
          for (let j = 0; j < bins.length; j++) {
            if (bins[j] >= rem) { bins[j] -= rem; placed = true; break }
          }
          if (!placed) bins.push(stockLen - rem)
        }
        return
      }
      let placed = false
      for (let j = 0; j < bins.length; j++) {
        if (bins[j] >= p) { bins[j] -= p; placed = true; break }
      }
      if (!placed) bins.push(stockLen - p)
    })
    g.stockBars = bins.length
    g.waste = bins.reduce((s, r) => s + r, 0)
    g.wastePct = g.stockBars > 0 ? (g.waste / (g.stockBars * stockLen)) * 100 : 0
    g.stockMass = (g.stockBars * stockLen / 1000) * (BAR_MASS[g.db] || 0)
  })

  const totalMass = Object.values(byDia).reduce((s, g) => s + g.stockMass, 0)
  const totalNetMass = Object.values(byDia).reduce((s, g) => s + g.mass, 0)
  const totalWasteMass = totalMass - totalNetMass
  const totalStockBars = Object.values(byDia).reduce((s, g) => s + g.stockBars, 0)
  const totalWasteMm = Object.values(byDia).reduce((s, g) => s + g.waste, 0)

  return { marks, byDia, totalMass, totalNetMass, totalWasteMass, totalStockBars, totalWasteMm }
}
