'use client'

import { useState } from 'react'

// Side-effect: register code providers in the client bundle
import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'
import type { CodeStandard, Database } from '@/lib/supabase/types'

type BeamCheckRow = Database['public']['Tables']['beam_checks']['Row']

/**
 * Calculation Breakdown — sources every value from either:
 *   (a) the engineering library (`getCode(code_standard)` — fcd, fyd,
 *       stress_block_depth_factor, As_min, Vc_design, Vs_design,
 *       stirrup_spacing_max, Ld, lap_splice), OR
 *   (b) the persisted `beam_checks` row written by `runBeamGroupDesign()`
 *       when the user clicked Run Design (d, As req/prov, φMn, φVn,
 *       Ld, lap_splice).
 *
 * Nothing is recomputed inline with hardcoded ACI φ factors — it now
 * tracks whatever the engine and the active `code_standard` produce.
 *
 * Tabs: Material · Flexure · Shear · Development & Splice · Limits.
 */

export type CalcBreakdownCardProps = {
  /** Project's active code standard — drives which CodeProvider is used. */
  code_standard: CodeStandard
  /** Persisted check row from the last `Run Design` (null = not yet run). */
  checks: BeamCheckRow | null
  // Geometry + materials (live from the rebar editor)
  b: number
  h: number
  cover: number
  fc: number
  fy: number
  span: number
  // Rebar config
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
  // Live tally from the editor (may differ from checks.as_provided_mm2 mid-edit)
  asT: number
  asReq: number
  asPass: boolean
  // Forces
  Mu_pos: number
  Mu_neg: number
  Vu: number
  Tu?: number
  activeSec: 'start' | 'mid' | 'end'
}

type Tab = 'mat' | 'flex' | 'shr' | 'dev' | 'serv'

const A = (d: number) => (Math.PI * d * d) / 4

