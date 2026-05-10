'use client'

import { useMemo, useState } from 'react'

// Side-effect: register code providers in the client bundle
import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'
import type { CodeStandard, Database } from '@/lib/supabase/types'

type FootingCheckRow = Database['public']['Tables']['footing_checks']['Row']

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type FootingDesignClientProps = {
  initial: {
    label: string
    Lx: number; Ly: number; depth: number; cover: number
    fc: number; fy: number
    qa: number; soilDepth: number; soilGamma: number
    colB: number; colH: number
    Pser: number; Mser: number
    Pu: number; Mu: number
    sds: number
  }
  code_standard: CodeStandard
  checks: FootingCheckRow | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIA_OPTIONS = [12, 16, 20, 25] as const
const SPACING_OPTIONS = [100, 125, 150, 175, 200, 250, 300] as const
const Ab = (d: number) => (Math.PI * d * d) / 4
const AsPerMetre = (dia: number, spacing: number) =>
  spacing > 0 ? (Ab(dia) * 1000) / spacing : 0

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FootingDesignClient({
  initial,
  code_standard,
  checks,
}: FootingDesignClientProps) {
  const code = getCode(code_standard)
  const {
    label, Lx, Ly, depth, cover, fc, fy,
    qa, soilDepth, soilGamma,
    colB, colH,
    Pser, Mser, Pu, Mu, sds,
  } = initial

  // ─── Rebar state ─────────────────────────────────────────────────────
  const [xDia, setXDia] = useState(16)
  const [xSpacing, setXSpacing] = useState(200)
  const [yDia, setYDia] = useState(16)
  const [ySpacing, setYSpacing] = useState(200)

  // ─── Tie beam state ──────────────────────────────────────────────────
  const [tbEnabled, setTbEnabled] = useState(false)
  const [tbB, setTbB] = useState(250)
  const [tbH, setTbH] = useState(400)
  const [tbSpan, setTbSpan] = useState(4000)
  const [tbBarDia, setTbBarDia] = useState(20)
  const [tbNTop, setTbNTop] = useState(3)
  const [tbNBot, setTbNBot] = useState(3)
  const [tbStirrupDia, setTbStirrupDia] = useState(10)
  const [tbStirrupSpc, setTbStirrupSpc] = useState(200)

  // ─── Calc tab state ──────────────────────────────────────────────────
  type CalcTab = 'mat' | 'loads' | 'bearing' | 'punch' | 'oneway' | 'flex' | 'tiebeam'
  const [calcTab, setCalcTab] = useState<CalcTab>('mat')

  // ─── Derived calculations ────────────────────────────────────────────
  const calc = useMemo(() => {
    const Lx_m = Lx / 1000
    const Ly_m = Ly / 1000
    const A = Lx_m * Ly_m
    const ex = Pser !== 0 ? Mser / Pser : 0
    const Wf = A * (depth / 1000) * 24
    const Wsoil = A * ((soilDepth - depth) / 1000) * soilGamma
    const Ptot = Pser + Wf + Wsoil
    const qmax = A > 0 ? (Ptot / A) * (1 + (6 * Math.abs(ex)) / Lx_m) : 0
    const qmin = A > 0 ? (Ptot / A) * (1 - (6 * Math.abs(ex)) / Lx_m) : 0
    const qu = A > 0 ? Pu / A : 0
    const dEff = depth - cover - xDia / 2

    // Punching
    const dFactor = code.punching_d_factor()
    const inset = dEff * dFactor
    const critBx = colB + 2 * inset
    const critHy = colH + 2 * inset
    const bo = 2 * critBx + 2 * critHy
    const Acrit_m2 = (critBx / 1000) * (critHy / 1000)
    const Vu_punch = Pu - qu * Acrit_m2
    const beta_c = Math.max(colB, colH) / Math.min(colB, colH)
    const phiVc_punch = code.Vc_slab_twoway(fc, bo, dEff, beta_c)

    // One-way shear
    const a_x = (Lx - colB) / 2 - dEff
    const a_y = (Ly - colH) / 2 - dEff
    const Vu_one_x = a_x > 0 ? qu * Ly_m * (a_x / 1000) : 0
    const Vu_one_y = a_y > 0 ? qu * Lx_m * (a_y / 1000) : 0
    const phiVc_one_x = code.Vc_slab_oneway(fc, Ly * 1, dEff)
    const phiVc_one_y = code.Vc_slab_oneway(fc, Lx * 1, dEff)

    // Flexure
    const arm_x = (Lx - colB) / 2 / 1000
    const arm_y = (Ly - colH) / 2 / 1000
    const Mu_x = qu * Ly_m * arm_x * arm_x / 2
    const Mu_y = qu * Lx_m * arm_y * arm_y / 2

    // Whitney As,req — α₁ from code provider
    const a1 = code.stress_block_stress_factor(fc)
    const asReqFn = (Mu_face: number, b_strip: number, d: number) => {
      if (Mu_face <= 0) return 0
      const Rn = (Mu_face * 1e6) / (0.9 * b_strip * d * d)
      const rho = (a1 * fc / fy) * (1 - Math.sqrt(Math.max(0, 1 - (2 * Rn) / (a1 * fc))))
      return rho * b_strip * d
    }
    const As_req_x = asReqFn(Mu_x, 1000, dEff)
    const As_req_y = asReqFn(Mu_y, 1000, dEff)
    const As_min = code.As_min(fc, fy, 1000, dEff)
    const rhoTemp = code.rho_temp(fy)
    const As_temp = rhoTemp * 1000 * depth

    const As_prov_x = AsPerMetre(xDia, xSpacing)
    const As_prov_y = AsPerMetre(yDia, ySpacing)

    // Bearing
    const A1 = colB * colH
    const A2 = Math.min(Lx * Ly, 4 * A1)
    const phiBn = code.bearing_capacity(fc, A1, A2)

    // Tie beam
    const P_tie = sds * Pu * 0.1
    const tbAg = tbB * tbH
    const tbAs = (tbNTop + tbNBot) * Ab(tbBarDia)
    const phiComp = code.phi_axial(0, 'tied')
    const tbPhiPn_comp = phiComp * (a1 * code.fcd(fc) * (tbAg - tbAs) + code.fyd(fy) * tbAs) / 1000
    const tbPhiPn_tens = 0.9 * code.fyd(fy) * tbAs / 1000

    // Development lengths
    const ldBottom = code.Ld(xDia, fc, fy, false, xSpacing)
    const ldDowel = code.Ld(xDia, fc, fy, false, xDia * 8)
    const lapB = code.lap_splice(ldBottom, 'B')

    // Moment capacity via CodeProvider
    const capX = code.moment_capacity(
      As_prov_x, 0,
      { b_mm: 1000, h_mm: depth, d_mm: dEff, clear_cover_mm: cover },
      { fc_mpa: fc, fy_mpa: fy, fys_mpa: fy },
    )
    const capY = code.moment_capacity(
      As_prov_y, 0,
      { b_mm: 1000, h_mm: depth, d_mm: dEff, clear_cover_mm: cover },
      { fc_mpa: fc, fy_mpa: fy, fys_mpa: fy },
    )

    return {
      Lx_m, Ly_m, A, ex, Wf, Wsoil, Ptot,
      qmax, qmin, qu,
      dEff, dFactor, inset, critBx, critHy, bo, Acrit_m2,
      Vu_punch, phiVc_punch, beta_c,
      a_x, a_y, Vu_one_x, Vu_one_y, phiVc_one_x, phiVc_one_y,
      arm_x, arm_y, Mu_x, Mu_y,
      As_req_x, As_req_y, As_min, As_temp, rhoTemp,
      As_prov_x, As_prov_y,
      A1, A2, phiBn,
      P_tie, tbAg, tbAs, tbPhiPn_comp, tbPhiPn_tens,
      ldBottom, ldDowel, lapB,
      capX, capY,
    }
  }, [
    Lx, Ly, depth, cover, fc, fy, qa, soilDepth, soilGamma,
    colB, colH, Pser, Mser, Pu, Mu, sds,
    xDia, xSpacing, yDia, ySpacing,
    tbB, tbH, tbBarDia, tbNTop, tbNBot,
    code,
  ])

  const {
    Lx_m, Ly_m, A, ex, Wf, Wsoil, Ptot,
    qmax, qmin, qu,
    dEff, dFactor, inset, critBx, critHy, bo, Acrit_m2,
    Vu_punch, phiVc_punch,
    a_x, a_y, Vu_one_x, Vu_one_y, phiVc_one_x, phiVc_one_y,
    arm_x, arm_y, Mu_x, Mu_y,
    As_req_x, As_req_y, As_min, As_temp,
    As_prov_x, As_prov_y,
    phiBn,
    P_tie, tbAg, tbAs, tbPhiPn_comp, tbPhiPn_tens,
    ldBottom, ldDowel, lapB,
    capX, capY,
  } = calc

  const codeRef = code_standard.replace(/_/g, ' ')

  // ─── MTO calculations ───────────────────────────────────────────────
  const mto = useMemo(() => {
    const massOf = code.bar_mass_kg_per_m
    // Concrete
    const volFooting = (Lx / 1000) * (Ly / 1000) * (depth / 1000)
    // Formwork: perimeter × depth
    const formwork = 2 * ((Lx / 1000) + (Ly / 1000)) * (depth / 1000)

    // Bottom mat X (horizontal bars span Lx minus covers + hook)
    const nBarsX = Math.floor((Ly - 2 * cover) / xSpacing) + 1
    const barLenX = Lx - 2 * cover + 2 * (6.25 * xDia) // 90-degree hook
    const rebarXMass = nBarsX * (barLenX / 1000) * massOf(xDia)

    // Bottom mat Y (vertical bars span Ly minus covers + hook)
    const nBarsY = Math.floor((Lx - 2 * cover) / ySpacing) + 1
    const barLenY = Ly - 2 * cover + 2 * (6.25 * yDia)
    const rebarYMass = nBarsY * (barLenY / 1000) * massOf(yDia)

    let totalRebar = rebarXMass + rebarYMass

    // Tie beam quantities
    let tbConc = 0
    let tbLongMass = 0
    let tbStirMass = 0
    if (tbEnabled) {
      tbConc = (tbB / 1000) * (tbH / 1000) * (tbSpan / 1000)
      const tbLongLen = tbSpan + 2 * 300 // anchorage into footing
      tbLongMass = (tbNTop + tbNBot) * (tbLongLen / 1000) * massOf(tbBarDia)
      const nStir = Math.ceil(tbSpan / tbStirrupSpc) + 1
      const stirLen = 2 * ((tbB - 2 * 40) + (tbH - 2 * 40)) + 2 * Math.max(75, 6 * tbStirrupDia)
      tbStirMass = nStir * (stirLen / 1000) * massOf(tbStirrupDia)
      totalRebar += tbLongMass + tbStirMass
    }

    const kgPerM3 = volFooting > 0 ? totalRebar / volFooting : 0

    return {
      volFooting, formwork,
      nBarsX, barLenX, rebarXMass,
      nBarsY, barLenY, rebarYMass,
      tbConc, tbLongMass, tbStirMass,
      totalRebar, kgPerM3,
    }
  }, [
    Lx, Ly, depth, cover,
    xDia, xSpacing, yDia, ySpacing,
    tbEnabled, tbB, tbH, tbSpan, tbBarDia, tbNTop, tbNBot, tbStirrupDia, tbStirrupSpc,
    code,
  ])

  // =====================================================================
  // STEP 2 — Reinforcement Design
  // =====================================================================

  return (
    <>
      {/* ─── STEP 2 — Reinforcement Design ─────────────────────────────── */}
      <div className="card" data-step="2-reinforcement">
        <div className="card-h">
          <span className="num-badge">2</span>
          <span className="label">Reinforcement Design</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            bottom mat X &amp; Y · bar sizes · tie beam toggle
          </span>
          <div className="right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', color: 'var(--color-ink-2)' }}>
              <input
                type="checkbox"
                checked={tbEnabled}
                onChange={e => setTbEnabled(e.target.checked)}
                style={{ accentColor: 'var(--color-green)' }}
              />
              Tie beam
            </label>
          </div>
        </div>

        <div className="card-b" style={{ padding: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          {/* Col 1: Footing plan rebar SVG */}
          <div style={{ padding: 12, borderRight: '1px solid var(--color-line-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--color-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, alignSelf: 'flex-start' }}>
              Plan — Bottom Mat
            </div>
            <FootingPlanRebar
              Lx={Lx} Ly={Ly} colB={colB} colH={colH}
              cover={cover} dEff={dEff}
              xSpacing={xSpacing} ySpacing={ySpacing}
              tbEnabled={tbEnabled} tbB={tbB}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10, color: 'var(--color-ink-3)', justifyContent: 'center' }}>
              <LegendDot color="#B06008" label="Mat X" />
              <LegendDot color="#D4820F" label="Mat Y" />
              <LegendDot color="#9A9490" label="Column" />
              {tbEnabled && <LegendDot color="#1755A0" label="Tie beam" />}
            </div>
          </div>

          {/* Col 2: Rebar groups */}
          <div style={{ padding: 10, borderRight: '1px solid var(--color-line-2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <RebarGroupBlock title="Bottom Mat X-direction" color="#B06008" hint="horizontal bars">
              <RebarSelect label="Dia" value={xDia} opts={DIA_OPTIONS} onChange={setXDia} code={code} />
              <RebarSelect label="Spacing" value={xSpacing} opts={SPACING_OPTIONS} onChange={setXSpacing} unit="mm" />
              <RebarCalcLine
                label="As,prov"
                value={`${As_prov_x.toFixed(0)} mm²/m`}
                pass={As_prov_x >= Math.max(As_req_x, As_min)}
              />
              <RebarCalcLine
                label="As,req"
                value={`${Math.max(As_req_x, As_min).toFixed(0)} mm²/m`}
              />
            </RebarGroupBlock>

            <RebarGroupBlock title="Bottom Mat Y-direction" color="#D4820F" hint="vertical bars">
              <RebarSelect label="Dia" value={yDia} opts={DIA_OPTIONS} onChange={setYDia} code={code} />
              <RebarSelect label="Spacing" value={ySpacing} opts={SPACING_OPTIONS} onChange={setYSpacing} unit="mm" />
              <RebarCalcLine
                label="As,prov"
                value={`${As_prov_y.toFixed(0)} mm²/m`}
                pass={As_prov_y >= Math.max(As_req_y, As_min)}
              />
              <RebarCalcLine
                label="As,req"
                value={`${Math.max(As_req_y, As_min).toFixed(0)} mm²/m`}
              />
            </RebarGroupBlock>

            {tbEnabled && (
              <RebarGroupBlock title="Tie Beam Longitudinal" color="#1755A0" hint="top + bottom bars">
                <RebarSelect label="Dia" value={tbBarDia} opts={DIA_OPTIONS} onChange={setTbBarDia} code={code} />
                <TbCountRow label="Top" count={tbNTop} setCount={setTbNTop} />
                <TbCountRow label="Bot" count={tbNBot} setCount={setTbNBot} />
                <RebarCalcLine label="As,total" value={`${((tbNTop + tbNBot) * Ab(tbBarDia)).toFixed(0)} mm²`} />
              </RebarGroupBlock>
            )}
          </div>

          {/* Col 3: Demand summary */}
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="card" style={{ borderRadius: 5 }}>
              <div className="card-h" style={{ minHeight: 26, padding: '0 10px' }}>
                <span className="label" style={{ fontSize: 9.5 }}>Demand per metre strip</span>
              </div>
              <div style={{ padding: '8px 10px', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <StepRow k="Mu,x" v={`${Mu_x.toFixed(2)} kN·m/m`} />
                <StepRow k="Mu,y" v={`${Mu_y.toFixed(2)} kN·m/m`} />
                <StepRow k="As,req,x" v={`${As_req_x.toFixed(0)} mm²/m`} />
                <StepRow k="As,req,y" v={`${As_req_y.toFixed(0)} mm²/m`} />
                <StepRow k="As,min" v={`${As_min.toFixed(0)} mm²/m`} accent />
                <StepRow k="As,temp" v={`${As_temp.toFixed(0)} mm²/m`} />
              </div>
            </div>

            {tbEnabled && (
              <div className="card" style={{ borderRadius: 5 }}>
                <div className="card-h" style={{ minHeight: 26, padding: '0 10px' }}>
                  <span className="label" style={{ fontSize: 9.5 }}>Tie-beam axial</span>
                </div>
                <div style={{ padding: '8px 10px', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <StepRow k="SDS" v={sds.toFixed(2)} />
                  <StepRow k="P_tie" v={`${P_tie.toFixed(1)} kN`} accent />
                  <StepRow k="Dims" v={`${tbB}×${tbH} mm`} />
                  <TbInputRow label="Span" value={tbSpan} onChange={setTbSpan} unit="mm" />
                  <TbInputRow label="Stir Ø" value={tbStirrupDia} onChange={setTbStirrupDia} unit="mm" />
                  <TbInputRow label="Stir spc" value={tbStirrupSpc} onChange={setTbStirrupSpc} unit="mm" />
                  <StepRow
                    k="φPn,c"
                    v={`${tbPhiPn_comp.toFixed(1)} kN`}
                    pass={tbPhiPn_comp >= P_tie}
                  />
                  <StepRow
                    k="φPn,t"
                    v={`${tbPhiPn_tens.toFixed(1)} kN`}
                    pass={tbPhiPn_tens >= P_tie}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── STEP 3 — Design Forces ─────────────────────────────────────── */}
      <div className="card" data-step="3-forces">
        <div className="card-h">
          <span className="num-badge">3</span>
          <span className="label">Design Forces</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            bearing pressure · punching perimeter · one-way shear
          </span>
        </div>
        <div className="card-b" style={{ padding: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          {/* Col 1: Pressure prism */}
          <div style={{ padding: 12, borderRight: '1px solid var(--color-line-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--color-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, alignSelf: 'flex-start' }}>
              Bearing Pressure
            </div>
            <FootingPressureField
              Lx={Lx} Ly={Ly} qmax={qmax} qmin={qmin} qa={qa}
            />
            <div style={{ fontSize: 10.5, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <span className="mono" style={{ color: qmax <= qa ? 'var(--color-pass)' : 'var(--color-fail)', fontWeight: 600 }}>
                qmax = {qmax.toFixed(1)} kPa {qmax <= qa ? '< ' : '> '} qa = {qa.toFixed(1)} kPa
              </span>
            </div>
          </div>

          {/* Col 2: Punching perimeter */}
          <div style={{ padding: 12, borderRight: '1px solid var(--color-line-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--color-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, alignSelf: 'flex-start' }}>
              Punching Shear
            </div>
            <FootingPunchPerimeter
              Lx={Lx} Ly={Ly} colB={colB} colH={colH}
              dEff={dEff} dFactor={dFactor}
            />
            <div style={{ fontSize: 10.5, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <span className="mono" style={{ color: phiVc_punch >= Vu_punch ? 'var(--color-pass)' : 'var(--color-fail)', fontWeight: 600 }}>
                Vu = {Vu_punch.toFixed(1)} kN {phiVc_punch >= Vu_punch ? '<' : '>'} {'φ'}Vc = {phiVc_punch.toFixed(1)} kN
              </span>
            </div>
          </div>

          {/* Col 3: One-way shear */}
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--color-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, alignSelf: 'flex-start' }}>
              One-way Shear
            </div>
            <FootingOneWayDiag
              Lx={Lx} Ly={Ly} colB={colB} colH={colH} dEff={dEff}
            />
            <div style={{ fontSize: 10.5, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
              <span className="mono" style={{ color: phiVc_one_x >= Vu_one_x ? 'var(--color-pass)' : 'var(--color-fail)', fontWeight: 600 }}>
                X: Vu={Vu_one_x.toFixed(1)} kN {phiVc_one_x >= Vu_one_x ? '<' : '>'} {'φ'}Vc={phiVc_one_x.toFixed(1)} kN
              </span>
              <span className="mono" style={{ color: phiVc_one_y >= Vu_one_y ? 'var(--color-pass)' : 'var(--color-fail)', fontWeight: 600 }}>
                Y: Vu={Vu_one_y.toFixed(1)} kN {phiVc_one_y >= Vu_one_y ? '<' : '>'} {'φ'}Vc={phiVc_one_y.toFixed(1)} kN
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── STEP 4 — Plan & Section ────────────────────────────────────── */}
      <div className="card" data-step="4-plan-section">
        <div className="card-h">
          <span className="num-badge">4</span>
          <span className="label">Plan &amp; Section</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            full plan with rebar · section A-A · section B-B
          </span>
        </div>
        <div className="card-b" style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Left: Full plan */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <FootingFullPlan
              Lx={Lx} Ly={Ly} colB={colB} colH={colH}
              cover={cover} dEff={dEff}
              xDia={xDia} xSpacing={xSpacing}
              yDia={yDia} ySpacing={ySpacing}
              tbEnabled={tbEnabled} tbB={tbB}
              code={code}
            />
          </div>
          {/* Right: Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FootingSectionView
              dir="A-A"
              Lspan={Lx} depth={depth} cover={cover}
              colDim={colB} colPerp={colH}
              dEff={dEff}
              barDia={xDia} barSpacing={xSpacing}
              tbEnabled={tbEnabled} tbB={tbB} tbH={tbH}
              code={code}
            />
            <FootingSectionView
              dir="B-B"
              Lspan={Ly} depth={depth} cover={cover}
              colDim={colH} colPerp={colB}
              dEff={dEff}
              barDia={yDia} barSpacing={ySpacing}
              tbEnabled={tbEnabled} tbB={tbB} tbH={tbH}
              code={code}
            />
          </div>
        </div>
      </div>

      {/* ─── STEP 4b — Development & Splice ─────────────────────────────── */}
      <div className="card" data-step="4b-dev-splice">
        <div className="card-h">
          <span className="num-badge">4b</span>
          <span className="label">Development &amp; Splice</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            column dowels · footing bar hooks · tie beam laps
          </span>
        </div>
        <div className="card-b" style={{ padding: 0, display: 'grid', gridTemplateColumns: tbEnabled ? '1fr 1fr 1fr' : '1fr 1fr', gap: 0 }}>
          {/* Column dowels */}
          <div style={{ padding: 12, borderRight: '1px solid var(--color-line-2)' }}>
            <div style={{ fontSize: 10, color: 'var(--color-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 8 }}>
              Column Dowels
            </div>
            <DSRow label="Bar dia" value={`${code.bar_label(xDia)}`} />
            <DSRow label="ldc" value={`${ldDowel.toFixed(0)} mm`} />
            <DSRow label="Available depth" value={`${(depth - cover - xDia).toFixed(0)} mm`} pass={depth - cover - xDia >= ldDowel} />
            <DSRow
              label="Hook alt."
              value={`90° std hook, ldh = ${Math.max(8 * xDia, 150).toFixed(0)} mm`}
              pass
            />
          </div>

          {/* Footing bars */}
          <div style={{ padding: 12, borderRight: tbEnabled ? '1px solid var(--color-line-2)' : undefined }}>
            <div style={{ fontSize: 10, color: 'var(--color-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 8 }}>
              Footing Bars
            </div>
            <DSRow label="End treatment" value="90° hook" />
            <DSRow label="Hook ext." value={`${(6.25 * xDia).toFixed(0)} mm (= 6.25db)`} />
            <DSRow label="ld (bottom)" value={`${ldBottom.toFixed(0)} mm`} />
          </div>

          {/* Tie beam laps */}
          {tbEnabled && (
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--color-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 8 }}>
                Tie Beam Laps
              </div>
              <DSRow label="ld" value={`${code.Ld(tbBarDia, fc, fy, false, tbBarDia * 8).toFixed(0)} mm`} />
              <DSRow label="Lap (Class B)" value={`${code.lap_splice(code.Ld(tbBarDia, fc, fy, false, tbBarDia * 8), 'B').toFixed(0)} mm`} />
              <DSRow label="Min lap" value="300 mm" />
            </div>
          )}
        </div>
      </div>

      {/* ─── STEP 5 — Calculation Breakdown ─────────────────────────────── */}
      <div className="card" data-step="5-calc">
        <div className="card-h">
          <span className="num-badge">5</span>
          <span className="label">Calculation Breakdown</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            {codeRef}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 0, background: 'var(--color-bg)', borderRadius: 4, padding: 2, border: '1px solid var(--color-line-2)' }}>
            {([
              { id: 'mat' as CalcTab, label: 'Material' },
              { id: 'loads' as CalcTab, label: 'Loads' },
              { id: 'bearing' as CalcTab, label: 'Bearing' },
              { id: 'punch' as CalcTab, label: 'Punching' },
              { id: 'oneway' as CalcTab, label: 'One-way' },
              { id: 'flex' as CalcTab, label: 'Flexure' },
              ...(tbEnabled ? [{ id: 'tiebeam' as CalcTab, label: 'Tie-beam' }] : []),
            ]).map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCalcTab(t.id)}
                style={{
                  padding: '3px 10px',
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  border: 0,
                  borderRadius: 3,
                  cursor: 'pointer',
                  background: calcTab === t.id ? 'var(--color-ink)' : 'transparent',
                  color: calcTab === t.id ? '#fff' : 'var(--color-ink-3)',
                }}
              >
                {t.label}
              </button>
            ))}
          </span>
        </div>
        <div className="card-b" style={{ padding: 0 }}>
          {calcTab === 'mat' && (
            <CalcGroupF>
              <CalcRowF name="f'c" expr={`= ${fc}`} val={fc.toFixed(1)} unit="MPa" note="concrete compressive strength" />
              <CalcRowF name="fy" expr={`= ${fy}`} val={fy.toFixed(1)} unit="MPa" note="steel yield strength" />
              <CalcRowF name="Ec" expr={`= 4700·√f'c = 4700·√${fc}`} val={(4700 * Math.sqrt(fc)).toFixed(0)} unit="MPa" note="modulus of elasticity" />
              <CalcRowF name="γc" expr="= 24" val="24" unit="kN/m³" note="concrete unit weight" />
              <CalcRowF name="φ flex" expr="= 0.90" val="0.90" unit="—" note="flexure reduction factor" />
              <CalcRowF name="φ shear" expr="= 0.75" val="0.75" unit="—" note="shear reduction factor" />
              <CalcRowF name="φ bear" expr="= 0.65" val="0.65" unit="—" note="bearing reduction factor" />
              <CalcRowF name="dEff" expr={`= ${depth} - ${cover} - ${xDia}/2`} val={dEff.toFixed(0)} unit="mm" note="effective depth" />
            </CalcGroupF>
          )}

          {calcTab === 'loads' && (
            <CalcGroupF>
              <CalcRowF name="Pser" expr="" val={Pser.toFixed(1)} unit="kN" note="service axial load" />
              <CalcRowF name="Mser" expr="" val={Mser.toFixed(1)} unit="kN·m" note="service moment" />
              <CalcRowF name="A" expr={`= ${Lx_m.toFixed(2)} × ${Ly_m.toFixed(2)}`} val={A.toFixed(3)} unit="m²" note="footing area" />
              <CalcRowF name="Wf" expr={`= ${A.toFixed(3)} × ${(depth / 1000).toFixed(3)} × 24`} val={Wf.toFixed(1)} unit="kN" note="footing self-weight" />
              <CalcRowF name="Wsoil" expr={`= ${A.toFixed(3)} × ${((soilDepth - depth) / 1000).toFixed(3)} × ${soilGamma}`} val={Wsoil.toFixed(1)} unit="kN" note="overburden weight" />
              <CalcRowF name="Ptot" expr={`= Pser + Wf + Wsoil = ${Pser.toFixed(1)} + ${Wf.toFixed(1)} + ${Wsoil.toFixed(1)}`} val={Ptot.toFixed(1)} unit="kN" note="total service load" />
              <CalcRowF name="e" expr={`= Mser/Pser = ${Mser.toFixed(1)}/${Pser.toFixed(1)}`} val={ex.toFixed(4)} unit="m" note="eccentricity" />
              <CalcRowF name="Pu" expr="" val={Pu.toFixed(1)} unit="kN" note="factored axial" emph />
              <CalcRowF name="Mu" expr="" val={Mu.toFixed(1)} unit="kN·m" note="factored moment" emph />
            </CalcGroupF>
          )}

          {calcTab === 'bearing' && (
            <CalcGroupF>
              <CalcRowF name="A" expr={`= ${Lx_m.toFixed(2)} × ${Ly_m.toFixed(2)}`} val={A.toFixed(3)} unit="m²" />
              <CalcRowF name="Sx" expr={`= Ly·Lx²/6`} val={(Ly_m * Lx_m * Lx_m / 6).toFixed(4)} unit="m³" note="section modulus X" />
              <CalcRowF name="qmax" expr={`= Ptot/A × (1 + 6e/Lx) = ${Ptot.toFixed(1)}/${A.toFixed(3)} × (1 + 6·${Math.abs(ex).toFixed(4)}/${Lx_m.toFixed(2)})`} val={qmax.toFixed(1)} unit="kPa" note="max soil pressure" />
              <CalcRowF name="qmin" expr={`= Ptot/A × (1 - 6e/Lx)`} val={qmin.toFixed(1)} unit="kPa" note="min soil pressure" />
              <CalcRowF name="qa" expr="" val={qa.toFixed(1)} unit="kPa" note="allowable bearing" />
              <CalcRowF
                name="check"
                expr={`qmax = ${qmax.toFixed(1)} ${qmax <= qa ? '≤' : '>'} qa = ${qa.toFixed(1)}`}
                val={qmax <= qa ? 'PASS' : 'FAIL'}
                unit=""
                pass={qmax <= qa}
                fail={qmax > qa}
              />
            </CalcGroupF>
          )}

          {calcTab === 'punch' && (
            <CalcGroupF>
              <CalcRowF name="d" expr={`= ${depth} - ${cover} - ${xDia}/2`} val={dEff.toFixed(0)} unit="mm" note="effective depth" />
              <CalcRowF name="d factor" expr={`punching_d_factor() = ${dFactor}`} val={dFactor.toFixed(1)} unit="" note={dFactor === 0.5 ? 'at d/2 from face' : 'at 2d from face'} />
              <CalcRowF name="bo" expr={`= 2(${colB}+${(dEff * dFactor * 2).toFixed(0)}) + 2(${colH}+${(dEff * dFactor * 2).toFixed(0)})`} val={bo.toFixed(0)} unit="mm" note="critical perimeter" />
              <CalcRowF name="Acrit" expr={`= ${(critBx / 1000).toFixed(3)} × ${(critHy / 1000).toFixed(3)}`} val={Acrit_m2.toFixed(4)} unit="m²" note="critical area" />
              <CalcRowF name="qu" expr={`= Pu/A = ${Pu.toFixed(1)}/${A.toFixed(3)}`} val={qu.toFixed(1)} unit="kPa" note="factored pressure" />
              <CalcRowF name="Vu" expr={`= Pu - qu·Acrit = ${Pu.toFixed(1)} - ${qu.toFixed(1)}·${Acrit_m2.toFixed(4)}`} val={Vu_punch.toFixed(1)} unit="kN" note="punching demand" emph />
              <CalcRowF name="φVc" expr="code.Vc_slab_twoway(fc, bo, d, βc)" val={phiVc_punch.toFixed(1)} unit="kN" note="punching capacity" engine />
              <CalcRowF
                name="ratio"
                expr={`= Vu/φVc = ${Vu_punch.toFixed(1)}/${phiVc_punch.toFixed(1)}`}
                val={(Vu_punch / Math.max(1, phiVc_punch)).toFixed(3)}
                unit=""
                pass={phiVc_punch >= Vu_punch}
                fail={phiVc_punch < Vu_punch}
              />
            </CalcGroupF>
          )}

          {calcTab === 'oneway' && (
            <CalcGroupF>
              <CalcRowF name="d" expr="" val={dEff.toFixed(0)} unit="mm" note="effective depth" />
              <CalcRowF name="a_x" expr={`= (Lx-colB)/2 - d = (${Lx}-${colB})/2 - ${dEff.toFixed(0)}`} val={a_x.toFixed(0)} unit="mm" note="crit section X" />
              <CalcRowF name="a_y" expr={`= (Ly-colH)/2 - d = (${Ly}-${colH})/2 - ${dEff.toFixed(0)}`} val={a_y.toFixed(0)} unit="mm" note="crit section Y" />
              <CalcRowF name="qu" expr={`= Pu/A = ${Pu.toFixed(1)}/${A.toFixed(3)}`} val={qu.toFixed(1)} unit="kPa" />
              <CalcRowF name="Vu,x" expr={`= qu × Ly × a_x/1000 = ${qu.toFixed(1)} × ${Ly_m.toFixed(2)} × ${(a_x / 1000).toFixed(3)}`} val={Vu_one_x.toFixed(1)} unit="kN" note="shear demand X" emph />
              <CalcRowF name="φVc,x" expr="code.Vc_slab_oneway(fc, Ly, d)" val={phiVc_one_x.toFixed(1)} unit="kN" engine />
              <CalcRowF name="X check" expr={`${Vu_one_x.toFixed(1)} ${phiVc_one_x >= Vu_one_x ? '≤' : '>'} ${phiVc_one_x.toFixed(1)}`} val={phiVc_one_x >= Vu_one_x ? 'PASS' : 'FAIL'} unit="" pass={phiVc_one_x >= Vu_one_x} fail={phiVc_one_x < Vu_one_x} />
              <CalcRowF name="Vu,y" expr={`= qu × Lx × a_y/1000 = ${qu.toFixed(1)} × ${Lx_m.toFixed(2)} × ${(a_y / 1000).toFixed(3)}`} val={Vu_one_y.toFixed(1)} unit="kN" note="shear demand Y" emph />
              <CalcRowF name="φVc,y" expr="code.Vc_slab_oneway(fc, Lx, d)" val={phiVc_one_y.toFixed(1)} unit="kN" engine />
              <CalcRowF name="Y check" expr={`${Vu_one_y.toFixed(1)} ${phiVc_one_y >= Vu_one_y ? '≤' : '>'} ${phiVc_one_y.toFixed(1)}`} val={phiVc_one_y >= Vu_one_y ? 'PASS' : 'FAIL'} unit="" pass={phiVc_one_y >= Vu_one_y} fail={phiVc_one_y < Vu_one_y} />
            </CalcGroupF>
          )}

          {calcTab === 'flex' && (
            <CalcGroupF>
              <CalcRowF name="arm,x" expr={`= (Lx-colB)/2 = (${Lx}-${colB})/2`} val={(arm_x * 1000).toFixed(0)} unit="mm" note="cantilever X" />
              <CalcRowF name="arm,y" expr={`= (Ly-colH)/2 = (${Ly}-${colH})/2`} val={(arm_y * 1000).toFixed(0)} unit="mm" note="cantilever Y" />
              <CalcRowF name="Mu,x" expr={`= qu × Ly × arm²/2 = ${qu.toFixed(1)} × ${Ly_m.toFixed(2)} × ${arm_x.toFixed(3)}²/2`} val={Mu_x.toFixed(2)} unit="kN·m/m" note="moment at face X" emph />
              <CalcRowF name="Mu,y" expr={`= qu × Lx × arm²/2 = ${qu.toFixed(1)} × ${Lx_m.toFixed(2)} × ${arm_y.toFixed(3)}²/2`} val={Mu_y.toFixed(2)} unit="kN·m/m" note="moment at face Y" emph />
              <CalcRowF name="As,req,x" expr="Whitney: Rn = M·10⁶/(φ·b·d²), ρ = (0.85fc/fy)(1-√(1-2Rn/0.85fc))" val={As_req_x.toFixed(0)} unit="mm²/m" />
              <CalcRowF name="As,req,y" expr="same formula for Y-direction" val={As_req_y.toFixed(0)} unit="mm²/m" />
              <CalcRowF name="As,min" expr="code.As_min(fc, fy, 1000, d)" val={As_min.toFixed(0)} unit="mm²/m" engine />
              <CalcRowF
                name="As,prov,x"
                expr={`= ${code.bar_label(xDia)} @ ${xSpacing} mm c/c`}
                val={As_prov_x.toFixed(0)}
                unit="mm²/m"
                pass={As_prov_x >= Math.max(As_req_x, As_min)}
                fail={As_prov_x < Math.max(As_req_x, As_min)}
              />
              <CalcRowF
                name="As,prov,y"
                expr={`= ${code.bar_label(yDia)} @ ${ySpacing} mm c/c`}
                val={As_prov_y.toFixed(0)}
                unit="mm²/m"
                pass={As_prov_y >= Math.max(As_req_y, As_min)}
                fail={As_prov_y < Math.max(As_req_y, As_min)}
              />
              <CalcRowF name="φMn,x" expr="code.moment_capacity()" val={capX.phi_Mn_kNm.toFixed(2)} unit="kN·m/m" engine pass={capX.phi_Mn_kNm >= Mu_x} fail={capX.phi_Mn_kNm < Mu_x} />
              <CalcRowF name="φMn,y" expr="code.moment_capacity()" val={capY.phi_Mn_kNm.toFixed(2)} unit="kN·m/m" engine pass={capY.phi_Mn_kNm >= Mu_y} fail={capY.phi_Mn_kNm < Mu_y} />
            </CalcGroupF>
          )}

          {calcTab === 'tiebeam' && tbEnabled && (
            <CalcGroupF>
              <CalcRowF name="SDS" expr="" val={sds.toFixed(2)} unit="" note="site design spectral accel." />
              <CalcRowF name="Pu" expr="" val={Pu.toFixed(1)} unit="kN" note="factored column axial" />
              <CalcRowF name="P_tie" expr={`= SDS × Pu × 0.1 = ${sds.toFixed(2)} × ${Pu.toFixed(1)} × 0.1`} val={P_tie.toFixed(1)} unit="kN" note="tie beam axial demand" emph />
              <CalcRowF name="Ag" expr={`= ${tbB} × ${tbH}`} val={tbAg.toFixed(0)} unit="mm²" note="tie beam gross area" />
              <CalcRowF name="As" expr={`= (${tbNTop}+${tbNBot}) × Ab(${code.bar_label(tbBarDia)})`} val={tbAs.toFixed(0)} unit="mm²" note="total longitudinal" />
              <CalcRowF name="φPn,comp" expr={`= 0.65 × (0.85·fc·(Ag-As) + fy·As) / 1000`} val={tbPhiPn_comp.toFixed(1)} unit="kN" note="compression capacity" />
              <CalcRowF name="φPn,tens" expr={`= 0.9 × fy × As / 1000`} val={tbPhiPn_tens.toFixed(1)} unit="kN" note="tension capacity" />
              <CalcRowF
                name="comp ratio"
                expr={`= P_tie/φPn,comp = ${P_tie.toFixed(1)}/${tbPhiPn_comp.toFixed(1)}`}
                val={(P_tie / Math.max(1, tbPhiPn_comp)).toFixed(3)}
                unit=""
                pass={tbPhiPn_comp >= P_tie}
                fail={tbPhiPn_comp < P_tie}
              />
              <CalcRowF
                name="tens ratio"
                expr={`= P_tie/φPn,tens = ${P_tie.toFixed(1)}/${tbPhiPn_tens.toFixed(1)}`}
                val={(P_tie / Math.max(1, tbPhiPn_tens)).toFixed(3)}
                unit=""
                pass={tbPhiPn_tens >= P_tie}
                fail={tbPhiPn_tens < P_tie}
              />
            </CalcGroupF>
          )}
        </div>
      </div>

      {/* ─── STEP 6 — MTO ───────────────────────────────────────────────── */}
      <div className="card" data-step="6-mto">
        <div className="card-h">
          <span className="num-badge">6</span>
          <span className="label">Material Take-Off</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            per footing {label} · concrete · formwork · rebar
          </span>
        </div>
        <div className="card-b" style={{ padding: 0 }}>
          {/* Summary strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid var(--color-line-2)', background: 'var(--color-bg)' }}>
            <MTOSummaryCell label="Concrete" value={`${mto.volFooting.toFixed(2)} m³`} sub={tbEnabled ? `+ TB ${mto.tbConc.toFixed(2)} m³` : 'footing only'} />
            <MTOSummaryCell label="Total Rebar" value={`${mto.totalRebar.toFixed(1)} kg`} sub={`${mto.kgPerM3.toFixed(1)} kg/m³`} />
            <MTOSummaryCell label="Formwork" value={`${mto.formwork.toFixed(2)} m²`} sub="perimeter × depth" />
          </div>

          <table className="t" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ width: 50 }}>Mark</th>
                <th>Description</th>
                <th className="num" style={{ width: 50, textAlign: 'right' }}>Qty</th>
                <th className="num" style={{ width: 80, textAlign: 'right' }}>Unit</th>
                <th className="num" style={{ width: 80, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <MTORow mark="C1" desc="Footing concrete" qty="1" unit="m³" amount={mto.volFooting.toFixed(2)} />
              <MTORow mark="F1" desc="Footing formwork" qty="1" unit="m²" amount={mto.formwork.toFixed(2)} />
              <MTORow
                mark="R1"
                desc={`Bottom mat X — ${code.bar_label(xDia)} @ ${xSpacing} c/c`}
                qty={String(mto.nBarsX)}
                unit="kg"
                amount={mto.rebarXMass.toFixed(1)}
              />
              <MTORow
                mark="R2"
                desc={`Bottom mat Y — ${code.bar_label(yDia)} @ ${ySpacing} c/c`}
                qty={String(mto.nBarsY)}
                unit="kg"
                amount={mto.rebarYMass.toFixed(1)}
              />
              {tbEnabled && (
                <>
                  <MTORow mark="C2" desc="Tie beam concrete" qty="1" unit="m³" amount={mto.tbConc.toFixed(2)} />
                  <MTORow
                    mark="R3"
                    desc={`TB longitudinal — ${tbNTop + tbNBot}×${code.bar_label(tbBarDia)}`}
                    qty={String(tbNTop + tbNBot)}
                    unit="kg"
                    amount={mto.tbLongMass.toFixed(1)}
                  />
                  <MTORow
                    mark="R4"
                    desc={`TB stirrups — ${code.bar_label(tbStirrupDia)} @ ${tbStirrupSpc} c/c`}
                    qty={String(Math.ceil(tbSpan / tbStirrupSpc) + 1)}
                    unit="kg"
                    amount={mto.tbStirMass.toFixed(1)}
                  />
                </>
              )}
              <tr style={{ background: '#F5F2EB', fontWeight: 600 }}>
                <td colSpan={3}><span className="mono">TOTAL REBAR</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono">kg</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono">{mto.totalRebar.toFixed(1)}</span></td>
              </tr>
              <tr style={{ background: '#F5F2EB' }}>
                <td colSpan={3}><span className="mono" style={{ fontWeight: 500, color: 'var(--color-ink-3)' }}>kg/m³ ratio</span></td>
                <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ color: 'var(--color-ink-3)' }}>kg/m³</span></td>
                <td className="num" style={{ textAlign: 'right' }}>
                  <span className="mono" style={{ fontWeight: 600 }}>{mto.kgPerM3.toFixed(1)}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// =========================================================================
// HELPER COMPONENTS
// =========================================================================

// ---------------------------------------------------------------------------
// FootingPlanRebar — SVG 360×320 showing bottom mat X+Y, column, dowels,
// tie beam stub when enabled
// ---------------------------------------------------------------------------

function FootingPlanRebar({
  Lx, Ly, colB, colH, cover, dEff,
  xSpacing, ySpacing,
  tbEnabled, tbB,
}: {
  Lx: number; Ly: number; colB: number; colH: number
  cover: number; dEff: number
  xSpacing: number; ySpacing: number
  tbEnabled: boolean; tbB: number
}) {
  const W = 360
  const H = 320
  const pad = 40
  const drawW = W - 2 * pad
  const drawH = H - 2 * pad
  const scale = Math.min(drawW / Lx, drawH / Ly)
  const w = Lx * scale
  const h = Ly * scale
  const x0 = (W - w) / 2
  const y0 = (H - h) / 2
  const cx = x0 + w / 2
  const cy = y0 + h / 2
  const cw = colB * scale
  const ch = colH * scale
  const cvS = cover * scale

  // X-direction bars (horizontal, orange #B06008)
  const xBars: number[] = []
  const nxBars = Math.floor((Ly - 2 * cover) / xSpacing) + 1
  for (let i = 0; i < nxBars; i++) {
    const offset = cover + i * xSpacing
    if (offset <= Ly - cover) xBars.push(y0 + offset * scale)
  }

  // Y-direction bars (vertical, #D4820F)
  const yBars: number[] = []
  const nyBars = Math.floor((Lx - 2 * cover) / ySpacing) + 1
  for (let i = 0; i < nyBars; i++) {
    const offset = cover + i * ySpacing
    if (offset <= Lx - cover) yBars.push(x0 + offset * scale)
  }

  // Column dowels — 4 corner dots
  const dowelR = 2.5
  const dowelInset = 6
  const dowels = [
    [cx - cw / 2 + dowelInset, cy - ch / 2 + dowelInset],
    [cx + cw / 2 - dowelInset, cy - ch / 2 + dowelInset],
    [cx - cw / 2 + dowelInset, cy + ch / 2 - dowelInset],
    [cx + cw / 2 - dowelInset, cy + ch / 2 - dowelInset],
  ]

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Footing outline */}
      <rect x={x0} y={y0} width={w} height={h} fill="#ECEAE4" stroke="#4A4038" strokeWidth={2} />

      {/* Y-direction bars (vertical, drawn first = behind) */}
      {yBars.map((bx, i) => (
        <line key={`y${i}`} x1={bx} y1={y0 + cvS} x2={bx} y2={y0 + h - cvS} stroke="#D4820F" strokeWidth={1.2} opacity={0.75} />
      ))}

      {/* X-direction bars (horizontal, drawn on top) */}
      {xBars.map((by, i) => (
        <line key={`x${i}`} x1={x0 + cvS} y1={by} x2={x0 + w - cvS} y2={by} stroke="#B06008" strokeWidth={1.4} opacity={0.85} />
      ))}

      {/* Column outline */}
      <rect x={cx - cw / 2} y={cy - ch / 2} width={cw} height={ch} fill="#9A9490" stroke="#4A4038" strokeWidth={1.5} />

      {/* Column dowels */}
      {dowels.map(([dx, dy], i) => (
        <circle key={`dw${i}`} cx={dx} cy={dy} r={dowelR} fill="#4A4038" />
      ))}

      {/* Tie beam stub */}
      {tbEnabled && (
        <>
          <rect
            x={cx - (tbB * scale) / 2}
            y={y0 - 12}
            width={tbB * scale}
            height={12}
            fill="#E8F0FC"
            stroke="#1755A0"
            strokeWidth={1}
            strokeDasharray="4 2"
          />
          <rect
            x={cx - (tbB * scale) / 2}
            y={y0 + h}
            width={tbB * scale}
            height={12}
            fill="#E8F0FC"
            stroke="#1755A0"
            strokeWidth={1}
            strokeDasharray="4 2"
          />
        </>
      )}

      {/* Dimension labels */}
      <g fontFamily="IBM Plex Mono" fontSize={9} fill="#6B7079">
        <text x={cx} y={y0 + h + 18} textAnchor="middle">Lx = {Lx} mm</text>
        <text x={x0 - 6} y={cy} textAnchor="end" dominantBaseline="middle" fontSize={8.5}>Ly = {Ly}</text>
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// FootingPressureField — 3D axonometric trapezoidal pressure prism SVG
// ---------------------------------------------------------------------------

function FootingPressureField({
  Lx, Ly, qmax, qmin, qa,
}: {
  Lx: number; Ly: number; qmax: number; qmin: number; qa: number
}) {
  const W = 300
  const H = 240
  // Axonometric view: draw the footing as a parallelogram,
  // then draw pressure arrows underneath
  const padT = 30
  const padB = 50
  const padL = 40
  const padR = 40
  const bodyW = W - padL - padR
  const bodyH = H - padT - padB
  // Iso offsets
  const isoX = bodyW * 0.6
  const isoY = bodyH * 0.35
  const dX = bodyW * 0.3
  const dY = bodyH * 0.3

  // Top-left of the footing quad
  const p0 = { x: padL + dX, y: padT }
  const p1 = { x: padL + dX + isoX, y: padT }
  const p2 = { x: padL + isoX, y: padT + dY }
  const p3 = { x: padL, y: padT + dY }

  // Pressure heights (max at p0 side, min at p1 side)
  const maxH = bodyH * 0.45
  const minH = qmax > 0 ? maxH * Math.max(0, qmin) / qmax : 0
  const qaH = qmax > 0 ? maxH * Math.min(qa / qmax, 1.2) : maxH * 0.8

  // Fill based on pass/fail
  const pressColor = qmax <= qa ? '#E4F2E6' : '#FDE8E8'
  const pressStroke = qmax <= qa ? '#256830' : '#A02020'

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Footing top face */}
      <polygon
        points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`}
        fill="#E8E4DC"
        stroke="#4A4038"
        strokeWidth={1.5}
      />

      {/* Pressure distribution — trapezoidal prism (front face) */}
      <polygon
        points={`${p3.x},${p3.y} ${p2.x},${p2.y} ${p2.x},${p2.y + minH} ${p3.x},${p3.y + maxH}`}
        fill={pressColor}
        stroke={pressStroke}
        strokeWidth={1}
        opacity={0.7}
      />
      {/* Pressure bottom face */}
      <polygon
        points={`${p3.x},${p3.y + maxH} ${p0.x},${p0.y + maxH} ${p1.x},${p1.y + minH} ${p2.x},${p2.y + minH}`}
        fill={pressColor}
        stroke={pressStroke}
        strokeWidth={0.8}
        opacity={0.5}
      />
      {/* Side face (left) */}
      <polygon
        points={`${p3.x},${p3.y} ${p0.x},${p0.y} ${p0.x},${p0.y + maxH} ${p3.x},${p3.y + maxH}`}
        fill={pressColor}
        stroke={pressStroke}
        strokeWidth={0.8}
        opacity={0.6}
      />

      {/* qa reference line */}
      <line
        x1={p3.x - 8} y1={p3.y + qaH}
        x2={p2.x + 8} y2={p2.y + qaH}
        stroke="#1755A0" strokeWidth={1} strokeDasharray="4 3"
      />

      {/* Labels */}
      <g fontFamily="IBM Plex Mono" fontSize={9.5}>
        <text x={p3.x - 10} y={p3.y + maxH + 4} textAnchor="end" fill={pressStroke} fontWeight={600}>
          qmax = {qmax.toFixed(1)}
        </text>
        <text x={p2.x + 10} y={p2.y + minH + 4} fill={pressStroke}>
          qmin = {qmin.toFixed(1)}
        </text>
        <text x={p3.x - 10} y={p3.y + qaH + 4} textAnchor="end" fill="#1755A0">
          qa = {qa.toFixed(1)}
        </text>
        <text x={(p0.x + p1.x) / 2} y={p0.y - 8} textAnchor="middle" fill="#6B7079" fontSize={9}>
          {Lx} × {Ly} mm
        </text>
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// FootingPunchPerimeter — plan SVG showing column, d/2 perimeter (dashed red),
// hatched loaded area
// ---------------------------------------------------------------------------

function FootingPunchPerimeter({
  Lx, Ly, colB, colH, dEff, dFactor,
}: {
  Lx: number; Ly: number; colB: number; colH: number
  dEff: number; dFactor: number
}) {
  const W = 280
  const H = 240
  const pad = 30
  const drawW = W - 2 * pad
  const drawH = H - 2 * pad
  const scale = Math.min(drawW / Lx, drawH / Ly)
  const w = Lx * scale
  const h = Ly * scale
  const x0 = (W - w) / 2
  const y0 = (H - h) / 2
  const cx = x0 + w / 2
  const cy = y0 + h / 2
  const cw = colB * scale
  const ch = colH * scale
  const inset = dEff * dFactor * scale

  // Hatch pattern ID
  const hatchId = 'ftg-punch-hatch'

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#A02020" strokeWidth={0.5} opacity={0.35} />
        </pattern>
      </defs>

      {/* Footing outline */}
      <rect x={x0} y={y0} width={w} height={h} fill="#ECEAE4" stroke="#4A4038" strokeWidth={2} />

      {/* Loaded area (hatched — area between footing edge and punching perimeter) */}
      {/* Outer minus inner approach — draw hatched over entire footing, then cover inner with solid */}
      <rect x={x0} y={y0} width={w} height={h} fill={`url(#${hatchId})`} />
      <rect
        x={cx - cw / 2 - inset}
        y={cy - ch / 2 - inset}
        width={cw + 2 * inset}
        height={ch + 2 * inset}
        fill="#ECEAE4"
      />

      {/* Punching perimeter (dashed red) */}
      <rect
        x={cx - cw / 2 - inset}
        y={cy - ch / 2 - inset}
        width={cw + 2 * inset}
        height={ch + 2 * inset}
        fill="none"
        stroke="#A02020"
        strokeWidth={1.5}
        strokeDasharray="5 3"
      />

      {/* Column */}
      <rect x={cx - cw / 2} y={cy - ch / 2} width={cw} height={ch} fill="#9A9490" stroke="#4A4038" strokeWidth={1.5} />

      {/* Labels */}
      <g fontFamily="IBM Plex Mono" fontSize={8.5} fill="#6B7079">
        <text x={cx} y={cy - ch / 2 - inset - 6} textAnchor="middle" fill="#A02020" fontSize={9}>
          d/{(1 / dFactor).toFixed(0)} perimeter
        </text>
        <text x={cx} y={cy + 2} textAnchor="middle" fill="#4A4038" fontSize={8}>
          {colB}×{colH}
        </text>
        <text x={cx} y={y0 + h + 15} textAnchor="middle">
          bo = {(2 * (colB + 2 * dEff * dFactor) + 2 * (colH + 2 * dEff * dFactor)).toFixed(0)} mm
        </text>
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// FootingOneWayDiag — plan SVG showing critical sections at d from column face
// ---------------------------------------------------------------------------

function FootingOneWayDiag({
  Lx, Ly, colB, colH, dEff,
}: {
  Lx: number; Ly: number; colB: number; colH: number; dEff: number
}) {
  const W = 280
  const H = 240
  const pad = 30
  const drawW = W - 2 * pad
  const drawH = H - 2 * pad
  const scale = Math.min(drawW / Lx, drawH / Ly)
  const w = Lx * scale
  const h = Ly * scale
  const x0 = (W - w) / 2
  const y0 = (H - h) / 2
  const cx = x0 + w / 2
  const cy = y0 + h / 2
  const cw = colB * scale
  const ch = colH * scale
  const dS = dEff * scale

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Footing outline */}
      <rect x={x0} y={y0} width={w} height={h} fill="#ECEAE4" stroke="#4A4038" strokeWidth={2} />

      {/* Column */}
      <rect x={cx - cw / 2} y={cy - ch / 2} width={cw} height={ch} fill="#9A9490" stroke="#4A4038" strokeWidth={1.5} />

      {/* Critical section X (vertical lines at d from column face in X-dir) */}
      <line
        x1={cx - cw / 2 - dS} y1={y0 + 2}
        x2={cx - cw / 2 - dS} y2={y0 + h - 2}
        stroke="#A02020" strokeWidth={1.5} strokeDasharray="4 3"
      />
      <line
        x1={cx + cw / 2 + dS} y1={y0 + 2}
        x2={cx + cw / 2 + dS} y2={y0 + h - 2}
        stroke="#A02020" strokeWidth={1.5} strokeDasharray="4 3"
      />

      {/* Critical section Y (horizontal lines at d from column face in Y-dir) */}
      <line
        x1={x0 + 2} y1={cy - ch / 2 - dS}
        x2={x0 + w - 2} y2={cy - ch / 2 - dS}
        stroke="#1755A0" strokeWidth={1.2} strokeDasharray="4 3"
      />
      <line
        x1={x0 + 2} y1={cy + ch / 2 + dS}
        x2={x0 + w - 2} y2={cy + ch / 2 + dS}
        stroke="#1755A0" strokeWidth={1.2} strokeDasharray="4 3"
      />

      {/* Hatched shear zones (left and right of X-critical) */}
      <rect x={x0} y={y0} width={cx - cw / 2 - dS - x0} height={h} fill="#FDE8E8" opacity={0.35} />
      <rect x={cx + cw / 2 + dS} y={y0} width={x0 + w - (cx + cw / 2 + dS)} height={h} fill="#FDE8E8" opacity={0.35} />

      {/* Hatched shear zones (top and bottom of Y-critical) */}
      <rect x={x0} y={y0} width={w} height={cy - ch / 2 - dS - y0} fill="#E8F0FC" opacity={0.25} />
      <rect x={x0} y={cy + ch / 2 + dS} width={w} height={y0 + h - (cy + ch / 2 + dS)} fill="#E8F0FC" opacity={0.25} />

      {/* Labels */}
      <g fontFamily="IBM Plex Mono" fontSize={8.5} fill="#6B7079">
        <text x={cx - cw / 2 - dS / 2} y={y0 - 4} textAnchor="middle" fill="#A02020" fontSize={8}>d</text>
        <text x={cx + cw / 2 + dS / 2} y={y0 - 4} textAnchor="middle" fill="#A02020" fontSize={8}>d</text>
        <text x={x0 - 4} y={cy - ch / 2 - dS / 2} textAnchor="end" dominantBaseline="middle" fill="#1755A0" fontSize={8}>d</text>
        <text x={cx} y={y0 + h + 15} textAnchor="middle" fill="#A02020">
          X: a = {((Lx - colB) / 2 - dEff).toFixed(0)} mm
        </text>
        <text x={cx} y={y0 + h + 27} textAnchor="middle" fill="#1755A0">
          Y: a = {((Ly - colH) / 2 - dEff).toFixed(0)} mm
        </text>
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// FootingFullPlan — 540×380 SVG with rebar, column, section markers, tie beam
// ---------------------------------------------------------------------------

function FootingFullPlan({
  Lx, Ly, colB, colH, cover, dEff,
  xDia, xSpacing, yDia, ySpacing,
  tbEnabled, tbB, code,
}: {
  Lx: number; Ly: number; colB: number; colH: number
  cover: number; dEff: number
  xDia: number; xSpacing: number; yDia: number; ySpacing: number
  tbEnabled: boolean; tbB: number
  code: { bar_label: (d: number) => string }
}) {
  const W = 540
  const H = 380
  const pad = 50
  const drawW = W - 2 * pad
  const drawH = H - 2 * pad
  const scale = Math.min(drawW / Lx, drawH / Ly)
  const w = Lx * scale
  const h = Ly * scale
  const x0 = (W - w) / 2
  const y0 = (H - h) / 2
  const cx = x0 + w / 2
  const cy = y0 + h / 2
  const cw = colB * scale
  const ch = colH * scale
  const cvS = cover * scale

  // X bars
  const nxBars = Math.floor((Ly - 2 * cover) / xSpacing) + 1
  const xBarYs: number[] = []
  for (let i = 0; i < nxBars; i++) {
    const off = cover + i * xSpacing
    if (off <= Ly - cover) xBarYs.push(y0 + off * scale)
  }

  // Y bars
  const nyBars = Math.floor((Lx - 2 * cover) / ySpacing) + 1
  const yBarXs: number[] = []
  for (let i = 0; i < nyBars; i++) {
    const off = cover + i * ySpacing
    if (off <= Lx - cover) yBarXs.push(x0 + off * scale)
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Footing outline */}
      <rect x={x0} y={y0} width={w} height={h} fill="#ECEAE4" stroke="#4A4038" strokeWidth={2.5} />

      {/* Y-direction bars */}
      {yBarXs.map((bx, i) => (
        <line key={`yp${i}`} x1={bx} y1={y0 + cvS} x2={bx} y2={y0 + h - cvS} stroke="#D4820F" strokeWidth={1} opacity={0.6} />
      ))}

      {/* X-direction bars */}
      {xBarYs.map((by, i) => (
        <line key={`xp${i}`} x1={x0 + cvS} y1={by} x2={x0 + w - cvS} y2={by} stroke="#B06008" strokeWidth={1.2} opacity={0.7} />
      ))}

      {/* Column */}
      <rect x={cx - cw / 2} y={cy - ch / 2} width={cw} height={ch} fill="#9A9490" stroke="#4A4038" strokeWidth={1.5} />

      {/* Tie beam stubs */}
      {tbEnabled && (
        <>
          <rect x={cx - (tbB * scale) / 2} y={y0 - 18} width={tbB * scale} height={18} fill="#E8F0FC" stroke="#1755A0" strokeWidth={1} strokeDasharray="4 2" />
          <rect x={cx - (tbB * scale) / 2} y={y0 + h} width={tbB * scale} height={18} fill="#E8F0FC" stroke="#1755A0" strokeWidth={1} strokeDasharray="4 2" />
          <text x={cx} y={y0 - 22} textAnchor="middle" fontFamily="IBM Plex Mono" fontSize={8} fill="#1755A0">TB</text>
        </>
      )}

      {/* Section markers */}
      {/* A-A: horizontal cut through center */}
      <line x1={x0 - 16} y1={cy} x2={x0 - 6} y2={cy} stroke="#4A4038" strokeWidth={1.5} />
      <line x1={x0 + w + 6} y1={cy} x2={x0 + w + 16} y2={cy} stroke="#4A4038" strokeWidth={1.5} />
      <text x={x0 - 20} y={cy + 4} textAnchor="end" fontFamily="IBM Plex Mono" fontSize={10} fontWeight={700} fill="#4A4038">A</text>
      <text x={x0 + w + 20} y={cy + 4} fontFamily="IBM Plex Mono" fontSize={10} fontWeight={700} fill="#4A4038">A</text>

      {/* B-B: vertical cut through center */}
      <line x1={cx} y1={y0 - 16} x2={cx} y2={y0 - 6} stroke="#4A4038" strokeWidth={1.5} />
      <line x1={cx} y1={y0 + h + 6} x2={cx} y2={y0 + h + 16} stroke="#4A4038" strokeWidth={1.5} />
      <text x={cx} y={y0 - 20} textAnchor="middle" fontFamily="IBM Plex Mono" fontSize={10} fontWeight={700} fill="#4A4038">B</text>
      <text x={cx} y={y0 + h + 26} textAnchor="middle" fontFamily="IBM Plex Mono" fontSize={10} fontWeight={700} fill="#4A4038">B</text>

      {/* Dimensions */}
      <g fontFamily="IBM Plex Mono" fontSize={9} fill="#9A9490">
        {/* Lx dimension — bottom */}
        <line x1={x0} y1={y0 + h + 32} x2={x0 + w} y2={y0 + h + 32} stroke="#9A9490" strokeWidth={0.7} />
        <line x1={x0} y1={y0 + h + 29} x2={x0} y2={y0 + h + 35} stroke="#9A9490" strokeWidth={0.7} />
        <line x1={x0 + w} y1={y0 + h + 29} x2={x0 + w} y2={y0 + h + 35} stroke="#9A9490" strokeWidth={0.7} />
        <text x={cx} y={y0 + h + 44} textAnchor="middle">{Lx} mm</text>

        {/* Ly dimension — left */}
        <line x1={x0 - 28} y1={y0} x2={x0 - 28} y2={y0 + h} stroke="#9A9490" strokeWidth={0.7} />
        <line x1={x0 - 31} y1={y0} x2={x0 - 25} y2={y0} stroke="#9A9490" strokeWidth={0.7} />
        <line x1={x0 - 31} y1={y0 + h} x2={x0 - 25} y2={y0 + h} stroke="#9A9490" strokeWidth={0.7} />
        <text x={x0 - 32} y={cy + 4} textAnchor="end" dominantBaseline="middle" fontSize={8.5}>{Ly}</text>
      </g>

      {/* Rebar label */}
      <g fontFamily="IBM Plex Mono" fontSize={8} fill="#B06008">
        <text x={x0 + w - 6} y={y0 + 12} textAnchor="end">
          X: {code.bar_label(xDia)}@{xSpacing}
        </text>
        <text x={x0 + w - 6} y={y0 + 22} textAnchor="end" fill="#D4820F">
          Y: {code.bar_label(yDia)}@{ySpacing}
        </text>
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// FootingSectionView — Section A-A or B-B
// ---------------------------------------------------------------------------

function FootingSectionView({
  dir, Lspan, depth, cover,
  colDim, colPerp, dEff,
  barDia, barSpacing,
  tbEnabled, tbB, tbH, code,
}: {
  dir: string
  Lspan: number; depth: number; cover: number
  colDim: number; colPerp: number
  dEff: number
  barDia: number; barSpacing: number
  tbEnabled: boolean; tbB: number; tbH: number
  code: { bar_label: (d: number) => string }
}) {
  const W = 420
  const H = 160
  const padL = 40
  const padR = 40
  const padT = 30
  const padB = 30
  const drawW = W - padL - padR
  const drawH = H - padT - padB
  const scaleX = drawW / Lspan
  const scaleY = drawH / Math.max(depth, 1)
  const sc = Math.min(scaleX, scaleY)

  const fw = Lspan * sc
  const fh = depth * sc
  const fx = (W - fw) / 2
  const fy = padT
  const cw = colDim * sc
  const colAboveH = Math.min(60, fh * 0.8)

  // Number of bottom bars shown
  const nBars = Math.floor((Lspan - 2 * cover) / barSpacing) + 1
  const barR = Math.max(2, barDia * sc / 2)
  const barY = fy + fh - cover * sc

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ink)', fontFamily: 'IBM Plex Mono' }}>
        Section {dir}
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* Footing body */}
        <rect x={fx} y={fy} width={fw} height={fh} fill="#E8E4DC" stroke="#4A4038" strokeWidth={2.5} />

        {/* Column above */}
        <rect
          x={fx + fw / 2 - cw / 2}
          y={fy - colAboveH}
          width={cw}
          height={colAboveH}
          fill="#D0CCC6"
          stroke="#4A4038"
          strokeWidth={1.5}
        />

        {/* Dowels from column into footing */}
        {[0.3, 0.7].map((frac, i) => {
          const dx = fx + fw / 2 - cw / 2 + cw * frac
          const hookLen = Math.min(12, fh * 0.4)
          return (
            <g key={`dw${i}`}>
              <line x1={dx} y1={fy - colAboveH * 0.5} x2={dx} y2={fy + fh - cover * sc - hookLen} stroke="#4A4038" strokeWidth={1.5} />
              {/* Hook */}
              <line x1={dx} y1={fy + fh - cover * sc - hookLen} x2={dx + 8} y2={fy + fh - cover * sc} stroke="#4A4038" strokeWidth={1.5} />
            </g>
          )
        })}

        {/* Bottom bars */}
        {Array.from({ length: Math.min(nBars, 30) }).map((_, i) => {
          const bx = fx + cover * sc + i * barSpacing * sc
          if (bx > fx + fw - cover * sc) return null
          return (
            <circle key={`bar${i}`} cx={bx} cy={barY} r={barR} fill="#B06008" stroke="#8B5000" strokeWidth={0.8} />
          )
        })}

        {/* Tie beam "beyond" indicator */}
        {tbEnabled && (
          <>
            <rect
              x={fx + fw / 2 - (tbB * sc) / 2}
              y={fy - colAboveH}
              width={tbB * sc}
              height={Math.min(tbH * sc, colAboveH + fh * 0.3)}
              fill="none"
              stroke="#1755A0"
              strokeWidth={1}
              strokeDasharray="4 2"
            />
            <text
              x={fx + fw / 2 + (tbB * sc) / 2 + 6}
              y={fy - colAboveH / 2 + 4}
              fontFamily="IBM Plex Mono"
              fontSize={7.5}
              fill="#1755A0"
            >
              TB beyond
            </text>
          </>
        )}

        {/* Dimension line — Lspan */}
        <g fontFamily="IBM Plex Mono" fontSize={8.5} fill="#9A9490">
          <line x1={fx} y1={fy + fh + 10} x2={fx + fw} y2={fy + fh + 10} stroke="#9A9490" strokeWidth={0.7} />
          <line x1={fx} y1={fy + fh + 7} x2={fx} y2={fy + fh + 13} stroke="#9A9490" strokeWidth={0.7} />
          <line x1={fx + fw} y1={fy + fh + 7} x2={fx + fw} y2={fy + fh + 13} stroke="#9A9490" strokeWidth={0.7} />
          <text x={fx + fw / 2} y={fy + fh + 22} textAnchor="middle">{Lspan} mm</text>
        </g>

        {/* Depth dimension */}
        <g fontFamily="IBM Plex Mono" fontSize={8} fill="#9A9490">
          <line x1={fx - 8} y1={fy} x2={fx - 8} y2={fy + fh} stroke="#9A9490" strokeWidth={0.7} />
          <text x={fx - 12} y={fy + fh / 2 + 3} textAnchor="end">{depth}</text>
        </g>

        {/* Bar label */}
        <text x={fx + fw - 4} y={barY + 4} textAnchor="end" fontFamily="IBM Plex Mono" fontSize={7.5} fill="#B06008">
          {code.bar_label(barDia)}@{barSpacing}
        </text>
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CalcGroupF / CalcRowF — calculation breakdown row pattern
// ---------------------------------------------------------------------------

function CalcGroupF({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr 100px 60px',
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
        <span>Expression · Note</span>
        <span style={{ textAlign: 'right' }}>Value</span>
        <span style={{ textAlign: 'right' }}>Unit</span>
      </div>
      {children}
    </div>
  )
}

function CalcRowF({
  name,
  expr,
  val,
  unit,
  note,
  pass,
  fail,
  emph,
  engine,
}: {
  name: string
  expr: string
  val: string
  unit: string
  note?: string
  pass?: boolean
  fail?: boolean
  emph?: boolean
  engine?: boolean
}) {
  const bg = pass ? '#F1F8F0' : fail ? '#FBEFEC' : emph ? '#FEF9EE' : 'transparent'
  const accent = pass ? '#3F7A2E' : fail ? '#A12424' : emph ? '#8A6112' : 'var(--color-ink-2)'
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr 100px 60px',
        padding: '7px 12px',
        borderBottom: '1px solid var(--color-line-2)',
        background: bg,
        alignItems: 'baseline',
        gap: 8,
      }}
    >
      <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink)' }}>
        {name}
        {engine && (
          <span style={{
            marginLeft: 4, fontSize: 8, padding: '1px 3px', borderRadius: 2,
            background: 'var(--color-sel-bg)', color: 'var(--color-sel)',
            fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase',
          }}>
            engine
          </span>
        )}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        {expr && (
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {expr}
          </span>
        )}
        {note && (
          <span style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>{note}</span>
        )}
      </div>
      <span className="mono" style={{ fontSize: 12, fontWeight: 700, textAlign: 'right', color: accent }}>
        {val}
      </span>
      <span className="mono" style={{ fontSize: 10.5, textAlign: 'right', color: 'var(--color-ink-4)' }}>
        {unit}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MTORow — material take-off table row
// ---------------------------------------------------------------------------

function MTORow({
  mark, desc, qty, unit, amount,
}: {
  mark: string; desc: string; qty: string; unit: string; amount: string
}) {
  return (
    <tr>
      <td><span className="mono" style={{ fontWeight: 700, color: 'var(--color-ink)' }}>{mark}</span></td>
      <td style={{ color: 'var(--color-ink-2)' }}>{desc}</td>
      <td className="num" style={{ textAlign: 'right' }}><span className="mono">{qty}</span></td>
      <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ color: 'var(--color-ink-3)' }}>{unit}</span></td>
      <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ fontWeight: 600 }}>{amount}</span></td>
    </tr>
  )
}

function MTOSummaryCell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ padding: '8px 12px', borderRight: '1px solid var(--color-line-2)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="sub-label">{label}</span>
      <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{value}</span>
      <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>{sub}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DSRow — development & splice row
// ---------------------------------------------------------------------------

function DSRow({
  label, value, pass,
}: {
  label: string; value: string; pass?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, padding: '3px 0', borderBottom: '1px solid var(--color-line-2)' }}>
      <span style={{ color: 'var(--color-ink-3)' }}>{label}</span>
      <span className="mono" style={{
        fontWeight: 600,
        color: pass === true ? 'var(--color-pass)' : pass === false ? 'var(--color-fail)' : 'var(--color-ink)',
      }}>
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small helper components
// ---------------------------------------------------------------------------

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ width: 7, height: 7, background: color, borderRadius: '50%' }} />
      {label}
    </span>
  )
}

function StepRow({
  k, v, accent, pass,
}: {
  k: string; v: string; accent?: boolean; pass?: boolean
}) {
  return (
    <div className="step-row" style={{ gap: 6, display: 'flex', justifyContent: 'space-between' }}>
      <span className="k" style={{ minWidth: 60, fontSize: 10.5, color: 'var(--color-ink-3)' }}>{k}</span>
      <span className="v mono" style={{
        fontSize: 10.5,
        fontWeight: accent || pass !== undefined ? 600 : 400,
        color: pass === true ? 'var(--color-pass)' : pass === false ? 'var(--color-fail)' : accent ? 'var(--color-sel)' : 'var(--color-ink)',
      }}>
        {v}
      </span>
    </div>
  )
}

function RebarGroupBlock({
  title, color, hint, children,
}: {
  title: string; color?: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="rebar-block">
      <div className="rh">
        {color && <span style={{ width: 8, height: 8, background: color, borderRadius: '50%' }} />}
        {title}
        {hint && (
          <span style={{ marginLeft: 6, color: 'var(--color-ink-4)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
            · {hint}
          </span>
        )}
      </div>
      <div className="rb" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {children}
      </div>
    </div>
  )
}

function RebarSelect({
  label, value, opts, onChange, code, unit,
}: {
  label: string
  value: number
  opts: readonly number[]
  onChange: (v: number) => void
  code?: { bar_label: (d: number) => string }
  unit?: string
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>{label}</span>
      <select
        className="select"
        value={value}
        onChange={e => onChange(Number.parseInt(e.target.value, 10))}
        style={{ height: 22, fontSize: 11 }}
      >
        {opts.map(o => (
          <option key={o} value={o}>
            {code ? code.bar_label(o) : `${o}${unit ? ` ${unit}` : ''}`}
          </option>
        ))}
      </select>
    </div>
  )
}

function RebarCalcLine({
  label, value, pass,
}: {
  label: string; value: string; pass?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, padding: '1px 0' }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>{label}</span>
      <span className="mono" style={{
        fontSize: 10.5,
        fontWeight: 600,
        color: pass === true ? 'var(--color-pass)' : pass === false ? 'var(--color-fail)' : 'var(--color-ink-2)',
      }}>
        {value}
      </span>
    </div>
  )
}

function TbCountRow({
  label, count, setCount,
}: {
  label: string; count: number; setCount: (n: number) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          type="button"
          onClick={() => setCount(Math.max(2, count - 1))}
          style={{
            width: 20, height: 20, border: '1px solid var(--color-line-3)',
            borderRadius: 3, cursor: 'pointer', fontSize: 12,
            background: 'var(--color-panel)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          -
        </button>
        <span className="mono" style={{ fontSize: 11, fontWeight: 600, minWidth: 16, textAlign: 'center' }}>{count}</span>
        <button
          type="button"
          onClick={() => setCount(Math.min(8, count + 1))}
          style={{
            width: 20, height: 20, border: '1px solid var(--color-line-3)',
            borderRadius: 3, cursor: 'pointer', fontSize: 12,
            background: 'var(--color-panel)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          +
        </button>
      </div>
    </div>
  )
}

function TbInputRow({
  label, value, onChange, unit,
}: {
  label: string; value: number; onChange: (v: number) => void; unit: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '1px 0' }}>
      <span style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, border: '1px solid var(--color-line-3)', borderRadius: 3, padding: '0 4px', background: 'var(--color-panel)', height: 20 }}>
        <input
          type="number"
          value={value}
          onChange={e => {
            const n = Number.parseInt(e.target.value, 10)
            if (Number.isFinite(n) && n > 0) onChange(n)
          }}
          style={{
            width: 56, border: 0, outline: 0, fontFamily: 'var(--font-mono)',
            fontSize: 10.5, background: 'transparent', padding: 0,
          }}
        />
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--color-ink-4)' }}>{unit}</span>
      </div>
    </div>
  )
}
