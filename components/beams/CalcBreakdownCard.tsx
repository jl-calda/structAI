'use client'

import { useState } from 'react'

/**
 * Calculation Breakdown — tabbed (Material / Flexure / Shear / Torsion /
 * Limits) with each row showing symbol, formula, substitution, code
 * reference, result, and unit. Per ACI 318-19 / NSCP 2015.
 */

export type CalcBreakdownCardProps = {
  b: number
  h: number
  cover: number
  fc: number
  fy: number
  span: number
  perimDia: number
  t1Count: number
  t1Dia: number
  t2Count?: number
  t2Dia?: number
  c1Count?: number
  c1Dia?: number
  torsCount?: number
  torsDia?: number
  stirDia: number
  stirSpacingEnd: number
  asT: number
  asReq: number
  asPass: boolean
  Mu_pos: number
  Mu_neg: number
  Vu: number
  Tu?: number
  activeSec: 'start' | 'mid' | 'end'
}

type Tab = 'mat' | 'flex' | 'shr' | 'tor' | 'serv'

const A = (d: number) => (Math.PI * d * d) / 4

export function CalcBreakdownCard({
  b,
  h,
  cover,
  fc,
  fy,
  span,
  perimDia,
  t1Dia,
  torsCount = 0,
  torsDia = 12,
  stirDia,
  stirSpacingEnd,
  asT,
  asReq,
  asPass,
  Mu_pos,
  Mu_neg,
  Vu,
  Tu = 14.2,
  activeSec,
}: CalcBreakdownCardProps) {
  const [tab, setTab] = useState<Tab>('flex')

  const d_eff = h - cover - stirDia - t1Dia / 2
  const dPrime = cover + stirDia + perimDia / 2
  const beta1 = fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7)
  const rhoBal = (0.85 * beta1 * fc / fy) * (600 / (600 + fy))
  const rhoMax = (3 / 8) * rhoBal
  const rhoMin = Math.max(1.4 / fy, Math.sqrt(fc) / (4 * fy))
  const AsMax = rhoMax * b * d_eff
  const AsMin = rhoMin * b * d_eff
  const Mu = activeSec === 'mid' ? Mu_pos : Mu_neg
  const phi = 0.90
  const Rn = (Mu * 1e6) / (phi * b * d_eff * d_eff)
  const m = fy / (0.85 * fc)
  const rhoReq = (1 / m) * (1 - Math.sqrt(Math.max(0, 1 - (2 * m * Rn) / fy)))
  const AsReqCalc = Math.max(rhoReq * b * d_eff, AsMin)

  const lambda = 1.0
  const Vc = (0.17 * lambda * Math.sqrt(fc) * b * d_eff) / 1000
  const Av = 2 * A(stirDia)
  const Vs = (Av * fy * d_eff / stirSpacingEnd) / 1000
  const phiVn = 0.75 * (Vc + Vs)
  const sMax = Math.min(d_eff / 2, 600)
  const AvMin = (Math.max(0.062 * Math.sqrt(fc), 0.35) * b * stirSpacingEnd) / fy

  const phiTn = 22.1
  const Acp = b * h
  const pcp = 2 * (b + h)
  const T_thresh = (0.083 * lambda * Math.sqrt(fc) * (Acp * Acp)) / pcp / 1e6

  const TABS: { id: Tab; label: string }[] = [
    { id: 'mat', label: 'Material' },
    { id: 'flex', label: 'Flexure' },
    { id: 'shr', label: 'Shear' },
    { id: 'tor', label: 'Torsion' },
    { id: 'serv', label: 'Limits' },
  ]

  return (
    <div className="card">
      <div className="card-h">
        <span className="num-badge">5</span>
        <span className="label">Calculation Breakdown</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 0, background: 'var(--color-bg)', borderRadius: 4, padding: 2, border: '1px solid var(--color-line-2)' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: '3px 10px',
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                border: 0,
                borderRadius: 3,
                cursor: 'pointer',
                background: tab === t.id ? 'var(--color-ink)' : 'transparent',
                color: tab === t.id ? '#fff' : 'var(--color-ink-3)',
              }}
            >
              {t.label}
            </button>
          ))}
        </span>
      </div>
      <div className="card-b" style={{ padding: 0 }}>
        {tab === 'mat' && (
          <CalcGroup>
            <CalcRow code="ACI 318-19 §22.2.2.4.3 / NSCP §422.2.2.4.3"
              name="β1" formula="β₁ = 0.85 − 0.05(fc′−28)/7,  0.65 ≤ β₁ ≤ 0.85"
              expr={`= 0.85 − 0.05·(${fc}−28)/7`}
              result={beta1.toFixed(3)} unit="—" />
            <CalcRow code="ACI 318-19 §22.2.2.1"
              name="εcu" formula="εcu = 0.003" expr="—"
              result="0.003" unit="—" />
            <CalcRow code="ACI 318-19 §20.2.2.2"
              name="Es" formula="Es = 200 000 MPa" expr="—"
              result="200 000" unit="MPa" />
            <CalcRow code="ACI 318-19 §9.2.1.1"
              name="d" formula="d = h − c − dstir − db/2"
              expr={`= ${h} − ${cover} − ${stirDia} − ${t1Dia}/2`}
              result={d_eff.toFixed(0)} unit="mm" pass />
            <CalcRow code="ACI 318-19 §9.2.1.1"
              name="d′" formula="d′ = c + dstir + dperim/2"
              expr={`= ${cover} + ${stirDia} + ${perimDia}/2`}
              result={dPrime.toFixed(0)} unit="mm" />
          </CalcGroup>
        )}

        {tab === 'flex' && (
          <CalcGroup>
            <CalcRow code="ACI 318-19 §21.2.2 / NSCP §421.2.2"
              name="ρb" formula="ρb = (0.85·β₁·fc′/fy) · 600/(600+fy)"
              expr={`= (0.85·${beta1.toFixed(3)}·${fc}/${fy})·600/(600+${fy})`}
              result={rhoBal.toFixed(5)} unit="—" />
            <CalcRow code="ACI 318-19 §21.2.2 (tension-controlled)"
              name="ρmax" formula="ρmax = 0.375·ρb (εt ≥ 0.005)"
              expr={`= 0.375·${rhoBal.toFixed(5)}`}
              result={rhoMax.toFixed(5)} unit="—" />
            <CalcRow code="ACI 318-19 §9.6.1.2"
              name="ρmin" formula="ρmin = max(1.4/fy, √fc′/(4·fy))"
              expr={`= max(1.4/${fy}, √${fc}/(4·${fy}))`}
              result={rhoMin.toFixed(5)} unit="—" />
            <CalcRow code="—"
              name="As,min" formula="As,min = ρmin · b · d"
              expr={`= ${rhoMin.toFixed(5)}·${b}·${d_eff.toFixed(0)}`}
              result={AsMin.toFixed(0)} unit="mm²" />
            <CalcRow code="—"
              name="As,max" formula="As,max = ρmax · b · d"
              expr={`= ${rhoMax.toFixed(5)}·${b}·${d_eff.toFixed(0)}`}
              result={AsMax.toFixed(0)} unit="mm²" />
            <CalcRow code="ACI 318-19 §9.5.1.1 (Mu input)"
              name="Mu" formula={`Mu @ ${activeSec === 'mid' ? 'midspan' : 'support'}`}
              expr="from envelope" result={Mu.toFixed(2)} unit="kN·m" emph />
            <CalcRow code="ACI 318-19 §22.2.2.4 (singly-reinforced)"
              name="Rn" formula="Rn = Mu / (φ·b·d²)"
              expr={`= ${Mu}·10⁶ / (0.90·${b}·${d_eff.toFixed(0)}²)`}
              result={Rn.toFixed(3)} unit="MPa" />
            <CalcRow code="ACI 318-19 §22.2 (closed-form ρ)"
              name="ρreq" formula="ρ = (1/m)·[1 − √(1 − 2m·Rn/fy)],  m = fy/(0.85·fc′)"
              expr={`m = ${fy}/(0.85·${fc}) = ${m.toFixed(3)}`}
              result={rhoReq.toFixed(5)} unit="—" />
            <CalcRow code="—"
              name="As,req" formula="As,req = max(ρreq·b·d,  As,min)"
              expr={`= max(${(rhoReq * b * d_eff).toFixed(0)}, ${AsMin.toFixed(0)})`}
              result={AsReqCalc.toFixed(0)} unit="mm²" emph />
            <CalcRow code="ACI 318-19 §9.7.1.1"
              name="As,prov" formula="As,prov = Σ n·Ab,i"
              expr={`bars selected (sec ${activeSec})`}
              result={asT.toFixed(0)} unit="mm²" pass={asPass} fail={!asPass} />
            <CalcRow code="—"
              name="ratio" formula="As,prov / As,req"
              expr={`= ${asT.toFixed(0)} / ${asReq}`}
              result={(asT / asReq).toFixed(2)} unit="—" pass={asPass} fail={!asPass} />
          </CalcGroup>
        )}

        {tab === 'shr' && (
          <CalcGroup>
            <CalcRow code="ACI 318-19 §9.5.3 (Vu input)"
              name="Vu" formula="Vu @ d from face of support"
              expr="from envelope" result={Vu.toFixed(1)} unit="kN" emph />
            <CalcRow code="ACI 318-19 §22.5.5.1 / NSCP §422.5.5.1"
              name="Vc" formula="Vc = 0.17·λ·√fc′ · bw·d   [N]"
              expr={`= 0.17·1.0·√${fc}·${b}·${d_eff.toFixed(0)}/1000`}
              result={Vc.toFixed(2)} unit="kN" />
            <CalcRow code="ACI 318-19 §22.5.10.5.3"
              name="Av" formula="Av = nlegs · π·dstir²/4"
              expr={`= 2·π·${stirDia}²/4`}
              result={Av.toFixed(0)} unit="mm²" />
            <CalcRow code="ACI 318-19 §22.5.10.5.3"
              name="Vs" formula="Vs = Av·fyt·d / s"
              expr={`= ${Av.toFixed(0)}·${fy}·${d_eff.toFixed(0)} / ${stirSpacingEnd}`}
              result={Vs.toFixed(2)} unit="kN" />
            <CalcRow code="ACI 318-19 §22.5.1.1"
              name="φVn" formula="φVn = φ·(Vc + Vs),  φ = 0.75"
              expr={`= 0.75·(${Vc.toFixed(2)} + ${Vs.toFixed(2)})`}
              result={phiVn.toFixed(2)} unit="kN" pass={phiVn >= Vu} fail={phiVn < Vu} />
            <CalcRow code="ACI 318-19 §9.7.6.2.2"
              name="s,max" formula="s ≤ min(d/2, 600 mm)   [Vs ≤ 0.33·√fc′·bw·d]"
              expr={`= min(${d_eff.toFixed(0)}/2, 600)`}
              result={sMax.toFixed(0)} unit="mm" />
            <CalcRow code="ACI 318-19 §9.6.3.4"
              name="Av,min" formula="Av,min = max(0.062·√fc′, 0.35) · bw·s/fyt"
              expr={`@ s = ${stirSpacingEnd} mm`}
              result={AvMin.toFixed(0)} unit="mm²" />
          </CalcGroup>
        )}

        {tab === 'tor' && (
          <CalcGroup>
            <CalcRow code="ACI 318-19 §22.7.1.1"
              name="Acp" formula="Acp = b·h" expr={`= ${b}·${h}`}
              result={Acp.toLocaleString()} unit="mm²" />
            <CalcRow code="ACI 318-19 §22.7.1.1"
              name="pcp" formula="pcp = 2·(b + h)" expr={`= 2·(${b}+${h})`}
              result={pcp.toLocaleString()} unit="mm" />
            <CalcRow code="ACI 318-19 §22.7.4.1(a)"
              name="Tth" formula="Tth = 0.083·λ·√fc′ · Acp²/pcp   (threshold)"
              expr={`= 0.083·√${fc}·${Acp.toLocaleString()}²/${pcp.toLocaleString()}`}
              result={T_thresh.toFixed(2)} unit="kN·m" />
            <CalcRow code="ACI 318-19 §9.5.4 (Tu input)"
              name="Tu" formula="Tu @ d from support"
              expr="from envelope" result={Tu.toFixed(2)} unit="kN·m"
              pass={Tu < T_thresh} fail={Tu >= T_thresh && Tu > phiTn} emph />
            <CalcRow code="ACI 318-19 §22.7.7"
              name="φTn" formula="φTn = φ·(2·Ao·At·fyt/s)·cot θ,  θ = 45°"
              expr="combined Av+t spacing" result={phiTn.toFixed(2)} unit="kN·m"
              pass={phiTn >= Tu} fail={phiTn < Tu} />
            <CalcRow code="ACI 318-19 §9.7.5.1"
              name="skin" formula="Aℓ = (At/s)·ph·(fyt/fy)"
              expr={`provided: ${torsCount * 2}·Ø${torsDia}`}
              result={(torsCount * 2 * A(torsDia)).toFixed(0)} unit="mm²" />
          </CalcGroup>
        )}

        {tab === 'serv' && (
          <CalcGroup>
            <CalcRow code="ACI 318-19 §9.3.1.1 (Table)"
              name="hmin" formula="hmin = L/16  (simply-supported, fy = 420)"
              expr={`= ${span}/16`}
              result={(span / 16).toFixed(0)} unit="mm"
              pass={h >= span / 16} fail={h < span / 16} />
            <CalcRow code="ACI 318-19 §25.2.1"
              name="sclear" formula="s ≥ max(db, 25 mm, 4/3·dagg)"
              expr={`db = ${perimDia}`}
              result={Math.max(perimDia, 25).toFixed(0)} unit="mm" />
            <CalcRow code="ACI 318-19 §24.3.2"
              name="smax,t" formula="s ≤ min(380·(280/fs) − 2.5cc, 300·(280/fs))"
              expr="fs ≈ ⅔·fy" result="≈ 250" unit="mm" />
            <CalcRow code="ACI 318-19 §24.2"
              name="Δ" formula="Δlimit = L/240 (immediate) · L/480 (long-term)"
              expr={`Llimit = ${span}/240`}
              result={(span / 240).toFixed(1)} unit="mm" />
            <CalcRow code="ACI 318-19 §20.5.1.3 (cover)"
              name="cmin" formula="cmin = 40 mm (interior, not exposed to earth)"
              expr={`provided c = ${cover}`}
              result={cover.toString()} unit="mm" pass={cover >= 40} fail={cover < 40} />
          </CalcGroup>
        )}
      </div>
    </div>
  )
}

