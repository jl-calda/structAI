'use client'

import { useEffect, useState } from 'react'

import {
  PropCalcRow,
  PropGroup,
  PropInputRow,
  PropSelectRow,
  PropStaticRow,
} from '@/components/ui/PropRow'
import { EmbeddedAssemblyPicker } from './EmbeddedAssemblyPicker'
import {
  buildNSCPAllowableCombos,
  buildNSCPUltimateCombos,
  generateAllCombinations,
  generateFullSeismicBlock,
  generateReferenceLoadsBlock,
  generateRefLoadCase,
  type ReferenceLoadDef,
  type SeismicDefinition,
} from '@/lib/staad/syntax'
import { setStaadCode } from '@/lib/stores/staad-code-store'
import type { CodeStandard } from '@/lib/supabase/types'

type MemberLite = { member_id: number; section_name: string; length_mm: number; member_type: string }

export function BasicLoadsPage({
  projectId,
  project,
  members = [],
}: {
  projectId: string
  project: {
    code_standard: CodeStandard
    default_density_kn_m3: number
    seismic_zone: string
    lightweight_lambda: number
  }
  members?: MemberLite[]
}) {
  void projectId
  const code = project.code_standard
  const codeRef = code.replace(/_/g, ' ')
  const density = project.default_density_kn_m3

  const [swFactor, setSwFactor] = useState(1)
  const [seismicZone, setSeismicZone] = useState(project.seismic_zone)
  const [soilProfile, setSoilProfile] = useState('SD')
  const [importance, setImportance] = useState(1.0)
  const [rFactor, setRFactor] = useState(8.5)
  const [frameType, setFrameType] = useState('SMRF')
  const [includeEQxz, setIncludeEQxz] = useState(false)
  const [massRefs, setMassRefs] = useState<Record<string, { on: boolean; factor: number }>>({
    DL: { on: true, factor: 1.0 },
    LL: { on: false, factor: 0.25 },
    LR: { on: false, factor: 0.0 },
  })
  const [windSpeed, setWindSpeed] = useState(200)
  const [windExposure, setWindExposure] = useState('B')

  const Z = seismicZone === 'Zone_4' ? 0.40 : seismicZone === 'Zone_3' ? 0.30 : seismicZone === 'Zone_2' ? 0.20 : 0.08
  const Cv = Z * 1.2
  const Ca = Z * 1.0
  const Cs = (Cv / rFactor).toFixed(4)
  const CsMin = (0.11 * Ca * importance).toFixed(4)

  const eqxCase = 1
  const eqzCase = 2
  const eqxzCase = includeEQxz ? 3 : 0
  const dlCase = includeEQxz ? 4 : 3
  const llCase = dlCase + 1
  const lrCase = dlCase + 2
  const wxStart = dlCase + 3

  const SOIL_MAP: Record<string, number> = { SA: 1, SB: 2, SC: 3, SD: 4, SE: 5, SF: 5 }

  // Build R-load definitions (reusable load patterns)
  const refLoadDefs: ReferenceLoadDef[] = [
    { id: 'R1', loadType: 'Dead', title: 'DEAD LOAD', selfWeight: { factor: swFactor } },
    { id: 'R2', loadType: 'Live', title: 'LIVE LOAD' },
  ]

  // Named R-load references for seismic mass (W)
  const namedRefs: { refId: string; factor: number }[] = []
  if (massRefs.DL.on) namedRefs.push({ refId: 'R1', factor: massRefs.DL.factor })
  if (massRefs.LL.on) namedRefs.push({ refId: 'R2', factor: massRefs.LL.factor })

  const isNSCP = code.startsWith('NSCP')
  const seismicDef: SeismicDefinition = {
    code: isNSCP ? 'UBC_1997' : 'IBC_2006',
    zone: Z,
    importance,
    rwx: rFactor,
    rwz: rFactor,
    soilType: SOIL_MAP[soilProfile] ?? 4,
    referenceLoads: [],
    namedRefs,
  }

  const codeLines = [
    '* ============================================================',
    '* REFERENCE LOAD DEFINITIONS',
    '* ============================================================',
    generateReferenceLoadsBlock(refLoadDefs),
    '',
    '* ============================================================',
    '* SEISMIC DEFINITION',
    '* ============================================================',
    generateFullSeismicBlock(seismicDef, eqxCase, eqzCase),
  ]
  if (includeEQxz) {
    codeLines.push(
      '',
      `LOAD ${eqxzCase} LOADTYPE None  TITLE EQxz`,
      'REPEAT LOAD',
      `${eqxCase} 1.0 ${eqzCase} 0.3`,
    )
  }
  // Dummy joint load — STAAD requires at least one load entry per case
  const dummy = 'JOINT LOAD\n1 FY 0'

  codeLines.push(
    '',
    '* ============================================================',
    `*  LC ${eqxCase}  = EQx   Seismic +X`,
    `*  LC ${eqzCase}  = EQz   Seismic +Z`,
    `*  LC ${dlCase}  = DL    Dead Load`,
    `*  LC ${llCase}  = LL    Floor Live Load`,
    `*  LC ${lrCase}  = RLL   Roof Live Load`,
    `*  LC ${wxStart}  = WX+   Wind +X`,
    `*  LC ${wxStart + 1}  = WX-   Wind -X`,
    `*  LC ${wxStart + 2}  = WZ+   Wind +Z`,
    `*  LC ${wxStart + 3}  = WZ-   Wind -Z`,
    '* ============================================================',
    '',
    generateRefLoadCase(dlCase, 'Dead', `${dlCase}-DEAD LOAD (DL)`, 'R1'),
    dummy,
    '*',
    generateRefLoadCase(llCase, 'Live', `${llCase}-FLOOR LIVE LOAD (LL)`, 'R2'),
    dummy,
    '*',
    `LOAD ${lrCase} LOADTYPE Roof Live  TITLE ${lrCase}-ROOF LIVE LOAD (RLL)`,
    dummy,
    '*',
    `LOAD ${wxStart} LOADTYPE Wind  TITLE ${wxStart}-WIND LOAD +X (WX+)`,
    dummy,
    '*',
    `LOAD ${wxStart + 1} LOADTYPE Wind  TITLE ${wxStart + 1}-WIND LOAD -X (WX-)`,
    dummy,
    '*',
    `LOAD ${wxStart + 2} LOADTYPE Wind  TITLE ${wxStart + 2}-WIND LOAD +Z (WZ+)`,
    dummy,
    '*',
    `LOAD ${wxStart + 3} LOADTYPE Wind  TITLE ${wxStart + 3}-WIND LOAD -Z (WZ-)`,
    dummy,
  )

  // Build load combination blocks
  const caseMap = {
    dead: dlCase,
    live: llCase,
    roof_live: lrCase,
    seismic_x: eqxCase,
    seismic_z: eqzCase,
    wind_x: wxStart,
    wind_x2: wxStart + 1,
    wind_z: wxStart + 2,
    wind_z2: wxStart + 3,
  }
  const ultimateCombos = buildNSCPUltimateCombos(caseMap)
  const allowableCombos = buildNSCPAllowableCombos(caseMap)

  codeLines.push(
    '',
    '',
    '',
    '*****ULTIMATE LOAD COMBINATION*****',
    generateAllCombinations(ultimateCombos),
    '',
    '',
    '',
    '**ALLOWABLE LOAD COMBINATION**',
    generateAllCombinations(allowableCombos),
  )

  const allCode = codeLines.join('\n')

  useEffect(() => { setStaadCode(allCode); return () => { setStaadCode('') } }, [allCode])

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row" style={{ gap: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Basic Loads</span>
        <span className="mono" style={{ color: 'var(--color-ink-3)', fontSize: 11.5 }}>
          {codeRef} · define each load type with its LRFD factor
        </span>
      </div>

          {/* Card 1 — Self Weight */}
          <div className="card">
            <div className="card-h"><span className="num-badge">1</span><span className="label">Self Weight (D<sub>sw</sub>)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">STAAD SELFWEIGHT command · factor-based</span></div>
            <div style={{ borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="1.1 · Self Weight Factor">
                <PropInputRow label="Factor" unit="—" value={swFactor} onChange={setSwFactor} desc="SELFWEIGHT Y multiplier (typically 1)" />
                <PropCalcRow label="γc" value={density.toFixed(1)} unit="kN/m³" formula="from project Materials" expr={`= ${density}`} />
                <PropStaticRow label="Note" value="STAAD computes self-weight from member sections × γ automatically" />
                <PropStaticRow label="LRFD" value="1.2 (with L) or 1.4 (alone)" desc="factor in combinations" />
              </PropGroup>
            </div>
          </div>

          {/* Card 2 — SDL */}
          <div className="card">
            <div className="card-h"><span className="num-badge">2</span><span className="label">Superimposed Dead Load (SDL)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">walls · slab loads · finishes · MEP · partitions · factor 1.2 or 1.4</span></div>
            <div className="card-b" style={{ padding: '6px 10px', fontSize: 11, color: 'var(--color-ink-3)' }}>
              Add wall loads, slab tributary loads, floor finishes, and partitions from the assembly library below.
              Multiple assemblies stack — e.g. add &quot;150mm CHB wall&quot; + &quot;tiles&quot; + &quot;ceiling&quot; for a complete floor load on a beam.
            </div>
            <EmbeddedAssemblyPicker
              codeStandard={code}
              members={members}
              caseNumber={dlCase}
              caseTitle="SDL"
              loadType="dead"
              allowedCategories={['wall', 'slab', 'floor_finish', 'partition', 'facade']}
            />
          </div>

          {/* Card 3 — Live Load */}
          <div className="card">
            <div className="card-h"><span className="num-badge">3</span><span className="label">Live Load (L)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">occupancy live load · factor 1.6 primary / 1.0 companion</span></div>
            <div className="card-b" style={{ padding: '6px 10px', fontSize: 11, color: 'var(--color-ink-3)' }}>
              Select the occupancy type from the code&apos;s live load table. The load is applied as a UDL via tributary width.
            </div>
            <EmbeddedAssemblyPicker
              codeStandard={code}
              members={members}
              caseNumber={llCase}
              caseTitle="LL"
              loadType="live"
              allowedCategories={['live']}
            />
          </div>

          {/* Card 4 — Roof Live Load */}
          <div className="card">
            <div className="card-h"><span className="num-badge">4</span><span className="label">Roof Live Load (Lr)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">roof maintenance · factor 1.6 primary / 0.5 companion</span></div>
            <div className="card-b" style={{ padding: '6px 10px', fontSize: 11, color: 'var(--color-ink-3)' }}>
              Roof live load for maintenance access. Select the roof type from the library or enter directly.
            </div>
            <EmbeddedAssemblyPicker
              codeStandard={code}
              members={members}
              caseNumber={lrCase}
              caseTitle="LR"
              loadType="live"
              allowedCategories={['live', 'stair']}
            />
          </div>

          {/* Card 5 — Seismic */}
          <div className="card">
            <div className="card-h"><span className="num-badge">5</span><span className="label">Seismic Load (E)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">{codeRef} seismic · factor 1.0</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="5.1 · Seismic Parameters">
                <PropSelectRow label="Zone" value={seismicZone} opts={['Zone_1', 'Zone_2', 'Zone_3', 'Zone_4']} onChange={setSeismicZone} />
                <PropCalcRow label="Z" value={Z.toFixed(2)} unit="—" formula="zone factor" expr={`Zone ${seismicZone.replace('Zone_', '')}`} />
                <PropSelectRow label="Soil" value={soilProfile} opts={['SA', 'SB', 'SC', 'SD', 'SE', 'SF']} onChange={setSoilProfile} />
                <PropInputRow label="I" unit="—" value={importance} onChange={setImportance} desc="importance factor" />
              </PropGroup>
              <PropGroup title="5.2 · Frame & Coefficients" border>
                <PropSelectRow label="Frame" value={frameType} opts={['SMRF', 'IMRF', 'OMRF', 'Dual', 'Shear Wall']} onChange={setFrameType} />
                <PropInputRow label="R" unit="—" value={rFactor} onChange={setRFactor} desc="response modification" />
                <PropCalcRow label="Cv" value={Cv.toFixed(3)} unit="—" formula="Cv = Z · Nv · Fa" expr={`≈ ${Z} × 1.2`} />
                <PropCalcRow label="Ca" value={Ca.toFixed(3)} unit="—" formula="Ca = Z · Na · Fa" expr={`≈ ${Z} × 1.0`} />
                <PropCalcRow label="Cs" value={Cs} unit="—" formula="Cs = Cv / (R·T)" expr={`= ${Cv.toFixed(3)} / ${rFactor}`} />
                <PropCalcRow label="Cs min" value={CsMin} unit="—" formula="0.11 · Ca · I" expr={`= 0.11 · ${Ca.toFixed(3)} · ${importance}`} />
                <PropStaticRow label="Factor" value="1.0" desc="E enters combos at 1.0E" />
              </PropGroup>
            </div>
            <div style={{ borderTop: '1px solid var(--color-line-2)', padding: '8px 10px' }}>
              <div className="sub-label" style={{ marginBottom: 6 }}>Seismic Load Cases</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, marginBottom: 8 }}>
                <span className="mono" style={{ color: 'var(--color-ink-3)' }}>LOAD {eqxCase} EQx</span>
                <span className="mono" style={{ color: 'var(--color-ink-3)' }}>LOAD {eqzCase} EQz</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={includeEQxz} onChange={e => setIncludeEQxz(e.target.checked)} />
                  LOAD {eqxzCase || 3} EQxz
                  <span style={{ color: 'var(--color-ink-4)', fontSize: 10 }}>100% + 30% rule · §208.8.1</span>
                </label>
              </div>
              <div className="sub-label" style={{ marginBottom: 6 }}>Seismic Mass (W) — REFERENCE LOAD</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
                {[
                  { key: 'DL', refId: 'R1', label: 'Dead (R1)' },
                  { key: 'LL', refId: 'R2', label: 'Live (R2)' },
                ].map(({ key, refId, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={massRefs[key].on}
                      onChange={e => setMassRefs(prev => ({ ...prev, [key]: { ...prev[key], on: e.target.checked } }))}
                    />
                    {label} ×
                    <input
                      className="input"
                      type="number"
                      step={0.05}
                      value={massRefs[key].factor}
                      onChange={e => setMassRefs(prev => ({ ...prev, [key]: { ...prev[key], factor: Number(e.target.value) } }))}
                      style={{ width: 45, height: 18, fontSize: 10 }}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Card 6 — Wind */}
          <div className="card">
            <div className="card-h"><span className="num-badge">6</span><span className="label">Wind Load (W)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">{codeRef} §207 / ASCE 7 · factor 1.0</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
              <PropGroup title="6.1 · Wind Parameters">
                <PropInputRow label="V" unit="km/h" value={windSpeed} onChange={setWindSpeed} desc="basic wind speed" />
                <PropSelectRow label="Exposure" value={windExposure} opts={['A', 'B', 'C', 'D']} onChange={setWindExposure} />
                <PropInputRow label="Iw" unit="—" value={importance} onChange={setImportance} desc="wind importance factor" />
              </PropGroup>
              <PropGroup title="6.2 · Derived Pressures" border>
                <PropCalcRow label="qz" value={((0.613 * Math.pow(windSpeed / 3.6, 2)) / 1000).toFixed(3)} unit="kPa" formula="qz = 0.613·V² (m/s)" expr={`V = ${(windSpeed / 3.6).toFixed(1)} m/s`} />
                <PropStaticRow label="Kz" value="0.85" desc="exposure coeff. (typ. at 10m)" />
                <PropStaticRow label="Kzt" value="1.00" desc="topographic factor" />
                <PropStaticRow label="G" value="0.85" desc="gust effect factor" />
                <PropStaticRow label="Factor" value="1.0" desc="W enters combos at 1.0W" />
              </PropGroup>
            </div>
          </div>
    </div>
  )
}
