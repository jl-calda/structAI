'use client'

import { useState } from 'react'

import {
  PropCalcRow,
  PropGroup,
  PropInputRow,
  PropSelectRow,
  PropStaticRow,
} from '@/components/ui/PropRow'
import { LoadAssemblyApplier } from './LoadAssemblyApplier'
import { StaadCodeSection } from './StaadCodeSection'
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

  const [wDead, setWDead] = useState(1.50)
  const [wCeiling, setWCeiling] = useState(0.25)
  const [wMep, setWMep] = useState(0.50)
  const [wPartitions, setWPartitions] = useState(1.00)
  const [wLive, setWLive] = useState(1.90)
  const [wRoofLive, setWRoofLive] = useState(0.60)
  const [occupancy, setOccupancy] = useState('Residential')

  const [seismicZone, setSeismicZone] = useState(project.seismic_zone)
  const [soilProfile, setSoilProfile] = useState('SD')
  const [importance, setImportance] = useState(1.0)
  const [rFactor, setRFactor] = useState(8.5)
  const [frameType, setFrameType] = useState('SMRF')

  const [windSpeed, setWindSpeed] = useState(200)
  const [windExposure, setWindExposure] = useState('B')

  const Z = seismicZone === 'Zone_4' ? 0.40 : seismicZone === 'Zone_3' ? 0.30 : seismicZone === 'Zone_2' ? 0.20 : 0.08
  const Cv = Z * 1.2
  const Ca = Z * 1.0
  const Cs = (Cv / rFactor).toFixed(4)
  const CsMin = (0.11 * Ca * importance).toFixed(4)
  const totalSDL = wDead + wCeiling + wMep + wPartitions

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row" style={{ gap: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Basic Loads</span>
        <span className="mono" style={{ color: 'var(--color-ink-3)', fontSize: 11.5 }}>
          {codeRef} · define each load type with its LRFD factor
        </span>
      </div>

      {/* Load Assembly Calculator */}
      <LoadAssemblyApplier codeStandard={code} members={members} />

      {/* Card 1 — Self Weight */}
      <div className="card">
        <div className="card-h"><span className="num-badge">1</span><span className="label">Self Weight (D<sub>sw</sub>)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">structural self-weight · factor 1.2 or 1.4</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
          <PropGroup title="1.1 · Concrete Self Weight">
            <PropCalcRow label="γc" value={density.toFixed(1)} unit="kN/m³" formula="from project Materials" expr={`= ${density}`} />
            <PropStaticRow label="Factor" value="1.2 (with L) or 1.4 (alone)" desc="LRFD dead load factor" />
          </PropGroup>
          <PropGroup title="1.2 · Typical Self Weights" border>
            <PropStaticRow label="150mm slab" value={(0.15 * density).toFixed(2)} unit="kPa" />
            <PropStaticRow label="200mm slab" value={(0.20 * density).toFixed(2)} unit="kPa" />
            <PropStaticRow label="300×600 beam" value={(0.30 * 0.60 * density).toFixed(2)} unit="kN/m" />
            <PropStaticRow label="400×400 col" value={(0.40 * 0.40 * density).toFixed(2)} unit="kN/m" />
          </PropGroup>
        </div>
        <StaadCodeSection caseNumber={3} loadType="dead" title="DL" members={members} />
      </div>

      {/* Card 2 — SDL */}
      <div className="card">
        <div className="card-h"><span className="num-badge">2</span><span className="label">Superimposed Dead Load (SDL)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">finishes · MEP · partitions · factor 1.2 or 1.4</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
          <PropGroup title="2.1 · Components">
            <PropInputRow label="Floor finish" unit="kPa" value={wDead} onChange={setWDead} desc="tiles, screed, waterproofing" />
            <PropInputRow label="Ceiling" unit="kPa" value={wCeiling} onChange={setWCeiling} desc="suspended ceiling + fixtures" />
            <PropInputRow label="MEP" unit="kPa" value={wMep} onChange={setWMep} desc="mech / elec / plumbing" />
            <PropInputRow label="Partitions" unit="kPa" value={wPartitions} onChange={setWPartitions} desc="movable partitions (min 1.0)" />
          </PropGroup>
          <PropGroup title="2.2 · Summary" border>
            <PropCalcRow label="Total SDL" value={totalSDL.toFixed(2)} unit="kPa" formula="Σ all SDL components" expr={`= ${wDead} + ${wCeiling} + ${wMep} + ${wPartitions}`} />
            <PropStaticRow label="Factor" value="1.2 (with L) or 1.4 (alone)" desc="same as D" />
            <PropStaticRow label="Code ref" value={`${codeRef} §4.2`} />
          </PropGroup>
        </div>
        <StaadCodeSection caseNumber={3} loadType="dead" title="SDL" members={members} />
      </div>

      {/* Card 3 — Live Load */}
      <div className="card">
        <div className="card-h"><span className="num-badge">3</span><span className="label">Live Load (L)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">occupancy live load · factor 1.6 primary / 1.0 companion</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
          <PropGroup title="3.1 · Floor Live Load">
            <PropInputRow label="LL" unit="kPa" value={wLive} onChange={setWLive} desc="design floor live load" />
            <PropSelectRow label="Occupancy" value={occupancy} opts={['Residential', 'Office', 'Assembly', 'Storage', 'Parking', 'Hospital', 'Industrial']} onChange={setOccupancy} />
            <PropStaticRow label="Code min" value={occupancyMinLL(occupancy)} unit="kPa" desc={`per ${codeRef} Table 205-1`} />
          </PropGroup>
          <PropGroup title="3.2 · Factors" border>
            <PropStaticRow label="Primary" value="1.6" desc="when L is the principal variable" />
            <PropStaticRow label="Companion" value="1.0" desc="when combined with W or E" />
            <PropStaticRow label="Pattern" value="0.5" desc="checkerboard pattern loading" />
          </PropGroup>
        </div>
        <StaadCodeSection caseNumber={4} loadType="live" title="LL" members={members} />
      </div>

      {/* Card 4 — Roof Live Load */}
      <div className="card">
        <div className="card-h"><span className="num-badge">4</span><span className="label">Roof Live Load (Lr)</span><span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">roof maintenance · factor 1.6 primary / 0.5 companion</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
          <PropGroup title="4.1 · Roof Live Load">
            <PropInputRow label="Lr" unit="kPa" value={wRoofLive} onChange={setWRoofLive} desc="roof live load" />
            <PropStaticRow label="Code min" value="0.60" unit="kPa" desc="ordinary flat roof" />
            <PropStaticRow label="Reducible" value="Yes" desc="per tributary area" />
          </PropGroup>
          <PropGroup title="4.2 · Factors" border>
            <PropStaticRow label="Primary" value="1.6" desc="1.2D + 1.6Lr + …" />
            <PropStaticRow label="Companion" value="0.5" desc="1.2D + 1.6L + 0.5Lr" />
          </PropGroup>
        </div>
        <StaadCodeSection caseNumber={5} loadType="roof_live" title="LR" members={members} />
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
        <StaadCodeSection caseNumber={1} loadType="seismic_x" title="Eqx" members={[]} />
        <StaadCodeSection caseNumber={2} loadType="seismic_z" title="Eqz" members={[]} />
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
        <StaadCodeSection caseNumber={6} loadType="wind_x" title="Wx_1" members={members} />
        <StaadCodeSection caseNumber={7} loadType="wind_x" title="Wx_2" members={members} />
        <StaadCodeSection caseNumber={8} loadType="wind_z" title="Wz_1" members={members} />
        <StaadCodeSection caseNumber={9} loadType="wind_z" title="Wz_2" members={members} />
      </div>
    </div>
  )
}

function occupancyMinLL(occ: string): string {
  const map: Record<string, string> = {
    Residential: '1.90', Office: '2.40', Assembly: '4.80',
    Storage: '6.00', Parking: '2.40', Hospital: '3.80', Industrial: '6.00',
  }
  return map[occ] ?? '1.90'
}
