'use client'

import { useState } from 'react'

import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode, type CodeStandard } from '@/lib/engineering/codes'

/**
 * Column rebar Material Take-Off — cutting list with V1 (vertical) and
 * T1 (tie) marks, summary strip, and bar detail view with SVG diagrams.
 * Uses CodeProvider for bar_mass_kg_per_m.
 */
export function ColRebarMTO({
  colId,
  b,
  h,
  Hc,
  cover,
  barDia,
  nLong,
  tieDia,
  tiePattern,
  sConf,
  sMid,
  loConf,
  fc,
  fy,
  code_standard,
}: {
  colId: string
  b: number; h: number; Hc: number; cover: number
  barDia: number; nLong: number
  tieDia: number; tiePattern: string
  sConf: number; sMid: number; loConf: number
  fc: number; fy: number
  code_standard: CodeStandard
}) {
  const code = getCode(code_standard)
  const [activeMark, setActiveMark] = useState(0)

  // Use code provider for development/splice lengths
  const ldTension = code.Ld(barDia, fc, fy, false, cover + tieDia)
  const ls = Math.max(300, Math.ceil(code.lap_splice(ldTension, 'B') / 10) * 10)
  const ldc = Math.max(200, Math.ceil(ldTension * 0.6 / 10) * 10)
  const offsetBend = Math.round(ls / 6)

  const hook135 = Math.max(6 * tieDia, 75)
  const tiePerim = 2 * (b - 2 * cover - tieDia) + 2 * (h - 2 * cover - tieDia) + 2 * hook135

  const ntop = Math.floor(loConf / sConf) + 1
  const nbot = ntop
  const midLen = Hc - 2 * loConf
  const nmid = Math.max(0, Math.floor(midLen / sMid) - 1)
  const tieTotal = ntop + nmid + nbot

  type Mark = {
    mark: string; desc: string; shape: 'vertical-offset' | 'tie' | 'straight'
    count: number; db: number; cutLen: number; splices: number
    segs: { lbl: string; len: number }[]
  }

  const marks: Mark[] = [
    {
      mark: 'V1',
      desc: `vertical bar — full lift + offset bend + lap`,
      shape: 'vertical-offset',
      count: nLong,
      db: barDia,
      cutLen: Hc + offsetBend + ls,
      splices: 1,
      segs: [
        { lbl: 'lower lift (footing)', len: ldc },
        { lbl: 'lower lift to floor line', len: Hc - ldc - offsetBend - 30 },
        { lbl: 'offset bend (1:6)', len: Math.round(Math.sqrt(offsetBend * offsetBend + 30 * 30)) },
        { lbl: 'lap zone', len: ls },
        { lbl: 'upper lift continuation', len: 200 },
      ],
    },
    {
      mark: 'T1',
      desc: `${tiePattern === 'spiral' ? 'spiral' : 'closed tie'} — perimeter w/ 135° hooks`,
      shape: 'tie',
      count: tieTotal,
      db: tieDia,
      cutLen: tiePerim,
      splices: 0,
      segs: [
        { lbl: `b − 2c − dt = ${b - 2 * cover - tieDia}`, len: b - 2 * cover - tieDia },
        { lbl: `h − 2c − dt = ${h - 2 * cover - tieDia}`, len: h - 2 * cover - tieDia },
        { lbl: `b − 2c − dt`, len: b - 2 * cover - tieDia },
        { lbl: `h − 2c − dt`, len: h - 2 * cover - tieDia },
        { lbl: `2 × hook 135°  (${hook135} ea)`, len: 2 * hook135 },
      ],
    },
  ]

  const massOf = (m: Mark) => m.count * (m.cutLen / 1000) * code.bar_mass_kg_per_m(m.db)
  const totalMass = marks.reduce((s, m) => s + massOf(m), 0)
  const totalLen = marks.reduce((s, m) => s + m.count * m.cutLen, 0)

  const m = marks[activeMark]

  return (
    <div className="card">
      <div className="card-h">
        <span className="num-badge">6</span>
        <span className="label">Material Take-Off · Cutting List</span>
        <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
          {colId} · ls = {ls} · ldc = {ldc} · tie perim = {tiePerim} mm
        </span>
        <div className="right">
          <span className="tag">{nLong}× Ø{barDia} vert</span>
          <span className="tag">{tieTotal}× Ø{tieDia} ties</span>
          <span className="tag pass">Σ {totalMass.toFixed(1)} kg</span>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: '1px solid var(--color-line-2)', background: 'var(--color-bg)' }}>
        <SummaryCell label="marks" value={marks.length.toString()} sub={`${nLong + tieTotal} pcs total`} />
        <SummaryCell label="vertical length" value={`${(nLong * marks[0].cutLen / 1000).toFixed(2)} m`} sub={`${nLong} × ${marks[0].cutLen} mm`} />
        <SummaryCell label="tie length" value={`${(tieTotal * tiePerim / 1000).toFixed(1)} m`} sub={`${tieTotal} × ${tiePerim} mm`} />
        <SummaryCell label="Σ steel length" value={`${(totalLen / 1000).toFixed(1)} m`} sub="all marks" />
        <SummaryCell label="Σ mass" value={`${totalMass.toFixed(1)} kg`} sub="Gr 60" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', borderTop: '1px solid var(--color-line-2)' }}>
        {/* LEFT: marks table */}
        <div style={{ borderRight: '1px solid var(--color-line-2)' }}>
          <table className="t" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ width: 42 }}>mark</th>
                <th>description</th>
                <th style={{ width: 34 }}>shape</th>
                <th className="num" style={{ width: 36, textAlign: 'right' }}>db</th>
                <th className="num" style={{ width: 38, textAlign: 'right' }}>n</th>
                <th className="num" style={{ width: 80, textAlign: 'right' }}>cut len (mm)</th>
                <th className="num" style={{ width: 64, textAlign: 'right' }}>mass (kg)</th>
              </tr>
            </thead>
            <tbody>
              {marks.map((mk, i) => (
                <tr key={mk.mark} onClick={() => setActiveMark(i)}
                  style={{ cursor: 'pointer', background: i === activeMark ? 'var(--color-panel)' : 'transparent' }}>
                  <td><span className="mono" style={{ fontWeight: 700 }}>{mk.mark}</span></td>
                  <td style={{ color: 'var(--color-ink-2)' }}>{mk.desc}</td>
                  <td><BarShapeIcon shape={mk.shape} /></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono">Ø{mk.db}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono">{mk.count}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono">{mk.cutLen.toLocaleString()}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ fontWeight: 600 }}>{massOf(mk).toFixed(1)}</span></td>
                </tr>
              ))}
              <tr style={{ background: '#F5F2EB', fontWeight: 600, borderTop: '2px solid var(--color-line-2)' }}>
                <td colSpan={4}><span className="mono">TOTAL</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono">{nLong + tieTotal}</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono">{totalLen.toLocaleString()}</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono">{totalMass.toFixed(1)}</span></td>
              </tr>
            </tbody>
          </table>
          <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--color-ink-4)', background: 'var(--color-bg)', borderTop: '1px solid var(--color-line-2)' }} className="mono">
            mass from code.bar_mass_kg_per_m · Ø{barDia}: {code.bar_mass_kg_per_m(barDia).toFixed(3)} · Ø{tieDia}: {code.bar_mass_kg_per_m(tieDia).toFixed(3)} kg/m
          </div>
        </div>

        {/* RIGHT: bar detail */}
        <BarDetailView mark={m} ldc={ldc} ls={ls} hook135={hook135} b={b} h={h} cover={cover} tieDia={tieDia} />
      </div>
    </div>
  )
}

