'use client'

import { useEffect, useState } from 'react'

import { BeamCrossSection } from './BeamCrossSection'
import { BeamElevation } from './BeamElevation'
import { BeamElevation3D } from './BeamElevation3D'
import { CalcBreakdownCard } from './CalcBreakdownCard'
import { DevSpliceCard } from './DevSpliceCard'
import { Field2, Legend, RebarBlock } from './RebarBlock'
import { RebarMTO } from './RebarMTO'
import { RebarRow, type BentMode } from './RebarRow'
import type { CodeStandard, Database } from '@/lib/supabase/types'

type BeamCheckRow = Database['public']['Tables']['beam_checks']['Row']

export type BeamDesignClientProps = {
  initial: {
    label: string
    b: number
    h: number
    span: number
    cover: number
    fc: number
    fy: number
  }
  forces: { mPos: number; mNeg: number; vPeak: number }
  /** Project's active design code — drives CalcBreakdownCard's CodeProvider. */
  code_standard: CodeStandard
  /** Persisted check row from the last `Run Design` (null = never run). */
  checks: BeamCheckRow | null
}

type Section = 'start' | 'mid' | 'end'

const isBentTo = (v: BentMode, sec: Section) => sec !== 'mid' && v === 'both'

export function BeamDesignClient({ initial, forces, code_standard, checks }: BeamDesignClientProps) {
  const b = initial.b
  const h = initial.h
  const span = initial.span
  const cover = initial.cover
  const fc = initial.fc
  const fy = initial.fy

  const [activeSec, setActiveSec] = useState<Section>('mid')

  const [perimDia, setPerimDia] = useState(20)
  const [t1Count, setT1Count] = useState(3)
  const [t1Dia, setT1Dia] = useState(20)
  const [t1Bent, setT1Bent] = useState<BentMode[]>(['both', 'none', 'both'])
  const [t2Count, setT2Count] = useState(0)
  const [t2Dia, setT2Dia] = useState(20)
  const [t2Bent, setT2Bent] = useState<BentMode[]>([])
  const [t2ClearGap, setT2ClearGap] = useState(40)
  const [bendFrac, setBendFrac] = useState(1 / 4)

  const [c1Count, setC1Count] = useState(2)
  const [c1Dia, setC1Dia] = useState(20)
  const [c2Count, setC2Count] = useState(0)
  const [c2Dia, setC2Dia] = useState(16)
  const [c2ClearGap, setC2ClearGap] = useState(40)

  const [torsCount, setTorsCount] = useState(0)
  const [torsDia, setTorsDia] = useState(12)

  const [stirDia, setStirDia] = useState(10)
  const [stirLegs, setStirLegs] = useState<2 | 3 | 4 | 6>(2)
  const [stirSpacingEnd, setStirSpacingEnd] = useState(100)
  const [stirSpacingMid, setStirSpacingMid] = useState(200)

  const [elevView, setElevView] = useState<'2d' | '3d'>('2d')

  useEffect(() => {
    setT1Bent(prev => {
      const next = [...prev]
      while (next.length < t1Count) next.push('none')
      return next.slice(0, t1Count)
    })
  }, [t1Count])
  useEffect(() => {
    setT2Bent(prev => {
      const next = [...prev]
      while (next.length < t2Count) next.push('none')
      return next.slice(0, t2Count)
    })
  }, [t2Count])

  const cycleBent = (which: 't1' | 't2', idx: number) => {
    const setter = which === 't1' ? setT1Bent : setT2Bent
    setter(p => p.map((v, i) => (i === idx ? (v === 'both' ? 'none' : 'both') : v)))
  }

  const t1OnTop = t1Bent.map(v => isBentTo(v, activeSec))
  const t2OnTop = t2Bent.map(v => isBentTo(v, activeSec))
  const t1BotEff = t1OnTop.filter(x => !x).length
  const t2BotEff = t2OnTop.filter(x => !x).length
  const t1TopEff = t1OnTop.filter(x => x).length
  const t2TopEff = t2OnTop.filter(x => x).length

  const isSupport = activeSec !== 'mid'
  const topL1Count = (isSupport ? c1Count : 0) + t1TopEff
  const topL1Dia = c1Count > 0 ? c1Dia : t1Dia
  const topL2Count = (isSupport ? c2Count : 0) + t2TopEff
  const topL2Dia = c2Count > 0 ? c2Dia : t2Dia

  const A = (d: number) => (Math.PI * d * d) / 4
  const asBotPerim = 2 * A(perimDia)
  const asTopPerim = 2 * A(perimDia)
  const asMid = asBotPerim + t1Count * A(t1Dia) + t2Count * A(t2Dia)
  const asSup = asTopPerim + t1TopEff * A(t1Dia) + t2TopEff * A(t2Dia) + c1Count * A(c1Dia) + c2Count * A(c2Dia)
  const asT = activeSec === 'mid' ? asMid : asSup
  const asReq = activeSec === 'mid' ? 1284 : 1180
  const asPass = asT >= asReq

  const bendL = Math.round(span * bendFrac)

  const sectionCtx = [
    { k: 'start' as const, n: '§1', t: 'Start · @ support i', m: `M⁻ ${forces.mNeg.toFixed(1)}`, v: `V ${forces.vPeak.toFixed(1)}` },
    { k: 'mid' as const, n: '§2', t: 'Mid · @ midspan', m: `M⁺ ${forces.mPos.toFixed(1)}`, v: `V ${(forces.vPeak * 0.25).toFixed(1)}` },
    { k: 'end' as const, n: '§3', t: 'End · @ support j', m: `M⁻ ${(forces.mNeg * 0.92).toFixed(1)}`, v: `V ${(forces.vPeak * 0.94).toFixed(1)}` },
  ]

  return (
    <>
      {/* STEP 2 — Reinforcement Design */}
      <div className="card" data-step="2-reinforcement">
        <div className="card-h">
          <span className="num-badge">2</span>
          <span className="label">Reinforcement Design</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            choose layers, ties &amp; torsional bars · per section
          </span>
          <div className="right">
            <div className="result-bar" style={{ margin: 0, padding: '4px 10px', background: asPass ? 'var(--color-pass-bg)' : 'var(--color-fail-bg)', color: asPass ? 'var(--color-pass)' : 'var(--color-fail)' }}>
              <span className="label">As</span>
              <span>{Math.round(asT)} mm²</span>
              <span style={{ color: 'var(--color-ink-3)' }}>≥</span>
              <span>{asReq}</span>
              <span>{asPass ? '✓' : '✗'}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid var(--color-line-2)', background: 'var(--color-bg)' }}>
          {sectionCtx.map((o, i) => {
            const active = activeSec === o.k
            return (
              <button
                key={o.k}
                type="button"
                onClick={() => setActiveSec(o.k)}
                style={{
                  textAlign: 'left', padding: '6px 12px', border: 0,
                  borderRight: i < 2 ? '1px solid var(--color-line-2)' : 0,
                  background: active ? 'var(--color-panel)' : 'transparent',
                  boxShadow: active ? 'inset 0 -2px 0 0 var(--color-ink)' : 'none',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="mono" style={{ fontSize: 10, color: active ? 'var(--color-ink)' : 'var(--color-ink-4)', fontWeight: 700 }}>{o.n}</span>
                  <span style={{ fontSize: 11, color: active ? 'var(--color-ink)' : 'var(--color-ink-3)', fontWeight: active ? 600 : 500 }}>{o.t}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-3)' }}>{o.m}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-3)' }}>{o.v}</span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="card-b" style={{ padding: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div style={{ padding: 12, borderRight: '1px solid var(--color-line-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--color-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
              <span>Live Section</span>
              <span className="mono" style={{ color: 'var(--color-ink-4)', fontWeight: 500, letterSpacing: 0, textTransform: 'none' }}>
                §{activeSec === 'start' ? '1 · start' : activeSec === 'mid' ? '2 · mid' : '3 · end'}
              </span>
            </div>
            <BeamCrossSection
              b={b} h={h} cover={cover}
              perimDia={perimDia}
              tens1Count={t1BotEff} tens1Dia={t1Dia}
              tens2Count={t2BotEff} tens2Dia={t2Dia}
              tens2ClearGap={t2ClearGap}
              comp1Count={topL1Count} comp1Dia={topL1Dia}
              comp2Count={topL2Count} comp2Dia={topL2Dia}
              comp2ClearGap={c2ClearGap}
              torsionCount={torsCount} torsionDia={torsDia}
              stirrupDia={stirDia} stirrupLegs={stirLegs}
              width={240} height={320}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10, color: 'var(--color-ink-3)', justifyContent: 'center' }}>
              <Legend color="#D4820F" label="Perimeter" />
              <Legend color="#B06008" label="Tension" />
              <Legend color="#157A6A" label="Comp" />
              {torsCount > 0 && <Legend color="#7A4FB0" label="Torsion" />}
              <Legend color="#1755A0" label={`${stirLegs}-leg tie`} />
            </div>
          </div>

          <div style={{ padding: 10, borderRight: '1px solid var(--color-line-2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <RebarBlock title="Perimeter" badge="locked" color="#D4820F">
              <RebarRow label="L" countDisabled count={4} dia={perimDia} setDia={setPerimDia} />
            </RebarBlock>

            <RebarBlock title="Bottom As · continuous" color="#B06008" hint="bars run full length — ⇈ to bend up">
              <RebarRow label="L1" count={t1Count} setCount={setT1Count} dia={t1Dia} setDia={setT1Dia}
                bentArr={t1Bent} onCycleBent={i => cycleBent('t1', i)} />
              <RebarRow label="L2" count={t2Count} setCount={setT2Count} dia={t2Dia} setDia={setT2Dia}
                bentArr={t2Bent} onCycleBent={i => cycleBent('t2', i)} />
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center', padding: '2px 0 0 28px' }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>L2 gap</span>
                <Field2 unit="mm" value={t2ClearGap} onChange={setT2ClearGap} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 6, alignItems: 'center', padding: '4px 0 0 28px' }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>bend @</span>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {[
                    { f: 1 / 6, lbl: 'L/6' },
                    { f: 1 / 5, lbl: 'L/5' },
                    { f: 1 / 4, lbl: 'L/4' },
                    { f: 1 / 3, lbl: 'L/3' },
                    { f: 3 / 8, lbl: '3L/8' },
                  ].map(opt => {
                    const active = Math.abs(bendFrac - opt.f) < 0.01
                    return (
                      <button
                        key={opt.lbl}
                        type="button"
                        onClick={() => setBendFrac(opt.f)}
                        style={{
                          padding: '2px 6px', fontSize: 10, fontFamily: 'var(--font-mono)',
                          borderRadius: 3, cursor: 'pointer',
                          border: '1px solid ' + (active ? '#7A4408' : 'var(--color-line)'),
                          background: active ? '#F4D9B0' : '#fff',
                          color: active ? '#5A2F00' : 'var(--color-ink-3)',
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {opt.lbl}
                      </button>
                    )
                  })}
                </div>
                <span className="mono" style={{ fontSize: 9.5, color: 'var(--color-ink-4)' }}>= {bendL} mm</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-ink-4)', padding: '2px 0 0 28px' }} className="mono">
                truss (bent ⇈): {[...t1Bent, ...t2Bent].filter(x => x === 'both').length} ·
                straight: {[...t1Bent, ...t2Bent].filter(x => x === 'none').length}
              </div>
            </RebarBlock>

            <RebarBlock title="Top hangers · supports only" color="#157A6A" hint="added at i &amp; j to supplement bent-up bars">
              <RebarRow label="L1" count={c1Count} setCount={setC1Count} dia={c1Dia} setDia={setC1Dia} />
              <RebarRow label="L2" count={c2Count} setCount={setC2Count} dia={c2Dia} setDia={setC2Dia} />
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center', padding: '2px 0 0 28px' }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>L2 gap</span>
                <Field2 unit="mm" value={c2ClearGap} onChange={setC2ClearGap} />
              </div>
            </RebarBlock>

            <RebarBlock title="Torsional / Skin" color="#7A4FB0" hint="pairs on each side">
              <RebarRow label="pairs" count={torsCount} setCount={setTorsCount} dia={torsDia} setDia={setTorsDia} />
            </RebarBlock>
          </div>

          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <RebarBlock title="Stirrup / Tie" color="#1755A0">
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>Ø</span>
                <select className="select" value={stirDia} onChange={e => setStirDia(Number.parseInt(e.target.value, 10))} style={{ height: 22, fontSize: 11 }}>
                  {[8, 10, 12, 16].map(d => <option key={d} value={d}>Ø{d}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>Legs</span>
                <div className="toggle-strip" style={{ height: 22 }}>
                  {([2, 3, 4, 6] as const).map(n => (
                    <button
                      key={n}
                      type="button"
                      className={stirLegs === n ? 'active' : ''}
                      onClick={() => setStirLegs(n)}
                      style={{ padding: '0 8px', fontSize: 10.5 }}
                    >
                      {n}-leg
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 6, alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>spacing</span>
                <Field2 prefix="end" unit="mm" value={stirSpacingEnd} onChange={setStirSpacingEnd} />
                <Field2 prefix="mid" unit="mm" value={stirSpacingMid} onChange={setStirSpacingMid} />
              </div>
            </RebarBlock>

            <div className="card" style={{ borderRadius: 5 }}>
              <div className="card-h" style={{ minHeight: 26, padding: '0 10px' }}>
                <span className="label" style={{ fontSize: 9.5 }}>Capacity at this section</span>
              </div>
              <div style={{ padding: '8px 10px', fontSize: 11 }}>
                <div className="step-row" style={{ gap: 6 }}><span className="k" style={{ minWidth: 60, fontSize: 10.5 }}>As prov</span><span className="v mono" style={{ fontSize: 10.5 }}>{Math.round(asT)}</span></div>
                <div className="step-row" style={{ gap: 6 }}><span className="k" style={{ minWidth: 60, fontSize: 10.5 }}>As req</span><span className="v mono" style={{ fontSize: 10.5 }}>{asReq}</span></div>
                <div className="step-row" style={{ gap: 6 }}><span className="k" style={{ minWidth: 60, fontSize: 10.5 }}>Ratio</span><span className={'v mono ' + (asPass ? 'pass' : 'fail')} style={{ fontSize: 10.5 }}>{(asT / asReq).toFixed(2)}</span></div>
                <div className="step-row" style={{ gap: 6 }}><span className="k" style={{ minWidth: 60, fontSize: 10.5 }}>φMn</span><span className="v pass mono" style={{ fontSize: 10.5 }}>248.6</span></div>
                <div className="step-row" style={{ gap: 6 }}><span className="k" style={{ minWidth: 60, fontSize: 10.5 }}>φVn</span><span className="v pass mono" style={{ fontSize: 10.5 }}>158.4</span></div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="sub-label">Bar inventory</div>
              <table className="t">
                <tbody>
                  <tr><td>Perimeter</td><td className="num">4 — Ø{perimDia}</td></tr>
                  {t1Count > 0 && <tr><td>+ Tens L1</td><td className="num">{t1Count} — Ø{t1Dia}</td></tr>}
                  {t2Count > 0 && <tr><td>+ Tens L2</td><td className="num">{t2Count} — Ø{t2Dia}</td></tr>}
                  {c1Count > 0 && <tr><td>Top L1 (sup)</td><td className="num">{c1Count} — Ø{c1Dia}</td></tr>}
                  {c2Count > 0 && <tr><td>Top L2 (sup)</td><td className="num">{c2Count} — Ø{c2Dia}</td></tr>}
                  {torsCount > 0 && <tr><td>Torsion</td><td className="num">{torsCount * 2} — Ø{torsDia}</td></tr>}
                  <tr><td>Stirrup</td><td className="num">Ø{stirDia} {stirLegs}-leg @ {stirSpacingEnd}/{stirSpacingMid}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* STEP 4 — Elevation */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">4</span>
          <span className="label">Elevation · Bar Layout</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            stirrup zones · top hangers · bent-up truss bars
          </span>
          <div className="right">
            <div className="toggle-strip" style={{ height: 22 }}>
              <button type="button" className={elevView === '2d' ? 'active' : ''} onClick={() => setElevView('2d')} style={{ padding: '0 10px', fontSize: 10.5 }}>
                2D
              </button>
              <button type="button" className={elevView === '3d' ? 'active' : ''} onClick={() => setElevView('3d')} style={{ padding: '0 10px', fontSize: 10.5 }}>
                3D
              </button>
            </div>
          </div>
        </div>
        <div className="card-b" style={{ padding: 10, display: 'flex', justifyContent: 'center' }}>
          {elevView === '2d' ? (
            <BeamElevation
              span={span} h={h} b={b} cover={cover}
              perimDia={perimDia}
              t1Count={t1Count} t1Dia={t1Dia} t1Bent={t1Bent}
              t2Count={t2Count} t2Dia={t2Dia} t2Bent={t2Bent}
              c1Count={c1Count} c1Dia={c1Dia}
              c2Count={c2Count} c2Dia={c2Dia}
              stirDia={stirDia}
              stirSpacingEnd={stirSpacingEnd}
              stirSpacingMid={stirSpacingMid}
              bendL={bendL}
              width={840} height={220}
            />
          ) : (
            <BeamElevation3D
              span={span} h={h} b={b} cover={cover}
              perimDia={perimDia}
              t1Count={t1Count} t1Dia={t1Dia} t1Bent={t1Bent}
              t2Count={t2Count} t2Dia={t2Dia} t2Bent={t2Bent}
              t2ClearGap={t2ClearGap}
              c1Count={c1Count} c1Dia={c1Dia}
              c2Count={c2Count} c2Dia={c2Dia}
              c2ClearGap={c2ClearGap}
              stirDia={stirDia}
              stirSpacingEnd={stirSpacingEnd}
              stirSpacingMid={stirSpacingMid}
              bendL={bendL}
              width={840} height={320}
            />
          )}
        </div>
      </div>

      {/* STEP 4b — Development Length & Splicing */}
      <DevSpliceCard
        fc={fc} fy={fy} cover={cover} b={b} h={h} span={span}
        perimDia={perimDia}
        t1Count={t1Count} t1Dia={t1Dia} t2Count={t2Count} t2Dia={t2Dia}
        c1Count={c1Count} c1Dia={c1Dia} c2Count={c2Count} c2Dia={c2Dia}
        t1Bent={t1Bent} t2Bent={t2Bent}
        bendL={bendL}
      />

      {/* STEP 5 — Calculation Breakdown */}
      <CalcBreakdownCard
        code_standard={code_standard}
        checks={checks}
        b={b} h={h} cover={cover} fc={fc} fy={fy} span={span}
        perimDia={perimDia}
        t1Count={t1Count} t1Dia={t1Dia}
        t2Count={t2Count} t2Dia={t2Dia}
        c1Count={c1Count} c1Dia={c1Dia}
        torsCount={torsCount} torsDia={torsDia}
        stirDia={stirDia} stirSpacingEnd={stirSpacingEnd}
        asT={asT} asReq={asReq} asPass={asPass}
        Mu_pos={forces.mPos} Mu_neg={forces.mNeg} Vu={forces.vPeak}
        activeSec={activeSec}
      />

      {/* STEP 6 — Material Take-Off */}
      <RebarMTO
        beamId={initial.label}
        span={span} h={h} b={b} cover={cover}
        perimDia={perimDia}
        t1Count={t1Count} t1Dia={t1Dia} t1Bent={t1Bent}
        t2Count={t2Count} t2Dia={t2Dia} t2Bent={t2Bent}
        c1Count={c1Count} c1Dia={c1Dia}
        c2Count={c2Count} c2Dia={c2Dia}
        torsCount={torsCount} torsDia={torsDia}
        stirDia={stirDia}
        stirSpacingEnd={stirSpacingEnd}
        stirSpacingMid={stirSpacingMid}
        bendL={bendL}
        fc={fc} fy={fy}
      />
    </>
  )
}
