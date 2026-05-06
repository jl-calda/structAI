'use client'

import { useState, useTransition } from 'react'

import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'

import {
  setProjectCodeStandardAction,
  updateProjectDefaultsAction,
} from '@/app/actions/projects'
import { Icon } from '@/components/ui/Icon'
import {
  PropCalcRow,
  PropGroup,
  PropInputRow,
  PropSelectRow,
  PropStaticRow,
} from '@/components/ui/PropRow'
import type { CodeStandard } from '@/lib/supabase/types'

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
    exposure_class: string
    aggregate_type: string
    lightweight_lambda: number
    engineer_name: string
  }
}

const CODES: { value: CodeStandard; label: string }[] = [
  { value: 'NSCP_2015', label: 'NSCP 2015' },
  { value: 'ACI_318_19', label: 'ACI 318-19' },
  { value: 'EC2_2004', label: 'EC2 2004' },
  { value: 'AS_3600_2018', label: 'AS 3600-2018' },
  { value: 'CSA_A23_3_19', label: 'CSA A23.3-19' },
]

export function ProjectSetup({ projectId, project: p }: ProjectSetupProps) {
  const [tab, setTab] = useState<'identity' | 'materials'>('identity')
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
        exposure_class: exposure, aggregate_type: aggregate,
        lightweight_lambda: lambda, engineer_name: engineer,
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
  ]

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Project Setup</span>
        <span className="mono" style={{ color: 'var(--color-ink-3)', fontSize: 11.5 }}>{code.replace(/_/g, ' ')} · defaults for all new designs</span>
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

      {toast && (
        <div className="sync" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 60, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', maxWidth: 360 }}>
          <span className="led" /><span style={{ fontSize: 11.5 }}>{toast}</span>
        </div>
      )}
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