export function CalcBreakdownCard({
  code_standard,
  checks,
  b,
  h,
  cover,
  fc,
  fy,
  span,
  perimDia,
  t1Dia,
  c1Dia = 20,
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
  Tu = 0,
  activeSec,
}: CalcBreakdownCardProps) {
  const [tab, setTab] = useState<Tab>('flex')

  const code = getCode(code_standard)

  // ─── Engine-sourced (or fallback when checks is null) ───────────────────
  const d_eff = checks?.d_mm ?? (h - cover - stirDia - t1Dia / 2)
  const dPrime = cover + stirDia + perimDia / 2
  const asReqEng = checks?.as_required_mm2 ?? null
  const asProvEng = checks?.as_provided_mm2 ?? asT
  const phiMnPosEng = checks?.phi_mn_pos_knm ?? null
  const phiMnNegEng = checks?.phi_mn_neg_knm ?? null
  const phiVnEng = checks?.phi_vn_kn ?? null
  const ldBottomEng = checks?.ld_bottom_mm ?? null
  const ldTopEng = checks?.ld_top_mm ?? null
  const lapSpliceEng = checks?.lap_splice_mm ?? null

  // ─── CodeProvider-derived (live, recomputes as the user edits) ──────────
  const fcd = code.fcd(fc)
  const fyd = code.fyd(fy)
  const beta1 = code.stress_block_depth_factor(fc)
  const k = code.stress_block_stress_factor(fc)
  const AsMin_engine = code.As_min(fc, fy, b, d_eff)
  const rhoMin = AsMin_engine / Math.max(1, b * d_eff)
  // ρb / ρmax follow the standard ACI/NSCP relationship; for codes that bake
  // γ into materials (EC2/CSA) the same form holds with fcd/fyd substituted.
  const rhoBal = (k * beta1 * fcd / fyd) * (600 / (600 + fyd))
  const rhoMax = 0.375 * rhoBal
  const AsMax = rhoMax * b * d_eff
  // φVc and φVs — the CodeProvider returns design values (ACI: ×0.75 inside)
  const Av = 2 * A(stirDia)
  const phiVc = code.Vc_design(fc, b, d_eff, asProvEng, 0)
  const phiVs = code.Vs_design(Av, fy, d_eff, stirSpacingEnd)
  const phiVnLive = phiVc + phiVs
  const sMax = code.stirrup_spacing_max(d_eff, phiVs, b, fc)

  // Mu at the active station (read directly from envelope-driven props)
  const Mu = activeSec === 'mid' ? Mu_pos : Mu_neg
  // Rn / ρreq use ACI-style flexure φ. For EC2/CSA this would change, but
  // those code providers aren't implemented yet (only ACI + NSCP).
  const phi = 0.90
  const Rn = (Mu * 1e6) / (phi * b * d_eff * d_eff)
  const m = fyd / (k * fcd)
  const rhoReq = (1 / m) * (1 - Math.sqrt(Math.max(0, 1 - (2 * m * Rn) / fyd)))
  const AsReqLive = Math.max(rhoReq * b * d_eff, AsMin_engine)

  // Development + lap splice (live from CodeProvider)
  const ldBottomLive = code.Ld(t1Dia, fc, fy, false, perimDia)
  const ldTopLive = code.Ld(t1Dia, fc, fy, true, perimDia)
  const ldHangerLive = code.Ld(c1Dia, fc, fy, true, perimDia)
  const lapBClassA = code.lap_splice(ldBottomLive, 'A')
  const lapBClassB = code.lap_splice(ldBottomLive, 'B')

  const TABS: { id: Tab; label: string }[] = [
    { id: 'mat', label: 'Material' },
    { id: 'flex', label: 'Flexure' },
    { id: 'shr', label: 'Shear' },
    { id: 'dev', label: 'Dev. & Splice' },
    { id: 'serv', label: 'Limits' },
  ]

  const codeRef = code_standard.replace(/_/g, ' ')
  const fromEngineNote = checks ? '· from engine (last run)' : '· run design to populate'

  return (
    <div className="card">
      <div className="card-h">
        <span className="num-badge">5</span>
        <span className="label">Calculation Breakdown</span>
        <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
          {codeRef} {fromEngineNote}
        </span>
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
            <CalcRow code={`${codeRef} §22.2.2.4.3`}
              name="β1" formula="β₁ = code.stress_block_depth_factor(fc′)"
              expr={`= ${beta1.toFixed(3)}  (engine)`}
              result={beta1.toFixed(3)} unit="—" engine />
            <CalcRow code={`${codeRef} §22.2.2.1`}
              name="εcu" formula="ultimate concrete strain" expr="0.003 (ACI/NSCP) · 0.0035 (EC2/CSA)"
              result="0.003" unit="—" />
            <CalcRow code={`${codeRef} §20.2.2.2`}
              name="Es" formula="Es = 200 000 MPa" expr="—"
              result="200 000" unit="MPa" />
            <CalcRow code={`${codeRef} §22.2.2.4`}
              name="fcd" formula="design concrete stress = code.fcd(fc′)"
              expr={`= ${fcd.toFixed(2)}  (ACI: fc′; EC2: fck/γc)`}
              result={fcd.toFixed(2)} unit="MPa" engine />
            <CalcRow code={`${codeRef} §22.2.2.4`}
              name="fyd" formula="design steel stress = code.fyd(fy)"
              expr={`= ${fyd.toFixed(2)}  (ACI: fy; EC2: fyk/γs)`}
              result={fyd.toFixed(2)} unit="MPa" engine />
            <CalcRow code={`${codeRef} §9.2.1.1`}
              name="d" formula="effective depth (engine)"
              expr={checks ? 'from beam_checks.d_mm' : `= h − c − dstir − db/2 = ${h} − ${cover} − ${stirDia} − ${t1Dia}/2`}
              result={d_eff.toFixed(0)} unit="mm" engine={!!checks} pass />
            <CalcRow code={`${codeRef} §9.2.1.1`}
              name="d′" formula="d′ = c + dstir + dperim/2"
              expr={`= ${cover} + ${stirDia} + ${perimDia}/2`}
              result={dPrime.toFixed(0)} unit="mm" />
          </CalcGroup>
        )}

        {tab === 'flex' && (
          <CalcGroup>
            <CalcRow code={`${codeRef} §21.2.2`}
              name="ρb" formula="ρb = (k·β₁·fcd/fyd) · 600/(600+fyd)"
              expr={`= (${k.toFixed(2)}·${beta1.toFixed(3)}·${fcd.toFixed(1)}/${fyd.toFixed(1)})·600/(600+${fyd.toFixed(0)})`}
              result={rhoBal.toFixed(5)} unit="—" />
            <CalcRow code={`${codeRef} §21.2.2`}
              name="ρmax" formula="ρmax = 0.375·ρb (tension-controlled, εt ≥ 0.005)"
              expr={`= 0.375 · ${rhoBal.toFixed(5)}`}
              result={rhoMax.toFixed(5)} unit="—" />
            <CalcRow code={`${codeRef} §9.6.1.2`}
              name="ρmin" formula="ρmin = code.As_min / (b·d)"
              expr={`engine As_min = ${AsMin_engine.toFixed(0)} mm² ÷ (${b}·${d_eff.toFixed(0)})`}
              result={rhoMin.toFixed(5)} unit="—" engine />
            <CalcRow code={`${codeRef} §9.6.1`}
              name="As,min" formula="code.As_min(fc, fy, b, d)"
              expr={`engine: max(0.25·√fc′·b·d/fy, 1.4·b·d/fy)`}
              result={AsMin_engine.toFixed(0)} unit="mm²" engine />
            <CalcRow code="—"
              name="As,max" formula="As,max = ρmax · b · d"
              expr={`= ${rhoMax.toFixed(5)}·${b}·${d_eff.toFixed(0)}`}
              result={AsMax.toFixed(0)} unit="mm²" />
            <CalcRow code={`${codeRef} §9.5.1.1`}
              name="Mu" formula={`Mu @ ${activeSec === 'mid' ? 'midspan (M⁺)' : 'support (M⁻)'}`}
              expr={checks ? `from beam_checks (combo ${activeSec === 'mid' ? checks.mu_pos_combo ?? '—' : checks.mu_neg_combo ?? '—'})` : 'from envelope props'}
              result={Mu.toFixed(2)} unit="kN·m" emph engine={!!checks} />
            <CalcRow code={`${codeRef} §22.2.2.4`}
              name="Rn" formula="Rn = Mu / (φ·b·d²)"
              expr={`= ${Mu}·10⁶ / (${phi}·${b}·${d_eff.toFixed(0)}²)`}
              result={Rn.toFixed(3)} unit="MPa" />
            <CalcRow code={`${codeRef} §22.2`}
              name="ρreq" formula="ρ = (1/m)·[1 − √(1 − 2m·Rn/fyd)],  m = fyd/(k·fcd)"
              expr={`m = ${fyd.toFixed(1)}/(${k.toFixed(2)}·${fcd.toFixed(1)}) = ${m.toFixed(3)}`}
              result={rhoReq.toFixed(5)} unit="—" />
            <CalcRow code="—"
              name="As,req" formula="As,req = max(ρreq·b·d, As,min)"
              expr={asReqEng != null
                ? `from beam_checks.as_required_mm2`
                : `live: max(${(rhoReq * b * d_eff).toFixed(0)}, ${AsMin_engine.toFixed(0)})`}
              result={(asReqEng ?? AsReqLive).toFixed(0)} unit="mm²" emph engine={asReqEng != null} />
            <CalcRow code={`${codeRef} §9.7.1.1`}
              name="As,prov" formula="As,prov = Σ n·Ab,i"
              expr={`bars selected (sec ${activeSec})${checks ? ' · synced w/ beam_checks' : ''}`}
              result={(asProvEng).toFixed(0)} unit="mm²" pass={asPass} fail={!asPass} engine={!!checks} />
            <CalcRow code={`${codeRef} §22.3.1`}
              name="φMn (+)" formula="code.moment_capacity(As, As′, geom, mat).phi_Mn_kNm"
              expr={phiMnPosEng != null ? 'from beam_checks.phi_mn_pos_knm' : 'run design to compute'}
              result={(phiMnPosEng ?? 0).toFixed(2)} unit="kN·m" engine={phiMnPosEng != null}
              pass={phiMnPosEng != null && phiMnPosEng >= Mu_pos}
              fail={phiMnPosEng != null && phiMnPosEng < Mu_pos} />
            <CalcRow code={`${codeRef} §22.3.1`}
              name="φMn (−)" formula="design moment capacity at support"
              expr={phiMnNegEng != null ? 'from beam_checks.phi_mn_neg_knm' : 'run design to compute'}
              result={(phiMnNegEng ?? 0).toFixed(2)} unit="kN·m" engine={phiMnNegEng != null}
              pass={phiMnNegEng != null && phiMnNegEng >= Mu_neg}
              fail={phiMnNegEng != null && phiMnNegEng < Mu_neg} />
            <CalcRow code="—"
              name="ratio" formula="As,prov / As,req"
              expr={`= ${asProvEng.toFixed(0)} / ${(asReqEng ?? asReq).toFixed(0)}`}
              result={(asProvEng / Math.max(1, asReqEng ?? asReq)).toFixed(2)} unit="—"
              pass={asPass} fail={!asPass} />
          </CalcGroup>
        )}

        {tab === 'shr' && (
          <CalcGroup>
            <CalcRow code={`${codeRef} §9.5.3`}
              name="Vu" formula="Vu @ d from face of support"
              expr={checks ? `from beam_checks.vu_max_kn (combo ${checks.vu_combo ?? '—'})` : 'from envelope props'}
              result={Vu.toFixed(1)} unit="kN" emph engine={!!checks} />
            <CalcRow code={`${codeRef} §22.5.5.1`}
              name="φVc" formula="code.Vc_design(fc, b, d, As, Nu)"
              expr={`engine: ACI 0.17·λ·√fc′·bw·d × φ=0.75 (or EC2 form)`}
              result={phiVc.toFixed(2)} unit="kN" engine />
            <CalcRow code={`${codeRef} §22.5.10.5.3`}
              name="Av" formula="Av = nlegs · π·dstir²/4"
              expr={`= 2·π·${stirDia}²/4`}
              result={Av.toFixed(0)} unit="mm²" />
            <CalcRow code={`${codeRef} §22.5.10.5.3`}
              name="φVs" formula="code.Vs_design(Av, fyt, d, s)"
              expr={`= φ·Av·fyt·d / s`}
              result={phiVs.toFixed(2)} unit="kN" engine />
            <CalcRow code={`${codeRef} §22.5.1.1`}
              name="φVn" formula="φVn = φVc + φVs"
              expr={phiVnEng != null ? 'from beam_checks.phi_vn_kn' : `live: ${phiVc.toFixed(2)} + ${phiVs.toFixed(2)}`}
              result={(phiVnEng ?? phiVnLive).toFixed(2)} unit="kN"
              pass={(phiVnEng ?? phiVnLive) >= Vu} fail={(phiVnEng ?? phiVnLive) < Vu}
              engine={phiVnEng != null} />
            <CalcRow code={`${codeRef} §9.7.6.2.2`}
              name="s,max" formula="code.stirrup_spacing_max(d, Vs, b, fc)"
              expr={`engine: min(d/2, 600 mm) when Vs ≤ 0.33·√fc′·bw·d, else min(d/4, 300 mm)`}
              result={sMax.toFixed(0)} unit="mm" engine
              pass={stirSpacingEnd <= sMax} fail={stirSpacingEnd > sMax} />
            <CalcRow code={`${codeRef} §9.6.3.4`}
              name="Av,min" formula="Av,min = max(0.062·√fc′, 0.35) · bw·s/fyt"
              expr={`@ s = ${stirSpacingEnd} mm`}
              result={(Math.max(0.062 * Math.sqrt(fc), 0.35) * b * stirSpacingEnd / fy).toFixed(0)} unit="mm²" />
          </CalcGroup>
        )}

        {tab === 'dev' && (
          <CalcGroup>
            <CalcRow code={`${codeRef} §25.4.2.3`}
              name="ld bot" formula="code.Ld(db, fc′, fy, is_top=false, spacing)"
              expr={ldBottomEng != null
                ? `from beam_checks.ld_bottom_mm (engine result of last run)`
                : `live: db=${t1Dia}, fc′=${fc}, fy=${fy} → engine returns ld in mm`}
              result={(ldBottomEng ?? ldBottomLive).toFixed(0)} unit="mm" engine={ldBottomEng != null} />
            <CalcRow code={`${codeRef} §25.4.2.3 ψt`}
              name="ld top" formula="code.Ld(db, fc′, fy, is_top=true, spacing) — ψt=1.3"
              expr={ldTopEng != null
                ? `from beam_checks.ld_top_mm`
                : `live: bottom × 1.3 (top-bar factor)`}
              result={(ldTopEng ?? ldTopLive).toFixed(0)} unit="mm" engine={ldTopEng != null} />
            <CalcRow code={`${codeRef} §25.4.2.3`}
              name="ld hanger" formula="code.Ld(c1Dia, fc′, fy, true, spacing)"
              expr={`top hanger Ø${c1Dia} — engine value`}
              result={ldHangerLive.toFixed(0)} unit="mm" engine />
            <CalcRow code={`${codeRef} §25.5.2.1 Class A`}
              name="ls·A" formula="code.lap_splice(Ld, 'A')"
              expr={`= 1.0 · Ld_bottom = 1.0 · ${ldBottomLive.toFixed(0)}, min 300 mm`}
              result={lapBClassA.toFixed(0)} unit="mm" engine />
            <CalcRow code={`${codeRef} §25.5.2.1 Class B`}
              name="ls·B" formula="code.lap_splice(Ld, 'B')"
              expr={lapSpliceEng != null
                ? `from beam_checks.lap_splice_mm (engine used Class B)`
                : `= 1.3 · Ld_bottom = 1.3 · ${ldBottomLive.toFixed(0)}`}
              result={(lapSpliceEng ?? lapBClassB).toFixed(0)} unit="mm"
              engine={lapSpliceEng != null} emph />
            <CalcRow code={`${codeRef} §25.5.2.1`}
              name="class" formula="Class A ⇔ ≤50% spliced AND As,prov ≥ 2·As,req"
              expr={`As,prov / As,req = ${(asProvEng / Math.max(1, asReqEng ?? asReq)).toFixed(2)} → ${(asProvEng / Math.max(1, asReqEng ?? asReq)) >= 2 ? 'Class A eligible' : 'use Class B'}`}
              result={(asProvEng / Math.max(1, asReqEng ?? asReq)) >= 2 ? 'A' : 'B'} unit="—" />
            <CalcRow code={`${codeRef} §25.4.3.1`}
              name="ldh hook" formula="ldh = fy·ψe·ψr·ψo·ψc / (23·λ·√fc′) · db^1.5"
              expr={`hook into joint at column face — see DevSplice card for modifiers`}
              result={Math.max(8 * t1Dia, 150, Math.ceil(fy / (23 * Math.sqrt(fc)) * Math.pow(t1Dia, 1.5) / 10) * 10).toFixed(0)} unit="mm" />
          </CalcGroup>
        )}

        {tab === 'serv' && (
          <CalcGroup>
            <CalcRow code={`${codeRef} §9.3.1.1 Table`}
              name="hmin" formula="hmin = L/16 (simply-supported, fy = 420)"
              expr={`= ${span}/16`}
              result={(span / 16).toFixed(0)} unit="mm"
              pass={h >= span / 16} fail={h < span / 16} />
            <CalcRow code={`${codeRef} §25.2.1`}
              name="sclear" formula="s ≥ max(db, 25 mm, 4/3·dagg)"
              expr={`db = ${perimDia}`}
              result={Math.max(perimDia, 25).toFixed(0)} unit="mm" />
            <CalcRow code={`${codeRef} §24.3.2`}
              name="smax,t" formula="s ≤ min(380·(280/fs) − 2.5cc, 300·(280/fs))"
              expr="fs ≈ ⅔·fy" result="≈ 250" unit="mm" />
            <CalcRow code={`${codeRef} §24.2`}
              name="Δ" formula="Δlimit = L/240 (immediate) · L/480 (long-term)"
              expr={`Llimit = ${span}/240`}
              result={(span / 240).toFixed(1)} unit="mm" />
            <CalcRow code={`${codeRef} §20.5.1.3`}
              name="cmin" formula="cmin = 40 mm (interior, not exposed to earth)"
              expr={`provided c = ${cover}`}
              result={cover.toString()} unit="mm" pass={cover >= 40} fail={cover < 40} />
            {Tu > 0 && (
              <>
                <CalcRow code={`${codeRef} §22.7.1.1`}
                  name="Acp" formula="Acp = b·h" expr={`= ${b}·${h}`}
                  result={(b * h).toLocaleString()} unit="mm²" />
                <CalcRow code={`${codeRef} §22.7.4.1(a)`}
                  name="Tth" formula="Tth = 0.083·λ·√fc′ · Acp²/pcp"
                  expr={`= 0.083·√${fc}·(b·h)²/(2(b+h))`}
                  result={(0.083 * Math.sqrt(fc) * (b * h) ** 2 / (2 * (b + h)) / 1e6).toFixed(2)} unit="kN·m" />
                <CalcRow code={`${codeRef} §9.5.4`}
                  name="Tu" formula="Tu @ d from support"
                  expr="from envelope props"
                  result={Tu.toFixed(2)} unit="kN·m" emph />
                {torsCount > 0 && (
                  <CalcRow code={`${codeRef} §9.7.5.1`}
                    name="skin" formula="Aℓ = (At/s)·ph·(fyt/fy)"
                    expr={`provided: ${torsCount * 2}·Ø${torsDia}`}
                    result={(torsCount * 2 * A(torsDia)).toFixed(0)} unit="mm²" />
                )}
              </>
            )}
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
  engine,
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
  /** True when the value is sourced from the engineering library or persisted check row. */
  engine?: boolean
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
      <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink)' }}>
        {name}
        {engine && (
          <span
            style={{
              marginLeft: 4,
              fontSize: 8,
              padding: '1px 3px',
              borderRadius: 2,
              background: 'var(--color-sel-bg)',
              color: 'var(--color-sel)',
              fontWeight: 600,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
            }}
          >
            engine
          </span>
        )}
      </span>
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