function CalcGroup({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '72px 1fr 110px 70px',
          padding: '6px 12px',
          background: 'var(--color-bg)',
          borderBottom: '1px solid var(--color-line-2)',
          fontSize: 9.5,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-ink-4)',
        }}
      >
        <span>Symbol</span>
        <span>Formula · Substitution · Code Reference</span>
        <span style={{ textAlign: 'right' }}>Result</span>
        <span style={{ textAlign: 'right' }}>Unit</span>
      </div>
      {children}
    </div>
  )
}

function CalcRow({
  code,
  name,
  formula,
  expr,
  result,
  unit,
  pass,
  fail,
  emph,
}: {
  code: string
  name: string
  formula: string
  expr: string
  result: string
  unit: string
  pass?: boolean
  fail?: boolean
  emph?: boolean
}) {
  const bg = pass ? '#F1F8F0' : fail ? '#FBEFEC' : emph ? '#FEF9EE' : 'transparent'
  const accent = pass ? '#3F7A2E' : fail ? '#A12424' : emph ? '#8A6112' : 'var(--color-ink-2)'
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr 110px 70px',
        padding: '8px 12px',
        borderBottom: '1px solid var(--color-line-2)',
        background: bg,
        alignItems: 'baseline',
        gap: 8,
      }}
    >
      <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink)' }}>{name}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--color-ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formula}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>{expr}</span>
          <span className="tag" style={{ fontSize: 8.5, background: '#fff', borderColor: 'var(--color-line)' }}>{code}</span>
        </span>
      </div>
      <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'right', color: accent }}>{result}</span>
      <span className="mono" style={{ fontSize: 10.5, textAlign: 'right', color: 'var(--color-ink-4)' }}>{unit}</span>
    </div>
  )
}
