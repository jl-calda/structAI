'use client'

import { useState } from 'react'

import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'
import type { CodeStandard } from '@/lib/supabase/types'

/**
 * Development Length & Splicing card for columns.
 * Uses CodeProvider for Ld, lap_splice, bar_mass. Compression development,
 * tension development, hook, compression lap splice, offset-bend diagram.
 */
export function ColDevSpliceCard({
  fc,
  fy,
  cover,
  b,
  h,
  Hc,
  barDia,
  tieDia,
  nLong,
  code_standard,
}: {
  fc: number
  fy: number
  cover: number
  b: number
  h: number
  Hc: number
  barDia: number
  tieDia: number
  nLong: number
  code_standard: CodeStandard
}) {
  const code = getCode(code_standard)
  const [tiesConfine, setTiesConfine] = useState(true)
  const [lowFc, setLowFc] = useState(fc < 21)
  const [hookLoc, setHookLoc] = useState<'confined' | 'unconfined'>('confined')

  const lambda = 1.0
  const sqrtFc = Math.sqrt(fc)
  const psiG = fy <= 420 ? 1.0 : fy <= 550 ? 1.15 : 1.3

  // Use code provider for tension development and lap
  const ldTensFromCode = code.Ld(barDia, fc, fy, false, cover + tieDia)
  const lapTensB = code.lap_splice(ldTensFromCode, 'B')

  // Compression development (ACI 318 §25.4.9 / NSCP §425.4.9)
  const ldComp = (db: number) => {
    const a = (0.24 * fy * 1.0) / (lambda * sqrtFc) * db
    const b2 = 0.043 * fy * 1.0 * db
    return Math.max(200, Math.ceil(Math.max(a, b2) / 10) * 10)
  }

  // Tension development (via code provider)
  const ldTens = (db: number) => {
    return Math.max(300, Math.ceil(code.Ld(db, fc, fy, false, cover + tieDia) / 10) * 10)
  }

  // Hook (into footing/cap)
  const ldHook = (db: number) => {
    const psiR = hookLoc === 'confined' ? 1.0 : 1.6
    const ldh = (fy * 1.0 * psiR * 1.0 * 1.0) / (23 * lambda * sqrtFc) * Math.pow(db, 1.5)
    return Math.max(8 * db, 150, Math.ceil(ldh / 10) * 10)
  }

  // Compression lap splice (§25.5.5 / §425.5.5)
  const lapComp = (db: number) => {
    let l = fy <= 420 ? 0.071 * fy * db : (0.13 * fy - 24) * db
    if (lowFc) l *= 4 / 3
    if (tiesConfine) l *= 0.83
    return Math.max(300, Math.ceil(l / 10) * 10)
  }

  const ldGov = ldComp(barDia)
  const lsGov = lapComp(barDia)
  const offsetH = Math.round(lsGov / 6)
  const cb = cover + tieDia + barDia / 2

  return (
    <div className="card" data-step="4b-development">
      <div className="card-h">
        <span className="num-badge">4b</span>
        <span className="label">Development &amp; Splicing</span>
        <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
          §25.4 / §25.5 · λ={lambda.toFixed(1)} · ψg={psiG.toFixed(2)}
        </span>
        <div className="right">
          <span className="tag">ldc {ldGov}</span>
          <span className="tag">ls {lsGov}</span>
          <span className="tag">offset 1:6</span>
        </div>
      </div>

      {/* Modifier strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid var(--color-line-2)', background: 'var(--color-bg)' }}>
        <ModCell label="ties at splice" sub="≥ 0.0015·h·s" active={tiesConfine}>
          <ToggleStrip
            options={[
              { label: '1.00', active: !tiesConfine, onClick: () => setTiesConfine(false) },
              { label: '0.83 conf', active: tiesConfine, onClick: () => setTiesConfine(true) },
            ]}
          />
        </ModCell>
        <ModCell label="fc′ category" sub="×1.33 if fc′ < 21 MPa" active={lowFc}>
          <ToggleStrip
            options={[
              { label: '≥ 21 MPa', active: !lowFc, onClick: () => setLowFc(false) },
              { label: '< 21 ×1.33', active: lowFc, onClick: () => setLowFc(true) },
            ]}
          />
        </ModCell>
        <ModCell label="ψr · hook conf." sub="ties enclose hook">
          <ToggleStrip
            options={[
              { label: '1.0 conf', active: hookLoc === 'confined', onClick: () => setHookLoc('confined') },
              { label: '1.6 unc', active: hookLoc === 'unconfined', onClick: () => setHookLoc('unconfined') },
            ]}
          />
        </ModCell>
      </div>

      <div className="card-b" style={{ padding: 0, display: 'grid', gridTemplateColumns: '1.4fr 1fr' }}>
        {/* LEFT: per-bar table */}
        <div style={{ borderRight: '1px solid var(--color-line-2)' }}>
          <table className="t" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>bar</th>
                <th className="num" style={{ width: 36, textAlign: 'right' }}>db</th>
                <th className="num" style={{ textAlign: 'right' }}>ldc <span style={{ color: 'var(--color-ink-4)', fontWeight: 400 }}>comp</span></th>
                <th className="num" style={{ textAlign: 'right' }}>ld <span style={{ color: 'var(--color-ink-4)', fontWeight: 400 }}>tens</span></th>
                <th className="num" style={{ textAlign: 'right' }}>ldh <span style={{ color: 'var(--color-ink-4)', fontWeight: 400 }}>hook</span></th>
                <th className="num" style={{ textAlign: 'right' }}>ls <span style={{ color: 'var(--color-ink-4)', fontWeight: 400 }}>comp lap</span></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span style={{ fontWeight: 500 }}>Vertical</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono">Ø{barDia}</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ fontWeight: 600 }}>{ldComp(barDia)}</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ color: 'var(--color-ink-3)' }}>{ldTens(barDia)}</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ color: 'var(--color-ink-3)' }}>{ldHook(barDia)}</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ fontWeight: 600 }}>{lapComp(barDia)}</span></td>
              </tr>
            </tbody>
          </table>
          <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--color-ink-4)', borderTop: '1px solid var(--color-line-2)', background: 'var(--color-bg)' }} className="mono">
            all values in mm · rounded ↑ 10 mm · cb = {cb.toFixed(0)} mm · √fc′ = {sqrtFc.toFixed(2)} · ldc min 200, ls min 300
          </div>
        </div>

        {/* RIGHT: governing equations */}
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <EqCard
            title="Compression · ldc (§25.4.9.2)"
            eq="ldc = max( 0.24·fy·ψr / (λ·√fc′) · db ,  0.043·fy·ψr·db )"
            sub={[
              `0.24·${fy}/(${lambda}·${sqrtFc.toFixed(2)})·${barDia} = ${Math.round(0.24 * fy / (lambda * sqrtFc) * barDia)}`,
              `0.043·${fy}·${barDia} = ${Math.round(0.043 * fy * barDia)}`,
              `min: 200 mm`,
            ]}
          />
          <EqCard
            title="Compression lap · ls (§25.5.5)"
            eq={fy <= 420 ? 'ls = 0.071·fy·db' : 'ls = (0.13·fy − 24)·db'}
            sub={[
              `base: ${Math.round((fy <= 420 ? 0.071 * fy : 0.13 * fy - 24) * barDia)} mm`,
              tiesConfine ? '× 0.83  (ties confine, §25.5.5.3)' : 'no tie reduction',
              lowFc ? '× 1.33  (fc′ < 21 MPa)' : '',
              `min: 300 mm  →  ls = ${lsGov} mm`,
            ]}
          />
          <EqCard
            title="Offset bend · §10.7.4.1"
            eq="slope ≤ 1:6  ·  horiz tie within 150 mm of bend"
            sub={[
              `over ls = ${lsGov} mm → max horizontal offset = ${offsetH} mm`,
              `lateral force at bend ≈ 1.5·As·fy / 6 (resisted by tie)`,
            ]}
          />
        </div>
      </div>

      {/* Splice elevation diagram */}
      <div style={{ borderTop: '1px solid var(--color-line-2)', padding: '10px 12px', background: 'var(--color-bg)' }}>
        <div className="sub-label" style={{ marginBottom: 6 }}>Floor splice · offset-bend detail</div>
        <ColSpliceDiagram Hc={Hc} barDia={barDia} ls={lsGov} ldc={ldGov} offsetH={offsetH} tieDia={tieDia} width={860} height={170} />
        <div style={{ display: 'flex', gap: 14, fontSize: 10.5, color: 'var(--color-ink-3)', marginTop: 6, flexWrap: 'wrap' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 2, background: '#B06008', marginRight: 4, verticalAlign: 'middle' }} />vertical bar (lower lift)</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 2, background: '#D4820F', marginRight: 4, verticalAlign: 'middle' }} />vertical bar (upper lift)</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 8, background: '#FEE7B8', border: '1px solid #B06008', marginRight: 4, verticalAlign: 'middle' }} />compression lap ls</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 2, background: '#1755A0', marginRight: 4, verticalAlign: 'middle' }} />tie at offset bend</span>
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)', marginTop: 6 }}>
          {nLong} verticals × Ø{barDia}: stagger ≥ 50% bars at any section · alternate splice levels by 0.3·ls or 600 mm where possible.
        </div>
      </div>
    </div>
  )
}

