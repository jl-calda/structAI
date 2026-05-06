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
  requestResyncAction,
} from '@/app/actions/loads'
import { Icon } from '@/components/ui/Icon'
import {
  PropCalcRow,
  PropGroup,
  PropInputRow,
  PropSelectRow,
  PropStaticRow,
  PropTextRow,
} from '@/components/ui/PropRow'
import { shortHash } from '@/lib/format'
import type { CodeStandard } from '@/lib/supabase/types'

type EnvelopeAxis = { value: number; member: number | null; combo: number | null }
type Envelope = { mpos: EnvelopeAxis; mneg: EnvelopeAxis; vu: EnvelopeAxis }

type LatestSync = {
  fileName: string
  hash: string
  syncedAt: string
  nodes: number
  members: number
  status: string
  mismatch: boolean
} | null

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
  latestSync: LatestSync
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
  latestSync,
  templates,
  loadCaseCount,
  comboCount,
  envelopeSummary,
}: ProjectSetupProps) {
  const [tab, setTab] = useState<'identity' | 'materials' | 'staad'>('identity')
  const [saving, startSave] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  // Editable fields — initialize from project
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

  const codeProvider = getCode(code)
  const beta1 = codeProvider.stress_block_depth_factor(fc)
  const Ec = Math.round(4700 * Math.sqrt(fc))
  const fr = (0.62 * lambda * Math.sqrt(fc)).toFixed(2)

  const save = (overrides?: Record<string, unknown>) => {
    startSave(async () => {
      const result = await updateProjectDefaultsAction(projectId, {
        name,
        description: description || null,
        client: client || null,
        location: location || null,
        default_fc_mpa: fc,
        default_fy_mpa: fy,
        default_fys_mpa: fys,
        default_clear_cover_mm: cover,
        default_density_kn_m3: density,
        seismic_zone: seismicZone,
        exposure_class: exposure,
        aggregate_type: aggregate,
        lightweight_lambda: lambda,
        engineer_name: engineer,
        ...overrides,
      })
      if (result.ok) {
        flash('Saved.')
      } else {
        flash(`Error: ${result.error}`)
      }
    })
  }

  const changeCode = (next: CodeStandard) => {
    setCode(next)
    startSave(async () => {
      const result = await setProjectCodeStandardAction(projectId, next)
      if (result.ok) flash(`Code standard set to ${next.replace(/_/g, ' ')}.`)
      else flash(`Error: ${result.error}`)
    })
  }

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const TABS = [
    { id: 'identity' as const, label: 'Identity & Code' },
    { id: 'materials' as const, label: 'Materials & Cover' },
    { id: 'staad' as const, label: 'STAAD & Combos' },
  ]

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Project Setup</span>
        <span className="mono" style={{ color: 'var(--color-ink-3)', fontSize: 11.5 }}>
          {code.replace(/_/g, ' ')} · defaults for all new designs
        </span>
        <div className="spacer" />
        <button type="button" className="btn sm primary" onClick={() => save()} disabled={saving}>
          <Icon name="save" size={12} /> {saving ? 'Saving…' : 'Save all'}
        </button>
      </div>

      {/* Tab strip */}
      <div style={{ display: 'flex', gap: 0, background: 'var(--color-bg)', borderRadius: 4, padding: 2, border: '1px solid var(--color-line-2)', alignSelf: 'flex-start' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: '4px 14px',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.03em',
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
      </div>

      {/* ─── Tab 1: Identity & Code ─────────────────────────────────── */}
      {tab === 'identity' && (
        <>
          <div className="card">
            <div className="card-h">
              <span className="num-badge">1</span>
              <span className="label">Project Identity</span>
              <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">name · client · location · engineer</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="1.1 · General">
                <PropInputRow label="Name" value={name as unknown as number} onChange={v => setName(String(v))} desc="project name" />
                <PropInputRow label="Client" value={client as unknown as number} onChange={v => setClient(String(v))} desc="client / owner" />
                <PropInputRow label="Location" value={location as unknown as number} onChange={v => setLocation(String(v))} desc="site location" />
                <PropInputRow label="Engineer" value={engineer as unknown as number} onChange={v => setEngineer(String(v))} desc="project engineer" />
              </PropGroup>
              <PropGroup title="1.2 · Description" border>
                <textarea
                  className="input"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  onBlur={() => save()}
                  rows={5}
                  style={{ width: '100%', resize: 'vertical', height: 'auto', fontFamily: 'var(--font-sans)', fontSize: 11, padding: '6px 8px' }}
                  placeholder="Project scope, notes, revision history…"
                />
              </PropGroup>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <span className="num-badge">2</span>
              <span className="label">Code Standard</span>
              <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
                design code · reduction factors · stress block
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="2.1 · Active Code">
                <div className="prop-row">
                  <span className="k">Standard</span>
                  <select
                    className="select"
                    value={code}
                    onChange={e => changeCode(e.target.value as CodeStandard)}
                    style={{ height: 24, fontSize: 11.5, width: 200 }}
                  >
                    {CODES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <PropStaticRow label="Rebar std" value={code === 'ACI_318_19' ? 'ASTM A615 (imperial #N)' : 'PNS 49 / ASTM A615M (metric Ø)'} />
                <PropStaticRow label="Bar sizes" value={codeProvider.bar_dias_long.map(d => codeProvider.bar_label(d)).join(', ')} />
                <div style={{ fontSize: 10, color: 'var(--color-warn)', padding: '4px 0', marginTop: 4 }}>
                  Changing the code standard affects all new designs. Existing designs retain their original code.
                </div>
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

      {/* ─── Tab 2: Materials & Cover ───────────────────────────────── */}
      {tab === 'materials' && (
        <>
          <div className="card">
            <div className="card-h">
              <span className="num-badge">3</span>
              <span className="label">Concrete Defaults</span>
              <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
                fc' · γc · aggregate · λ · computed Ec, fr
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="3.1 · Strength & Density">
                <PropInputRow label="fc'" unit="MPa" value={fc} onChange={setFc} desc="compressive strength" />
                <PropInputRow label="γc" unit="kN/m³" value={density} onChange={setDensity} desc="unit weight" />
                <PropSelectRow label="Aggregate" value={aggregate} opts={['Normal', 'Lightweight', 'Sand-Lt']} onChange={setAggregate} />
                <PropInputRow label="λ" unit="—" value={lambda} onChange={setLambda} desc="lightweight factor" />
              </PropGroup>
              <PropGroup title="3.2 · Derived Values" border>
                <PropCalcRow label="Ec" value={`${Ec}`} unit="MPa" formula="Ec = 4700·√fc'   [§19.2.2.1]" expr={`= 4700·√${fc}`} />
                <PropCalcRow label="β1" value={beta1.toFixed(3)} unit="—" formula="code.stress_block_depth_factor(fc')" expr={`fc' = ${fc} MPa`} />
                <PropCalcRow label="fr" value={fr} unit="MPa" formula="fr = 0.62·λ·√fc'" expr={`= 0.62·${lambda}·√${fc}`} />
                <PropStaticRow label="εcu" value="0.003" unit="—" />
              </PropGroup>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <span className="num-badge">4</span>
              <span className="label">Steel Defaults</span>
              <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
                fy · fys · Es · grade
              </span>
            </div>
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
            <div className="card-h">
              <span className="num-badge">5</span>
              <span className="label">Cover &amp; Durability</span>
              <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
                clear cover · exposure · seismic zone
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="5.1 · Cover">
                <PropInputRow label="Cover" unit="mm" value={cover} onChange={setCover} desc="default clear cover" />
                <PropSelectRow label="Exposure" value={exposure} opts={['Interior', 'Exterior', 'Marine', 'Buried']} onChange={setExposure} />
                <PropStaticRow label="Min cover" value={minCoverForExposure(exposure)} unit="mm" desc="per code" />
              </PropGroup>
              <PropGroup title="5.2 · Seismic" border>
                <PropSelectRow label="Zone" value={seismicZone} opts={['Zone_1', 'Zone_2', 'Zone_3', 'Zone_4']} onChange={setSeismicZone} />
                <PropSelectRow label="Frame" value="SMRF" opts={['SMRF', 'IMRF', 'OMRF']} />
                <PropStaticRow label="R" value={seismicZone === 'Zone_4' ? '8.5' : seismicZone === 'Zone_3' ? '8.5' : '5.5'} desc="response mod. factor" />
              </PropGroup>
            </div>
          </div>
        </>
      )}

      {/* ─── Tab 3: STAAD & Combos (restyle of existing) ─────────── */}
      {tab === 'staad' && (
        <StaadAndCombosTab
          projectId={projectId}
          codeStandard={code}
          latestSync={latestSync}
          templates={templates}
          loadCaseCount={loadCaseCount}
          comboCount={comboCount}
          envelopeSummary={envelopeSummary}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className="sync"
          style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 60, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', maxWidth: 360 }}
        >
          <span className="led" />
          <span style={{ fontSize: 11.5 }}>{toast}</span>
        </div>
      )}
    </div>
  )
}

// ─── STAAD & Combos tab ─────────────────────────────────────────────────────

function StaadAndCombosTab({
  projectId,
  codeStandard,
  latestSync,
  templates,
  loadCaseCount,
  comboCount,
  envelopeSummary,
}: {
  projectId: string
  codeStandard: CodeStandard
  latestSync: LatestSync
  templates: TemplateOption[]
  loadCaseCount: number
  comboCount: number
  envelopeSummary: Envelope
}) {
  const [syncing, startSync] = useTransition()
  const [generating, startGen] = useTransition()
  const [recomputing, startRecomp] = useTransition()
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]?.id ?? '')
  const [toast, setToast] = useState<string | null>(null)

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  return (
    <>
      {/* Card 6 — STAAD sync */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">6</span>
          <span className="label">STAAD Sync Status</span>
        </div>
        <div className="card-b">
          {latestSync ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5 }}>
              <div className="step-row"><span className="k">File</span><span className="v mono">{latestSync.fileName}</span></div>
              <div className="step-row"><span className="k">Hash</span><span className="v mono">{shortHash(latestSync.hash)}</span></div>
              <div className="step-row"><span className="k">Synced at</span><span className="v mono">{latestSync.syncedAt.slice(0, 19).replace('T', ' ')}</span></div>
              <div className="step-row"><span className="k">Nodes / Members</span><span className="v mono">{latestSync.nodes} / {latestSync.members}</span></div>
              <div className="step-row"><span className="k">Status</span><span className={`v ${latestSync.mismatch ? 'fail' : 'pass'}`}>{latestSync.mismatch ? 'MISMATCH' : 'OK'}</span></div>
            </div>
          ) : (
            <p style={{ fontSize: 11.5, color: 'var(--color-ink-3)' }}>No STAAD sync yet. Start the Python bridge and click Re-sync.</p>
          )}
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn sm"
              disabled={syncing}
              onClick={() => startSync(async () => {
                const r = await requestResyncAction(projectId)
                flash(r.ok ? 'Re-sync requested.' : r.error)
              })}
            >
              <Icon name="sync" size={12} /> {syncing ? 'Syncing…' : 'Re-sync'}
            </button>
          </div>
        </div>
      </div>

      {/* Card 7 — Load combinations */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">7</span>
          <span className="label">Load Combinations</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            {loadCaseCount} load cases · {comboCount} combinations
          </span>
        </div>
        <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              className="select"
              value={selectedTemplate}
              onChange={e => setSelectedTemplate(e.target.value)}
              style={{ width: 280, height: 24 }}
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.combinations} combos)</option>
              ))}
            </select>
            <button
              type="button"
              className="btn sm primary"
              disabled={generating || !selectedTemplate}
              onClick={() => startGen(async () => {
                const r = await generateCombinationsAction({ projectId, templateId: selectedTemplate })
                flash(r.ok ? `${r.written} combinations generated.` : r.error)
              })}
            >
              <Icon name="play" size={12} /> {generating ? 'Generating…' : 'Generate'}
            </button>
            <button
              type="button"
              className="btn sm"
              disabled={recomputing || comboCount === 0}
              onClick={() => startRecomp(async () => {
                const r = await recomputeEnvelopeAction(projectId)
                flash(r.ok ? 'Envelope recomputed.' : r.error)
              })}
            >
              Recompute envelope
            </button>
          </div>
        </div>
      </div>

      {/* Card 8 — Envelope summary */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">8</span>
          <span className="label">Envelope Summary</span>
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
          <span className="led" />
          <span style={{ fontSize: 11.5 }}>{toast}</span>
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
      <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>
        member {member ?? '—'} · combo {combo ?? '—'}
      </span>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gradeFromFy(fy: number): string {
  if (fy <= 280) return 'Gr275'
  if (fy <= 418) return 'Gr415'
  if (fy <= 425) return 'Gr420'
  if (fy <= 510) return 'Gr500'
  if (fy <= 560) return 'Gr550'
  return 'Gr690'
}

function fyFromGrade(g: string): number {
  if (g === 'Gr275') return 275
  if (g === 'Gr415') return 415
  if (g === 'Gr420') return 420
  if (g === 'Gr500') return 500
  if (g === 'Gr550') return 550
  if (g === 'Gr690') return 690
  return 420
}

function minCoverForExposure(exp: string): string {
  if (exp === 'Interior') return '40'
  if (exp === 'Exterior') return '50'
  if (exp === 'Marine') return '65'
  if (exp === 'Buried') return '75'
  return '40'
}
