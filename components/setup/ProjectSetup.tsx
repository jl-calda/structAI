'use client'

import { useState, useTransition } from 'react'

import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'

import {
  setProjectCodeStandardAction,
  updateProjectDefaultsAction,
} from '@/app/actions/projects'
import {
  generateCombinationsAction,
  recomputeEnvelopeAction,
} from '@/app/actions/loads'
import { Icon } from '@/components/ui/Icon'
import {
  PropCalcRow,
  PropGroup,
  PropInputRow,
  PropSelectRow,
  PropStaticRow,
} from '@/components/ui/PropRow'
import type { CodeStandard } from '@/lib/supabase/types'

type EnvelopeAxis = { value: number; member: number | null; combo: number | null }
type Envelope = { mpos: EnvelopeAxis; mneg: EnvelopeAxis; vu: EnvelopeAxis }
type TemplateOption = { id: string; name: string; combinations: number }

export type ProjectSetupProps = {
  projectId: string
  project: {
    name: string
    description: string | null
    client: string | null
    location: string | null
    code_standard: CodeStandard
    default_fc_mpa: number
    default_fy_mpa: number
    default_fys_mpa: number
    default_clear_cover_mm: number
    default_density_kn_m3: number
    seismic_zone: string
    exposure_class: string
    aggregate_type: string
    lightweight_lambda: number
    engineer_name: string
  }
  templates: TemplateOption[]
  loadCaseCount: number
  comboCount: number
  envelopeSummary: Envelope
}

const CODES: { value: CodeStandard; label: string }[] = [
  { value: 'NSCP_2015', label: 'NSCP 2015' },
  { value: 'ACI_318_19', label: 'ACI 318-19' },
  { value: 'EC2_2004', label: 'EC2 2004' },
  { value: 'AS_3600_2018', label: 'AS 3600-2018' },
  { value: 'CSA_A23_3_19', label: 'CSA A23.3-19' },
]