function ColSpliceDiagram({ Hc, barDia, ls, ldc, offsetH, tieDia, width, height }: {
  Hc: number; barDia: number; ls: number; ldc: number; offsetH: number; tieDia: number; width: number; height: number
}) {
  const padL = 60, padR = 60, padT = 14, padB = 26
  const w = width - padL - padR
  const yTop = padT, yBot = height - padB
  const lh = yBot - yTop
  const ySlab = yTop + lh * 0.55
  const slabH = 14

  const barX = width / 2 - 80
  const lapTopY = ySlab - 20
  const lapBotY = lapTopY + Math.min(lh * 0.6, ls * 0.18)
  const offsetTop = lapTopY
  const offsetBot = offsetTop - 30

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', background: '#fff', border: '1px solid var(--color-line-2)', borderRadius: 4 }}>
      {/* Slab */}
      <rect x={padL - 10} y={ySlab} width={w + 20} height={slabH}
        fill="#E8E3D7" stroke="#7A6E5A" strokeWidth={1} />
      <text x={padL - 14} y={ySlab + slabH / 2 + 3} textAnchor="end"
        fontFamily="var(--font-mono)" fontSize={9} fill="#6B6058">floor slab</text>

      {/* Lower lift bar */}
      <path d={`M ${barX} ${yBot} L ${barX} ${offsetBot + 30} L ${barX + 18} ${offsetBot} L ${barX + 18} ${lapTopY - 10}`}
        fill="none" stroke="#B06008" strokeWidth={2.4} strokeLinecap="round" />

      {/* Upper lift bar */}
      <line x1={barX + 18 + 4} y1={yTop} x2={barX + 18 + 4} y2={lapBotY + 10}
        stroke="#D4820F" strokeWidth={2.4} strokeLinecap="round" />

      {/* Lap splice zone shading */}
      <rect x={barX + 14} y={lapTopY - 10} width={14} height={lapBotY - lapTopY + 20}
        fill="#FEE7B8" opacity={0.55} stroke="#B06008" strokeDasharray="2 2" strokeWidth={0.6} />

      {/* Ties at offset bend */}
      {[offsetBot - 4, offsetBot + 6, lapTopY - 4, (lapTopY + lapBotY) / 2, lapBotY + 4].map((y, i) => (
        <line key={i} x1={barX - 10} y1={y} x2={barX + 36} y2={y}
          stroke="#1755A0" strokeWidth={1} opacity={0.85} />
      ))}

      {/* Dimensions */}
      <g fontFamily="var(--font-mono)" fontSize={9.5} fill="#6B7079">
        <line x1={barX + 60} y1={lapTopY - 10} x2={barX + 60} y2={lapBotY + 10}
          stroke="#9CA0A8" strokeWidth={0.6} />
        <line x1={barX + 57} y1={lapTopY - 10} x2={barX + 63} y2={lapTopY - 10} stroke="#9CA0A8" />
        <line x1={barX + 57} y1={lapBotY + 10} x2={barX + 63} y2={lapBotY + 10} stroke="#9CA0A8" />
        <text x={barX + 66} y={(lapTopY + lapBotY) / 2 + 3} fill="#8A6112" fontWeight={600}>ls = {ls} mm</text>

        <text x={barX - 6} y={offsetBot - 4} textAnchor="end" fill="#8A6112">1:6 slope</text>
        <text x={barX - 6} y={offsetBot + 8} textAnchor="end">Δh ≤ {offsetH} mm</text>
        <text x={padL + w - 10} y={yBot - 6} textAnchor="end">ldc into footing = {ldc} mm</text>
        <text x={barX + 200} y={yTop + 14}>upper lift Ø{barDia}</text>
        <text x={barX + 200} y={yBot - 4}>lower lift Ø{barDia}</text>
        <text x={barX + 200} y={(lapTopY + lapBotY) / 2 + 3} fill="#1755A0">tie Ø{tieDia} @ ≤150 from bend</text>
      </g>
    </svg>
  )
}

