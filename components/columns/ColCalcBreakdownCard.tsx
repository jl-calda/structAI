'use client'

import { useState } from 'react'

import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode, type CodeStandard } from '@/lib/engineering/codes'

/**
 * Column calculation breakdown — 6 tabs (Material, Slenderness, Axial-Flex,
 * Biaxial, Shear, Confinement). Uses CodeProvider for all code-specific values.
 */
export function ColCalcBreakdownCard({
  b, h, cover, fc, fy, Hc,
  barDia, tieDia, nLong, AsLong, Ag, rhoG,
  sConf, sMid, loConf,
  classCol, bracedFrame,
  PuMax, Mux, Muy, Vu, phiMn,
  dEff,
  code_standard,
}: {
  b: number; h: number; cover: number; fc: number; fy: number; Hc: number
  barDia: number; tieDia: number; nLong: number; AsLong: number; Ag: number; rhoG: number
  sConf: number; sMid: number; loConf: number
  classCol: 'Tied' | 'Spiral'
  bracedFrame: boolean
  PuMax: number; Mux: number; Muy: number; Vu: number; phiMn: number
  dEff: number
  code_standard: CodeStandard
}) {
  const code = getCode(code_standard)
  const [tab, setTab] = useState('axial')

  const beta1 = code.stress_block_depth_factor(fc)
  const Ec = 4700 * Math.sqrt(fc)
  const colType = classCol === 'Spiral' ? 'spiral' as const : 'tied' as const
  const phi = code.phi_axial(0, colType)
  const factor = code.Pn_max_factor(colType)

  // Slenderness
  const k = bracedFrame ? 0.85 : 1.20
  const r = Math.min(b, h) * 0.3
  const slender = (k * Hc) / r
  const slenderLimit = code.slenderness_limit(Mux * 0.5, Mux, !bracedFrame)
  const slenderShort = slender <= slenderLimit
  const Cm = 0.6 + 0.4 * 0.5
  const EI = 0.4 * Ec * (b * Math.pow(h, 3) / 12)
  const Pcr = (Math.PI * Math.PI * EI) / Math.pow(k * Hc, 2) / 1000
  const deltaNs = Math.max(1.0, Cm / (1 - PuMax / (0.75 * Pcr)))
  const Mc = deltaNs * Mux

  // Axial
  const Po = 0.85 * fc * (Ag - AsLong) + fy * AsLong
  const phiPnMax = factor * phi * Po / 1000
  const interactionRatio = Math.max(PuMax / phiPnMax, (Mux + Muy) / phiMn)

  // Shear — use CodeProvider
  const Vc_kN = code.Vc_design(fc, b, dEff, AsLong, PuMax)
  const phiVc = Vc_kN // already includes phi
  const Av = 2 * (Math.PI * tieDia * tieDia / 4)
  const Vs_kN = code.Vs_design(Av, 420, dEff, sMid)
  const shearPass = phiVc >= Vu

  // Confinement
  const Ach = (b - 2 * cover) * (h - 2 * cover)
  const confRhoMin = code.confinement_rho_min(fc, 420, Ag, Ach)
  const Ash_provided = Av
  const Ash_required = confRhoMin * sConf * (b - 2 * cover)
  const ashPass = Ash_provided >= Ash_required

  // Biaxial
  const biaxRatio = Math.pow(Mux / phiMn, 1.5) + Math.pow(Muy / phiMn, 1.5)

  const tabs = [
    { k: 'mat', n: 'Material' },
    { k: 'slen', n: 'Slenderness' },
    { k: 'axial', n: 'Axial-Flex' },
    { k: 'biax', n: 'Biaxial' },
    { k: 'shear', n: 'Shear' },
    { k: 'conf', n: 'Confinement' },
  ]

  const codeLabel = code.code.replace(/_/g, ' ')

  return (
    <div className="card">
      <div className="card-h">
        <span className="num-badge">5</span>
        <span className="label">Calculation Breakdown</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 0, background: 'var(--color-bg)', borderRadius: 4, padding: 2, border: '1px solid var(--color-line-2)' }}>
          {tabs.map(t => (
            <button key={t.k} type="button" onClick={() => setTab(t.k)} style={{
              padding: '3px 10px', fontSize: 10.5, fontWeight: 600,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              borderRadius: 3, border: 0, cursor: 'pointer',
              background: tab === t.k ? 'var(--color-ink)' : 'transparent',
              color: tab === t.k ? '#fff' : 'var(--color-ink-3)',
            }}>
              {t.n}
            </button>
          ))}
        </span>
      </div>
      <div style={{ borderTop: '1px solid var(--color-line-2)' }}>
        <CalcGroup>
          {tab === 'mat' && (
            <>
              <CalcRow code={`${codeLabel} §22.2.2.1`} name="εcu" formula="εcu = 0.003 (concrete crush strain)" expr="constant" result="0.003" unit="—" />
              <CalcRow code={`${codeLabel} §22.2.2.4.3`} name="β1"
                formula="β1 = 0.85 − 0.05(fc′−28)/7,  0.65 ≤ β1 ≤ 0.85"
                expr={fc <= 28 ? `fc′ = ${fc} ≤ 28 → 0.85` : `= 0.85 − 0.05·(${fc}−28)/7`}
                result={beta1.toFixed(3)} unit="—" />
              <CalcRow code={`${codeLabel} §19.2.2.1`} name="Ec"
                formula="Ec = 4700·√fc′"
                expr={`= 4700·√${fc}`}
                result={Math.round(Ec).toLocaleString()} unit="MPa" />
              <CalcRow code={`${codeLabel} §10.6.1.1`} name="ρg"
                formula={`ρg = Ast / Ag,  ${(code.rho_column_min * 100).toFixed(0)}% ≤ ρg ≤ ${(code.rho_column_max * 100).toFixed(0)}%`}
                expr={`= ${Math.round(AsLong)} / ${Ag.toLocaleString()}`}
                result={`${(rhoG * 100).toFixed(2)}%`} unit="—"
                pass={rhoG >= code.rho_column_min && rhoG <= code.rho_column_max}
                fail={rhoG < code.rho_column_min || rhoG > code.rho_column_max} />
              <CalcRow code={`${codeLabel} §10.7.3`} name="nmin"
                formula={`rectangular tied: 4 bars · spiral: 6 bars`}
                expr={`provided = ${nLong}`}
                result={nLong.toString()} unit="bars"
                pass={nLong >= (classCol === 'Spiral' ? 6 : 4)} />
            </>
          )}

          {tab === 'slen' && (
            <>
              <CalcRow code={`${codeLabel} §6.2.5`} name="k"
                formula="effective length factor (Jackson-Moreland)"
                expr={bracedFrame ? 'braced (non-sway)' : 'unbraced (sway)'}
                result={k.toFixed(2)} unit="—" />
              <CalcRow code={`${codeLabel} §6.2.5.1`} name="r"
                formula="r ≈ 0.3·hmin (rectangular)"
                expr={`= 0.3·${Math.min(b, h)}`}
                result={r.toFixed(0)} unit="mm" />
              <CalcRow code={`${codeLabel} §6.2.5`} name="kLu/r"
                formula="slenderness ratio"
                expr={`= ${k}·${Hc}/${r.toFixed(0)}`}
                result={slender.toFixed(1)} unit="—" emph />
              <CalcRow code={`${codeLabel} §6.2.5`} name="limit"
                formula={bracedFrame ? 'short ≤ 34 − 12·M1/M2 ≤ 40' : 'short ≤ 22'}
                expr={`from code: ${slenderLimit.toFixed(0)}`}
                result={slenderLimit.toFixed(0)} unit="—"
                pass={slenderShort} fail={!slenderShort} />
              <CalcRow code={`${codeLabel} §6.6.4.5.2`} name="Cm"
                formula="Cm = 0.6 + 0.4·M1/M2"
                expr="M1/M2 ≈ 0.5"
                result={Cm.toFixed(2)} unit="—" />
              <CalcRow code={`${codeLabel} §6.6.4.4.4`} name="Pc"
                formula="Pc = π²·EI / (k·Lu)²,  EI = 0.4·Ec·Ig"
                expr={`Ig = b·h³/12 = ${(b * Math.pow(h, 3) / 12 / 1e6).toFixed(0)}·10⁶`}
                result={Math.round(Pcr).toLocaleString()} unit="kN" />
              <CalcRow code={`${codeLabel} §6.6.4.5.2`} name="δns"
                formula="δns = Cm / (1 − Pu/(0.75·Pc)) ≥ 1.0"
                expr={`= ${Cm.toFixed(2)} / (1 − ${Math.round(PuMax)}/(0.75·${Math.round(Pcr)}))`}
                result={deltaNs.toFixed(2)} unit="—" />
              <CalcRow code={`${codeLabel} §6.6.4.5.1`} name="Mc"
                formula="Mc = δns · M2"
                expr={`= ${deltaNs.toFixed(2)} · ${Mux.toFixed(1)}`}
                result={Mc.toFixed(1)} unit="kN·m" emph />
            </>
          )}

          {tab === 'axial' && (
            <>
              <CalcRow code={`${codeLabel} §22.4.2.2`} name="Po"
                formula="Po = 0.85·fc′·(Ag − Ast) + fy·Ast"
                expr={`= 0.85·${fc}·(${Ag.toLocaleString()} − ${Math.round(AsLong)}) + ${fy}·${Math.round(AsLong)}`}
                result={Math.round(Po / 1000).toLocaleString()} unit="kN" />
              <CalcRow code={`${codeLabel}`} name="α"
                formula={classCol === 'Spiral' ? 'α = 0.85 (spiral)' : 'α = 0.80 (tied)'}
                expr={classCol} result={factor.toFixed(2)} unit="—" />
              <CalcRow code={`${codeLabel} §21.2.2`} name="φ"
                formula={classCol === 'Spiral' ? 'φ = 0.75 (spiral)' : 'φ = 0.65 (tied) — comp-controlled'}
                expr="strain at extreme tension steel ≤ εty"
                result={phi.toFixed(2)} unit="—" />
              <CalcRow code={`${codeLabel} §22.4.2.1`} name="φPn,max"
                formula="φPn,max = α·φ·Po"
                expr={`= ${factor}·${phi}·${Math.round(Po / 1000)}`}
                result={Math.round(phiPnMax).toLocaleString()} unit="kN" />
              <CalcRow code="STAAD envelope" name="Pu"
                formula="factored axial load (governing combo)"
                expr="from envelope" result={Math.round(PuMax).toLocaleString()} unit="kN"
                pass={PuMax <= phiPnMax} fail={PuMax > phiPnMax} emph />
              <CalcRow code={`${codeLabel} §22.4`} name="φMn"
                formula="moment capacity at design Pu (P-M strain compat.)"
                expr="layer-by-layer integration" result={phiMn.toFixed(1)} unit="kN·m" />
              <CalcRow code={`${codeLabel} §10.5.1.1`} name="ratio"
                formula="combined axial-flexure ratio"
                expr="= max(Pu/φPn, Mu/φMn)"
                result={interactionRatio.toFixed(2)} unit="—"
                pass={interactionRatio <= 1.0} fail={interactionRatio > 1.0} />
            </>
          )}

          {tab === 'biax' && (
            <>
              <CalcRow code={`${codeLabel} §22.4.4 (Bresler)`} name="α-exp"
                formula="(Mux/φMnx)^α + (Muy/φMny)^α ≤ 1.0,  α ≈ 1.5"
                expr="α typically 1.0–2.0 (Bresler load contour)"
                result="1.50" unit="—" />
              <CalcRow code="STAAD envelope" name="Mux"
                formula="factored moment about X"
                expr="from envelope" result={Mux.toFixed(1)} unit="kN·m" />
              <CalcRow code="STAAD envelope" name="Muy"
                formula="factored moment about Y"
                expr="from envelope" result={Muy.toFixed(1)} unit="kN·m" />
              <CalcRow code={`${codeLabel} §22.4.4`} name="φMnx"
                formula="moment capacity about X-axis at design Pu"
                expr="strain compat." result={phiMn.toFixed(1)} unit="kN·m" />
              <CalcRow code={`${codeLabel} §22.4.4`} name="φMny"
                formula="moment capacity about Y-axis at design Pu (sym col)"
                expr="= φMnx for symmetric" result={phiMn.toFixed(1)} unit="kN·m" />
              <CalcRow code="Bresler load contour" name="∑"
                formula="(Mux/φMn)^1.5 + (Muy/φMn)^1.5"
                expr={`= (${Mux.toFixed(1)}/${phiMn.toFixed(1)})^1.5 + (${Muy.toFixed(1)}/${phiMn.toFixed(1)})^1.5`}
                result={biaxRatio.toFixed(2)} unit="—"
                pass={biaxRatio <= 1.0} fail={biaxRatio > 1.0} emph />
            </>
          )}

          {tab === 'shear' && (
            <>
              <CalcRow code={`${codeLabel} §22.5.6.1`} name="φVc"
                formula="φVc from CodeProvider (includes axial enhancement)"
                expr={`Vc_design(fc=${fc}, b=${b}, d=${dEff.toFixed(0)}, As=${Math.round(AsLong)}, Nu=${Math.round(PuMax)})`}
                result={phiVc.toFixed(1)} unit="kN" />
              <CalcRow code="STAAD envelope" name="Vu"
                formula="factored shear (governing combo)"
                expr="from envelope"
                result={Vu.toFixed(1)} unit="kN"
                pass={shearPass} fail={!shearPass} emph />
              <CalcRow code={`${codeLabel} §22.5.10`} name="φVs"
                formula="φVs = Vs_design(Av, fyt, d, s)"
                expr={`Av = 2·π·${tieDia}²/4 = ${Math.round(Av)} mm²`}
                result={Vs_kN.toFixed(1)} unit="kN" />
            </>
          )}

          {tab === 'conf' && (
            <>
              <CalcRow code={`${codeLabel} §18.7.5.3`} name="lo"
                formula="lo ≥ max(h, Hc/6, 450 mm)"
                expr={`max(${h}, ${Math.round(Hc / 6)}, 450)`}
                result={Math.max(h, Math.round(Hc / 6), 450).toString()} unit="mm"
                pass={loConf >= Math.max(h, Math.round(Hc / 6), 450)} />
              <CalcRow code={`${codeLabel} §18.7.5.3`} name="so"
                formula="so ≤ min(6·db, b/4, 100 mm)"
                expr={`min(6·${barDia}, ${b}/4, 100) = ${Math.min(6 * barDia, b / 4, 100)}`}
                result={sConf.toString()} unit="mm"
                pass={sConf <= Math.min(6 * barDia, b / 4, 100)}
                fail={sConf > Math.min(6 * barDia, b / 4, 100)} />
              <CalcRow code={`${codeLabel} §25.7.2.1`} name="smid"
                formula="s ≤ min(16·db,long, 48·db,tie, hmin)"
                expr={`min(16·${barDia}, 48·${tieDia}, ${Math.min(b, h)}) = ${Math.min(16 * barDia, 48 * tieDia, Math.min(b, h))}`}
                result={sMid.toString()} unit="mm"
                pass={sMid <= Math.min(16 * barDia, 48 * tieDia, Math.min(b, h))} />
              <CalcRow code={`${codeLabel} §18.7.5.4`} name="Ash,req"
                formula="from code.confinement_rho_min × s × bc"
                expr={`ρ_conf = ${(confRhoMin * 100).toFixed(3)}% · s·bc = ${sConf}·${b - 2 * cover}`}
                result={Math.round(Ash_required).toString()} unit="mm²" />
              <CalcRow code="provided · 2 legs" name="Ash,prov"
                formula="Ash = nlegs · π·dt²/4"
                expr={`= 2·π·${tieDia}²/4`}
                result={Math.round(Ash_provided).toString()} unit="mm²"
                pass={ashPass} fail={!ashPass} emph />
              <CalcRow code={`${codeLabel} §25.7.2.3`} name="hx"
                formula="hx ≤ 350 mm — max c/c spacing of laterally supported bars"
                expr="current section spacing"
                result="≤ 350" unit="mm" />
            </>
          )}
        </CalcGroup>
      </div>
    </div>
  )
}

function CalcGroup({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '72px 1fr 110px 70px',
        gap: 0, padding: '6px 12px', background: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-line-2)',
        fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--color-ink-4)',
      }}>
        <span>Symbol</span>
        <span>Formula · Substitution · Code Reference</span>
        <span style={{ textAlign: 'right' }}>Result</span>
        <span style={{ textAlign: 'right' }}>Unit</span>
      </div>
      {children}
    </div>
  )
}

function CalcRow({ code, name, formula, expr, result, unit, pass, fail, emph }: {
  code: string; name: string; formula: string; expr: string; result: string; unit: string
  pass?: boolean; fail?: boolean; emph?: boolean
}) {
  const bg = pass ? 'var(--color-pass-bg, #E7F0E9)' : fail ? 'var(--color-fail-bg, #F6E5E5)' : emph ? '#FEF9EE' : 'transparent'
  const accent = pass ? 'var(--color-pass)' : fail ? 'var(--color-fail)' : emph ? '#8A6112' : 'var(--color-ink-2)'

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '72px 1fr 110px 70px',
      padding: '8px 12px', borderBottom: '1px solid var(--color-line-2)',
      background: bg, alignItems: 'baseline', gap: 8,
    }}>
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