function SummaryCell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ padding: '8px 12px', borderRight: '1px solid var(--color-line-2)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 9.5, color: 'var(--color-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
      <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-ink)' }}>{value}</div>
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-ink-4)' }}>{sub}</div>
    </div>
  )
}

function BarShapeIcon({ shape }: { shape: string }) {
  const w = 44, hh = 18
  if (shape === 'tie') {
    return (
      <svg width={w} height={hh} viewBox={`0 0 ${w} ${hh}`}>
        <rect x={4} y={2} width={36} height={14} fill="none" stroke="#1755A0" strokeWidth={1.2} />
        <line x1={38} y1={2} x2={42} y2={6} stroke="#1755A0" strokeWidth={1.2} />
      </svg>
    )
  }
  if (shape === 'vertical-offset') {
    return (
      <svg width={w} height={hh} viewBox={`0 0 ${w} ${hh}`}>
        <path d="M 14 2 L 14 7 L 22 11 L 22 16" fill="none" stroke="#B06008" strokeWidth={1.4} strokeLinecap="round" />
        <line x1={28} y1={2} x2={28} y2={16} stroke="#D4820F" strokeWidth={1.4} strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width={w} height={hh} viewBox={`0 0 ${w} ${hh}`}>
      <line x1={20} y1={2} x2={20} y2={16} stroke="#B06008" strokeWidth={1.4} />
    </svg>
  )
}

function BarDetailView({ mark, ldc, ls, hook135, b, h, cover, tieDia }: {
  mark: { mark: string; desc: string; shape: string; count: number; db: number; cutLen: number; splices: number; segs: { lbl: string; len: number }[] }
  ldc: number; ls: number; hook135: number; b: number; h: number; cover: number; tieDia: number
}) {
  const W = 480, H = 280

  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>{mark.mark}</span>
        <span style={{ fontSize: 11.5, color: 'var(--color-ink-2)' }}>{mark.desc}</span>
        <span className="tag">Ø{mark.db}</span>
        <span className="tag">{mark.count} pcs</span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--color-ink-3)' }}>cut len = {mark.cutLen.toLocaleString()} mm</span>
        {mark.splices > 0 && <span className="mono" style={{ fontSize: 11, color: 'var(--color-fail)' }}>+{mark.splices} splice (ls={ls})</span>}
      </div>

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
        style={{ background: '#fff', border: '1px solid var(--color-line-2)', borderRadius: 4 }}>
        {mark.shape === 'vertical-offset' ? (
          <g>
            <line x1={40} y1={H / 2} x2={W - 40} y2={H / 2} stroke="#7A6E5A" strokeWidth={0.6} strokeDasharray="3 3" />
            <text x={W - 44} y={H / 2 - 4} textAnchor="end" fontFamily="var(--font-mono)" fontSize={9} fill="#6B6058">floor line</text>

            <path d={`M ${W / 2 - 30} ${H - 24} L ${W / 2 - 30} ${H / 2 + 30} L ${W / 2 - 12} ${H / 2 - 4} L ${W / 2 - 12} 30`}
              fill="none" stroke="#B06008" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />

            <rect x={W / 2 - 22} y={H / 2 - 28} width={20} height={50}
              fill="#FEE7B8" opacity={0.5} stroke="#B06008" strokeDasharray="2 2" strokeWidth={0.5} />

            <g fontFamily="var(--font-mono)" fontSize={9.5} fill="#6B7079">
              <line x1={W / 2 - 60} y1={H - 24} x2={W / 2 - 60} y2={H / 2 + 30} stroke="#9CA0A8" strokeWidth={0.6} />
              <text x={W / 2 - 64} y={(H - 24 + H / 2 + 30) / 2} textAnchor="end" dominantBaseline="middle" fill="#8A6112">ldc = {ldc}</text>
              <text x={W / 2 + 6} y={H / 2 - 4} fontSize={9} fill="#8A6112">offset 1:6</text>
              <line x1={W / 2 + 16} y1={H / 2 - 28} x2={W / 2 + 16} y2={H / 2 + 22} stroke="#9CA0A8" strokeWidth={0.6} />
              <text x={W / 2 + 20} y={H / 2 - 4} fill="#8A6112">ls = {ls}</text>
              <text x={W / 2 - 12} y={20} textAnchor="middle" fill="#6B7079">upper lift</text>
              <text x={W / 2 - 30} y={H - 8} textAnchor="middle" fill="#6B7079">lower lift</text>
            </g>
          </g>
        ) : (
          <g>
            {(() => {
              const sw = 200, sh = 140
              const x0 = (W - sw) / 2, y0 = (H - sh) / 2
              return (
                <g>
                  <path d={`M ${x0} ${y0} L ${x0 + sw} ${y0} L ${x0 + sw} ${y0 + sh} L ${x0} ${y0 + sh} L ${x0} ${y0} L ${x0 + sw} ${y0} L ${x0 + sw + 22} ${y0 - 18}`}
                    fill="none" stroke="#1755A0" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                  <text x={x0 + sw + 24} y={y0 - 22} fontFamily="var(--font-mono)" fontSize={9} fill="#1755A0">135° hook · {hook135} mm</text>
                  <g fontFamily="var(--font-mono)" fontSize={9.5} fill="#6B7079">
                    <text x={x0 + sw / 2} y={y0 - 8} textAnchor="middle">b − 2c − dt = {b - 2 * cover - tieDia}</text>
                    <text x={x0 + sw + 30} y={y0 + sh / 2 + 14}>h − 2c − dt</text>
                    <text x={x0 + sw + 30} y={y0 + sh / 2 + 28}>  = {h - 2 * cover - tieDia}</text>
                  </g>
                </g>
              )
            })()}
          </g>
        )}
      </svg>

      {/* Segment table */}
      <table className="t" style={{ fontSize: 10.5, background: '#fff' }}>
        <thead>
          <tr>
            <th style={{ width: 50 }}>seg</th>
            <th>description</th>
            <th className="num" style={{ textAlign: 'right', width: 90 }}>length (mm)</th>
          </tr>
        </thead>
        <tbody>
          {mark.segs.map((s, i) => (
            <tr key={i}>
              <td><span className="mono" style={{ color: 'var(--color-ink-3)' }}>{i + 1}</span></td>
              <td style={{ color: 'var(--color-ink-2)' }}>{s.lbl}</td>
              <td className="num" style={{ textAlign: 'right' }}><span className="mono">{Math.round(s.len).toLocaleString()}</span></td>
            </tr>
          ))}
          <tr style={{ background: '#F5F2EB', fontWeight: 600 }}>
            <td colSpan={2}><span className="mono">TOTAL · per piece</span></td>
            <td className="num" style={{ textAlign: 'right' }}><span className="mono">{Math.round(mark.cutLen).toLocaleString()}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