function ModCell({ label, sub, children, active }: {
  label: string; sub: string; children: React.ReactNode; active?: boolean
}) {
  return (
    <div style={{ padding: '8px 10px', borderRight: '1px solid var(--color-line-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 9.5, color: 'var(--color-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>{label}</span>
        {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-fail)' }} />}
      </div>
      <div style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>{sub}</div>
      <div style={{ marginTop: 2 }}>{children}</div>
    </div>
  )
}

function ToggleStrip({ options }: { options: { label: string; active: boolean; onClick: () => void }[] }) {
  return (
    <div style={{ display: 'flex', gap: 0, background: 'var(--color-bg)', borderRadius: 4, padding: 2, border: '1px solid var(--color-line-2)' }}>
      {options.map((o, i) => (
        <button key={i} type="button" onClick={o.onClick} style={{
          padding: '0 8px', fontSize: 10.5, fontWeight: 600, height: 22,
          borderRadius: 3, border: 0, cursor: 'pointer',
          background: o.active ? 'var(--color-ink)' : 'transparent',
          color: o.active ? '#fff' : 'var(--color-ink-3)',
        }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function EqCard({ title, eq, sub }: { title: string; eq: string; sub: string[] }) {
  return (
    <div style={{ border: '1px solid var(--color-line-2)', borderRadius: 4, background: '#fff' }}>
      <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--color-line-2)', fontSize: 10, fontWeight: 600, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
      <div style={{ padding: '6px 8px' }}>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink)', lineHeight: 1.4 }}>{eq}</div>
        {sub.filter(Boolean).map((s, i) => (
          <div key={i} className="mono" style={{ fontSize: 9.5, color: 'var(--color-ink-4)', marginTop: 2 }}>{s}</div>
        ))}
      </div>
    </div>
  )
}