export function ProjectSetup({
  projectId,
  project: p,
  templates,
  loadCaseCount,
  comboCount,
  envelopeSummary,
}: ProjectSetupProps) {
  const [tab, setTab] = useState<'identity' | 'materials' | 'loads' | 'combos'>('identity')
  const [saving, startSave] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  const [name, setName] = useState(p.name)
  const [client, setClient] = useState(p.client ?? '')
  const [location, setLocation] = useState(p.location ?? '')
  const [engineer, setEngineer] = useState(p.engineer_name)
  const [description, setDescription] = useState(p.description ?? '')
  const [code, setCode] = useState<CodeStandard>(p.code_standard)

  const [fc, setFc] = useState(p.default_fc_mpa)
  const [fy, setFy] = useState(p.default_fy_mpa)
  const [fys, setFys] = useState(p.default_fys_mpa)
  const [cover, setCover] = useState(p.default_clear_cover_mm)
  const [density, setDensity] = useState(p.default_density_kn_m3)
  const [aggregate, setAggregate] = useState(p.aggregate_type)
  const [lambda, setLambda] = useState(p.lightweight_lambda)
  const [exposure, setExposure] = useState(p.exposure_class)
  const [seismicZone, setSeismicZone] = useState(p.seismic_zone)

  // Basic loads (not persisted yet — client-side for display)
  const [wDead, setWDead] = useState(0)
  const [wLive, setWLive] = useState(0)
  const [wRoofLive, setWRoofLive] = useState(0)
  const [windSpeed, setWindSpeed] = useState(200)
  const [windExposure, setWindExposure] = useState('B')
  const [soilProfile, setSoilProfile] = useState('SD')
  const [importance, setImportance] = useState(1.0)
  const [rFactor, setRFactor] = useState(8.5)
  const [frameType, setFrameType] = useState('SMRF')

  const codeProvider = getCode(code)
  const beta1 = codeProvider.stress_block_depth_factor(fc)
  const Ec = Math.round(4700 * Math.sqrt(fc))
  const fr = (0.62 * lambda * Math.sqrt(fc)).toFixed(2)

  const save = () => {
    startSave(async () => {
      const result = await updateProjectDefaultsAction(projectId, {
        name, description: description || null, client: client || null, location: location || null,
        default_fc_mpa: fc, default_fy_mpa: fy, default_fys_mpa: fys,
        default_clear_cover_mm: cover, default_density_kn_m3: density,
        seismic_zone: seismicZone, exposure_class: exposure,
        aggregate_type: aggregate, lightweight_lambda: lambda, engineer_name: engineer,
      })
      flash(result.ok ? 'Saved.' : `Error: ${result.error}`)
    })
  }

  const changeCode = (next: CodeStandard) => {
    setCode(next)
    startSave(async () => {
      const result = await setProjectCodeStandardAction(projectId, next)
      flash(result.ok ? `Code standard set to ${next.replace(/_/g, ' ')}.` : `Error: ${result.error}`)
    })
  }

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const TABS = [
    { id: 'identity' as const, label: 'Identity & Code' },
    { id: 'materials' as const, label: 'Materials & Cover' },
    { id: 'loads' as const, label: 'Basic Loads' },
    { id: 'combos' as const, label: 'Load Combinations' },
  ]

  // Seismic coefficients (NSCP 2015 / ASCE 7 simplified)
  const Z = seismicZone === 'Zone_4' ? 0.40 : seismicZone === 'Zone_3' ? 0.30 : seismicZone === 'Zone_2' ? 0.20 : 0.08
  const Cv = Z * 1.2 // simplified
  const Ca = Z * 1.0
  const Cs = (Cv / rFactor).toFixed(4)
  const CsMin = (0.11 * Ca * importance).toFixed(4)

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Project Setup</span>
        <span className="mono" style={{ color: 'var(--color-ink-3)', fontSize: 11.5 }}>
          {code.replace(/_/g, ' ')} · defaults for all new designs
        </span>
        <div className="spacer" />
        <button type="button" className="btn sm primary" onClick={save} disabled={saving}>
          <Icon name="save" size={12} /> {saving ? 'Saving…' : 'Save all'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 0, background: 'var(--color-bg)', borderRadius: 4, padding: 2, border: '1px solid var(--color-line-2)', alignSelf: 'flex-start' }}>
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            style={{ padding: '4px 14px', fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', border: 0, borderRadius: 3, cursor: 'pointer', background: tab === t.id ? 'var(--color-ink)' : 'transparent', color: tab === t.id ? '#fff' : 'var(--color-ink-3)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB 1: Identity & Code ═══ */}
      {tab === 'identity' && (
        <>
          <div className="card">
            <div className="card-h"><span className="num-badge">1</span><span className="label">Project Identity</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">name · client · location · engineer</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="1.1 · General">
                <PropInputRow label="Name" value={name as unknown as number} onChange={v => setName(String(v))} desc="project name" />
                <PropInputRow label="Client" value={client as unknown as number} onChange={v => setClient(String(v))} desc="client / owner" />
                <PropInputRow label="Location" value={location as unknown as number} onChange={v => setLocation(String(v))} desc="site location" />
                <PropInputRow label="Engineer" value={engineer as unknown as number} onChange={v => setEngineer(String(v))} desc="project engineer" />
              </PropGroup>
              <PropGroup title="1.2 · Description" border>
                <textarea className="input" value={description} onChange={e => setDescription(e.target.value)} onBlur={save} rows={5}
                  style={{ width: '100%', resize: 'vertical', height: 'auto', fontFamily: 'var(--font-sans)', fontSize: 11, padding: '6px 8px' }} placeholder="Project scope, notes…" />
              </PropGroup>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><span className="num-badge">2</span><span className="label">Code Standard</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">design code · reduction factors · stress block</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="2.1 · Active Code">
                <div className="prop-row"><span className="k">Standard</span>
                  <select className="select" value={code} onChange={e => changeCode(e.target.value as CodeStandard)} style={{ height: 24, fontSize: 11.5, width: 200 }}>
                    {CODES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <PropStaticRow label="Rebar std" value={code === 'ACI_318_19' ? 'ASTM A615 (imperial #N)' : 'PNS 49 / ASTM A615M (metric Ø)'} />
                <PropStaticRow label="Bar sizes" value={codeProvider.bar_dias_long.map(d => codeProvider.bar_label(d)).join(', ')} />
                <div style={{ fontSize: 10, color: 'var(--color-warn)', padding: '4px 0', marginTop: 4 }}>Changing the code standard affects all new designs. Existing designs retain their original code.</div>
              </PropGroup>
              <PropGroup title="2.2 · Code Constants" border>
                <PropCalcRow label="β1" value={beta1.toFixed(3)} unit="—" formula={`stress_block_depth_factor(${fc})`} expr={`at fc'=${fc} MPa`} />
                <PropStaticRow label="εcu" value={code === 'EC2_2004' || code === 'CSA_A23_3_19' ? '0.0035' : '0.003'} unit="—" desc="ultimate concrete strain" />
                <PropStaticRow label="φ flexure" value="0.90" unit="—" desc="ACI/NSCP" />
                <PropStaticRow label="φ shear" value="0.75" unit="—" desc="ACI/NSCP" />
                <PropStaticRow label="Vc type" value={code === 'CSA_A23_3_19' ? 'MCFT (needs Mu)' : 'Simplified'} />
                <PropCalcRow label="punch d" value={codeProvider.punching_d_factor().toFixed(1)} unit="×d" formula="punching_d_factor()" expr={code === 'EC2_2004' ? '2d (EC2)' : 'd/2 (ACI/NSCP)'} />
              </PropGroup>
            </div>
          </div>
        </>
      )}

      {/* ═══ TAB 2: Materials & Cover ═══ */}
      {tab === 'materials' && (
        <>
          <div className="card">
            <div className="card-h"><span className="num-badge">3</span><span className="label">Concrete Defaults</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">fc' · γc · aggregate · λ · computed Ec, fr</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="3.1 · Strength & Density">
                <PropInputRow label="fc'" unit="MPa" value={fc} onChange={setFc} desc="compressive strength" />
                <PropInputRow label="γc" unit="kN/m³" value={density} onChange={setDensity} desc="unit weight" />
                <PropSelectRow label="Aggregate" value={aggregate} opts={['Normal', 'Lightweight', 'Sand-Lt']} onChange={setAggregate} />
                <PropInputRow label="λ" unit="—" value={lambda} onChange={setLambda} desc="lightweight factor" />
              </PropGroup>
              <PropGroup title="3.2 · Derived Values" border>
                <PropCalcRow label="Ec" value={`${Ec}`} unit="MPa" formula="Ec = 4700·√fc'" expr={`= 4700·√${fc}`} />
                <PropCalcRow label="β1" value={beta1.toFixed(3)} unit="—" formula="code.stress_block_depth_factor(fc')" expr={`fc' = ${fc} MPa`} />
                <PropCalcRow label="fr" value={fr} unit="MPa" formula="fr = 0.62·λ·√fc'" expr={`= 0.62·${lambda}·√${fc}`} />
                <PropStaticRow label="εcu" value="0.003" unit="—" />
              </PropGroup>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><span className="num-badge">4</span><span className="label">Steel Defaults</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">fy · fys · Es · grade</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="4.1 · Yield Strengths">
                <PropInputRow label="fy" unit="MPa" value={fy} onChange={setFy} desc="longitudinal bar" />
                <PropInputRow label="fys" unit="MPa" value={fys} onChange={setFys} desc="stirrup / tie" />
                <PropStaticRow label="Es" value="200 000" unit="MPa" desc="modulus of elasticity" />
              </PropGroup>
              <PropGroup title="4.2 · Grade" border>
                <PropSelectRow label="Grade" value={gradeFromFy(fy)} opts={['Gr275', 'Gr415', 'Gr420', 'Gr500', 'Gr550', 'Gr690']} onChange={v => setFy(fyFromGrade(v))} />
                <PropStaticRow label="ρ temp" value={codeProvider.rho_temp(fy).toFixed(4)} unit="—" desc="temperature steel ratio" />
              </PropGroup>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><span className="num-badge">5</span><span className="label">Cover &amp; Durability</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">clear cover · exposure class</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="5.1 · Cover">
                <PropInputRow label="Cover" unit="mm" value={cover} onChange={setCover} desc="default clear cover" />
                <PropSelectRow label="Exposure" value={exposure} opts={['Interior', 'Exterior', 'Marine', 'Buried']} onChange={setExposure} />
                <PropStaticRow label="Min cover" value={minCoverForExposure(exposure)} unit="mm" desc="per code" />
              </PropGroup>
              <PropGroup title="5.2 · Fire Rating" border>
                <PropSelectRow label="Fire" value="2hr" opts={['1hr', '2hr', '3hr', '4hr']} />
                <PropStaticRow label="Add cover" value="20" unit="mm" desc="fire protection addition" />
              </PropGroup>
            </div>
          </div>
        </>
      )}

      {/* ═══ TAB 3: Basic Loads ═══ */}
      {tab === 'loads' && (
        <>
          <div className="card">
            <div className="card-h"><span className="num-badge">6</span><span className="label">Self Weight (D<sub>sw</sub>)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">structural self-weight · factor 1.2 or 1.4 in combos</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="6.1 · Concrete Self Weight">
                <PropCalcRow label="γc" value={density.toFixed(1)} unit="kN/m³" formula="from Materials tab" expr={`= ${density}`} />
                <PropStaticRow label="Factor" value="1.2 (with L) or 1.4 (alone)" desc="LRFD dead load factor" />
                <PropStaticRow label="Note" value="Computed per member from b × h × γc × L" />
              </PropGroup>
              <PropGroup title="6.2 · Typical Self Weights" border>
                <PropStaticRow label="150mm slab" value={(0.15 * density).toFixed(2)} unit="kPa" />
                <PropStaticRow label="200mm slab" value={(0.20 * density).toFixed(2)} unit="kPa" />
                <PropStaticRow label="300×600 beam" value={(0.30 * 0.60 * density).toFixed(2)} unit="kN/m" />
                <PropStaticRow label="400×400 col" value={(0.40 * 0.40 * density).toFixed(2)} unit="kN/m" />
              </PropGroup>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><span className="num-badge">7</span><span className="label">Superimposed Dead Load (SDL)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">finishes · MEP · partitions · factor 1.2 or 1.4</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="7.1 · Components">
                <PropInputRow label="Floor finish" unit="kPa" value={wDead} onChange={setWDead} desc="tiles, screed, waterproofing" />
                <PropInputRow label="Ceiling" unit="kPa" value={0.25} onChange={() => {}} desc="susp. ceiling + fixtures" />
                <PropInputRow label="MEP" unit="kPa" value={0.50} onChange={() => {}} desc="mech / elec / plumbing" />
                <PropInputRow label="Partitions" unit="kPa" value={1.00} onChange={() => {}} desc="movable partitions (min 1.0)" />
              </PropGroup>
              <PropGroup title="7.2 · Summary" border>
                <PropCalcRow label="Total SDL" value={(wDead + 0.25 + 0.50 + 1.0).toFixed(2)} unit="kPa" formula="Σ all SDL components" expr={`= ${wDead} + 0.25 + 0.50 + 1.00`} />
                <PropStaticRow label="Factor" value="1.2 (with L) or 1.4 (alone)" desc="same as D — SDL is dead load" />
                <PropStaticRow label="Code ref" value={`${code.replace(/_/g, ' ')} §4.2`} desc="dead load provisions" />
              </PropGroup>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><span className="num-badge">8</span><span className="label">Live Load (L)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">occupancy live load · factor 1.6 (primary) or 1.0 (companion)</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="8.1 · Floor Live Load">
                <PropInputRow label="LL" unit="kPa" value={wLive} onChange={setWLive} desc="design floor live load" />
                <PropSelectRow label="Occupancy" value="Residential" opts={['Residential', 'Office', 'Assembly', 'Storage', 'Parking', 'Hospital', 'Industrial']} />
                <PropStaticRow label="Code min" value="1.90" unit="kPa" desc="residential (NSCP Table 205-1)" />
              </PropGroup>
              <PropGroup title="8.2 · Factors" border>
                <PropStaticRow label="Primary" value="1.6" desc="when L is the principal variable" />
                <PropStaticRow label="Companion" value="1.0" desc="when combined with W or E" />
                <PropStaticRow label="Pattern" value="0.5" desc="checkerboard pattern loading" />
                <PropStaticRow label="Code ref" value={`${code.replace(/_/g, ' ')} §9.2.1`} desc="load combinations" />
              </PropGroup>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><span className="num-badge">9</span><span className="label">Roof Live Load (Lr)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">roof maintenance · factor 1.6 (primary) or 0.5 (companion)</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="9.1 · Roof Live Load">
                <PropInputRow label="Lr" unit="kPa" value={wRoofLive} onChange={setWRoofLive} desc="roof live load" />
                <PropStaticRow label="Code min" value="0.60" unit="kPa" desc="ordinary flat roof" />
                <PropStaticRow label="Reducible" value="Yes" desc="per tributary area (§205.6)" />
              </PropGroup>
              <PropGroup title="9.2 · Factors" border>
                <PropStaticRow label="Primary" value="1.6" desc="1.2D + 1.6Lr + …" />
                <PropStaticRow label="Companion" value="0.5" desc="1.2D + 1.6L + 0.5Lr" />
                <PropStaticRow label="Code ref" value={`${code.replace(/_/g, ' ')} §9.2.1`} />
              </PropGroup>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><span className="num-badge">10</span><span className="label">Seismic Load (E)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">{code.replace(/_/g, ' ')} seismic · factor 1.0</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="10.1 · Seismic Parameters">
                <PropSelectRow label="Zone" value={seismicZone} opts={['Zone_1', 'Zone_2', 'Zone_3', 'Zone_4']} onChange={setSeismicZone} />
                <PropCalcRow label="Z" value={Z.toFixed(2)} unit="—" formula="zone factor" expr={`Zone ${seismicZone.replace('Zone_', '')}`} />
                <PropSelectRow label="Soil" value={soilProfile} opts={['SA', 'SB', 'SC', 'SD', 'SE', 'SF']} onChange={setSoilProfile} />
                <PropInputRow label="I" unit="—" value={importance} onChange={setImportance} desc="importance factor" />
              </PropGroup>
              <PropGroup title="10.2 · Frame & Coefficients" border>
                <PropSelectRow label="Frame" value={frameType} opts={['SMRF', 'IMRF', 'OMRF', 'Dual', 'Shear Wall']} onChange={setFrameType} />
                <PropInputRow label="R" unit="—" value={rFactor} onChange={setRFactor} desc="response modification" />
                <PropCalcRow label="Cv" value={Cv.toFixed(3)} unit="—" formula="Cv = Z · Nv · Fa" expr={`≈ ${Z} × 1.2`} />
                <PropCalcRow label="Ca" value={Ca.toFixed(3)} unit="—" formula="Ca = Z · Na · Fa" expr={`≈ ${Z} × 1.0`} />
                <PropCalcRow label="Cs" value={Cs} unit="—" formula="Cs = Cv / (R·T)" expr={`= ${Cv.toFixed(3)} / ${rFactor}`} />
                <PropCalcRow label="Cs min" value={CsMin} unit="—" formula="0.11 · Ca · I" expr={`= 0.11 · ${Ca.toFixed(3)} · ${importance}`} />
                <PropStaticRow label="Factor" value="1.0" desc="E enters combos at 1.0E" />
              </PropGroup>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><span className="num-badge">11</span><span className="label">Wind Load (W)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">NSCP 2015 §207 / ASCE 7 · factor 1.0</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="11.1 · Wind Parameters">
                <PropInputRow label="V" unit="km/h" value={windSpeed} onChange={setWindSpeed} desc="basic wind speed" />
                <PropSelectRow label="Exposure" value={windExposure} opts={['A', 'B', 'C', 'D']} onChange={setWindExposure} />
                <PropInputRow label="Iw" unit="—" value={importance} onChange={setImportance} desc="wind importance factor" />
              </PropGroup>
              <PropGroup title="11.2 · Derived Pressures" border>
                <PropCalcRow label="qz" value={((0.613 * Math.pow(windSpeed / 3.6, 2)) / 1000).toFixed(3)} unit="kPa" formula="qz = 0.613·V² (m/s)" expr={`V = ${(windSpeed / 3.6).toFixed(1)} m/s`} />
                <PropStaticRow label="Kz" value="0.85" desc="exposure coeff. (typ. at 10m)" />
                <PropStaticRow label="Kzt" value="1.00" desc="topographic factor" />
                <PropStaticRow label="G" value="0.85" desc="gust effect factor" />
                <PropStaticRow label="Factor" value="1.0" desc="W enters combos at 1.0W" />
              </PropGroup>
            </div>
          </div>
        </>
      )}

      {/* ═══ TAB 4: Load Combinations ═══ */}
      {tab === 'combos' && (
        <LoadCombinationsTab
          projectId={projectId}
          codeStandard={code}
          templates={templates}
          loadCaseCount={loadCaseCount}
          comboCount={comboCount}
          envelopeSummary={envelopeSummary}
        />
      )}

      {toast && (
        <div className="sync" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 60, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', maxWidth: 360 }}>
          <span className="led" /><span style={{ fontSize: 11.5 }}>{toast}</span>
        </div>
      )}
    </div>
  )
}

// ─── Load Combinations Tab ──────────────────────────────────────────────────

function LoadCombinationsTab({
  projectId, codeStandard, templates, loadCaseCount, comboCount, envelopeSummary,
}: {
  projectId: string; codeStandard: CodeStandard; templates: TemplateOption[]
  loadCaseCount: number; comboCount: number; envelopeSummary: Envelope
}) {
  const [generating, startGen] = useTransition()
  const [recomputing, startRecomp] = useTransition()
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]?.id ?? '')
  const [toast, setToast] = useState<string | null>(null)
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }
  const codeRef = codeStandard.replace(/_/g, ' ')

  // Standard LRFD combos per ACI 318 / NSCP
  const STANDARD_COMBOS = [
    { label: '1.4D', factors: '1.4D', code: '§9.2.1(a)' },
    { label: '1.2D + 1.6L + 0.5Lr', factors: '1.2D + 1.6L + 0.5Lr', code: '§9.2.1(b)' },
    { label: '1.2D + 1.6Lr + (1.0L or 0.5W)', factors: '1.2D + 1.6Lr + f₁L + f₂W', code: '§9.2.1(c)' },
    { label: '1.2D + 1.0W + 1.0L + 0.5Lr', factors: '1.2D + 1.0W + 1.0L + 0.5Lr', code: '§9.2.1(d)' },
    { label: '1.2D + 1.0E + 1.0L', factors: '1.2D + 1.0E + 1.0L', code: '§9.2.1(e)' },
    { label: '0.9D + 1.0W', factors: '0.9D + 1.0W', code: '§9.2.1(f)' },
    { label: '0.9D + 1.0E', factors: '0.9D + 1.0E', code: '§9.2.1(g)' },
  ]

  return (
    <>
      <div className="card">
        <div className="card-h">
          <span className="num-badge">12</span>
          <span className="label">Standard Combinations · {codeRef}</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            LRFD strength combinations per {codeRef} §9.2
          </span>
        </div>
        <div className="card-b" style={{ padding: 0 }}>
          <table className="t" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th>Combination</th>
                <th>Factored expression</th>
                <th style={{ width: 100 }}>Code ref</th>
              </tr>
            </thead>
            <tbody>
              {STANDARD_COMBOS.map((c, i) => (
                <tr key={i}>
                  <td className="num">{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{c.label}</td>
                  <td className="mono" style={{ color: 'var(--color-ink-2)' }}>{c.factors}</td>
                  <td className="mono" style={{ color: 'var(--color-ink-3)' }}>{c.code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <span className="num-badge">13</span>
          <span className="label">Generate from Template</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            {loadCaseCount} load cases · {comboCount} combinations generated
          </span>
        </div>
        <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select className="select" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} style={{ width: 280, height: 24 }}>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.combinations} combos)</option>)}
            </select>
            <button type="button" className="btn sm primary" disabled={generating || !selectedTemplate}
              onClick={() => startGen(async () => {
                const r = await generateCombinationsAction({ projectId, templateId: selectedTemplate })
                flash(r.ok ? `${r.written} combinations generated.` : r.error)
              })}>
              <Icon name="play" size={12} /> {generating ? 'Generating…' : 'Generate'}
            </button>
            <button type="button" className="btn sm" disabled={recomputing || comboCount === 0}
              onClick={() => startRecomp(async () => {
                const r = await recomputeEnvelopeAction(projectId)
                flash(r.ok ? 'Envelope recomputed.' : r.error)
              })}>
              Recompute envelope
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>
            Templates map basic load cases (D, L, Lr, W, E) to the standard {codeRef} LRFD combinations above.
            After generating, click "Recompute envelope" to update the governing M+/M-/Vu values.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <span className="num-badge">14</span>
          <span className="label">Envelope Summary</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">governing forces across all members &amp; combinations</span>
        </div>
        <div className="card-b">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <EnvCell label="Design M⁺" value={envelopeSummary.mpos.value.toFixed(1)} unit="kN·m" member={envelopeSummary.mpos.member} combo={envelopeSummary.mpos.combo} />
            <EnvCell label="Design M⁻" value={envelopeSummary.mneg.value.toFixed(1)} unit="kN·m" member={envelopeSummary.mneg.member} combo={envelopeSummary.mneg.combo} />
            <EnvCell label="Design Vu" value={envelopeSummary.vu.value.toFixed(1)} unit="kN" member={envelopeSummary.vu.member} combo={envelopeSummary.vu.combo} />
          </div>
        </div>
      </div>

      {toast && (
        <div className="sync" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 60, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', maxWidth: 360 }}>
          <span className="led" /><span style={{ fontSize: 11.5 }}>{toast}</span>
        </div>
      )}
    </>
  )
}

function EnvCell({ label, value, unit, member, combo }: {
  label: string; value: string; unit: string; member: number | null; combo: number | null
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="sub-label">{label}</span>
      <span className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{value} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-ink-3)' }}>{unit}</span></span>
      <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>member {member ?? '—'} · combo {combo ?? '—'}</span>
    </div>
  )
}

function gradeFromFy(fy: number): string {
  if (fy <= 280) return 'Gr275'
  if (fy <= 418) return 'Gr415'
  if (fy <= 425) return 'Gr420'
  if (fy <= 510) return 'Gr500'
  if (fy <= 560) return 'Gr550'
  return 'Gr690'
}

function fyFromGrade(g: string): number {
  const map: Record<string, number> = { Gr275: 275, Gr415: 415, Gr420: 420, Gr500: 500, Gr550: 550, Gr690: 690 }
  return map[g] ?? 420
}

function minCoverForExposure(exp: string): string {
  if (exp === 'Interior') return '40'
  if (exp === 'Exterior') return '50'
  if (exp === 'Marine') return '65'
  if (exp === 'Buried') return '75'
  return '40'
}
