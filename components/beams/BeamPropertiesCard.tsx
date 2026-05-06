'use client'

import { useState } from 'react'

import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'

import {
  PropCalcRow,
  PropGroup,
  PropInputRow,
  PropSelectRow,
  PropStaticRow,
  PropTextRow,
} from '@/components/ui/PropRow'
import type { CodeStandard } from '@/lib/supabase/types'

export function BeamPropertiesCard({
  initial,
  staadRef,
  code_standard,
}: {
  initial: {
    label: string
    floor?: string
    b: number
    h: number
    span: number
    cover: number
    fc: number
    fy: number
  }
  staadRef?: string
  code_standard: CodeStandard
}) {
  const [b, setB] = useState(initial.b)
  const [h, setH] = useState(initial.h)
  const [span, setSpan] = useState(initial.span)
  const [cover, setCover] = useState(initial.cover)
  const [fc, setFc] = useState(initial.fc)
  const [fy, setFy] = useState(initial.fy)

  const code = getCode(code_standard)

  const dEff = h - cover - 20
  const dPrime = cover + 10 + 10
  const Ag = (b * h / 1000).toFixed(0)
  const Ec = Math.round(4700 * Math.sqrt(fc))
  const beta1 = code.stress_block_depth_factor(fc)
  const wsw = (b * h * 24) / 1e6
  const codeRef = code_standard.replace(/_/g, ' ')

  return (
    <div className="card">
      <div className="card-h">
        <span className="num-badge">1</span>
        <span className="label">Member Properties</span>
        <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
          geometry · materials · supports
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
        <PropGroup title="1.1 · Identity">
          <PropTextRow label="Member ID" value={initial.label} />
          {initial.floor && <PropTextRow label="Floor" value={initial.floor} />}
          <PropTextRow label="Type" value="Beam · Continuous" />
          {staadRef && <PropTextRow label="STAAD ref" value={staadRef} mono />}
          <PropSelectRow label="Class" value="SMRF" opts={['SMRF', 'IMRF', 'OMRF']} />
          <PropSelectRow label="Exposure" value="Interior" opts={['Interior', 'Exterior', 'Marine']} />
        </PropGroup>

        <PropGroup title="1.2 · Geometry" border>
          <PropInputRow label="b" unit="mm" value={b} onChange={setB} desc="width" />
          <PropInputRow label="h" unit="mm" value={h} onChange={setH} desc="depth" />
          <PropInputRow label="L" unit="mm" value={span} onChange={setSpan} desc="span (c-to-c)" />
          <PropInputRow label="c" unit="mm" value={cover} onChange={setCover} desc="clear cover" />
          <PropCalcRow
            label="d" value={`${dEff}`} unit="mm"
            formula="h − c − dstir − db/2"
            expr={`${h} − ${cover} − 10 − 20/2`}
          />
          <PropCalcRow
            label="d′" value={`${dPrime}`} unit="mm"
            formula="c + dstir + dperim/2"
            expr={`${cover} + 10 + 20/2`}
          />
          <PropCalcRow
            label="Ag" value={`${Ag}×10³`} unit="mm²"
            formula="b · h" expr={`${b} · ${h}`}
          />
        </PropGroup>

        <PropGroup title="1.3 · Materials">
          <PropInputRow label="fc′" unit="MPa" value={fc} onChange={setFc} desc="concrete" />
          <PropInputRow label="fy" unit="MPa" value={fy} onChange={setFy} desc="long. bar" />
          <PropStaticRow label="fyt" value="420" unit="MPa" desc="stirrup" />
          <PropCalcRow
            label="Ec" value={`${Ec}`} unit="MPa"
            formula="Ec = 4700·√fc′    [§19.2.2.1]"
            expr={`= 4700·√${fc}`}
          />
          <PropCalcRow
            label="β1" value={beta1.toFixed(3)} unit="—"
            formula={`code.stress_block_depth_factor(${fc})    [${codeRef}]`}
            expr={`= ${beta1.toFixed(3)}`}
          />
          <PropStaticRow label="γc" value="24" unit="kN/m³" />
          <PropSelectRow label="Aggregate" value="Normal" opts={['Normal', 'Light', 'Sand-Lt']} />
        </PropGroup>

        <PropGroup title="1.4 · Supports &amp; Boundary" border>
          <PropSelectRow label="End i" value="Continuous" opts={['Pinned', 'Fixed', 'Continuous', 'Cantilever']} />
          <PropSelectRow label="End j" value="Continuous" opts={['Pinned', 'Fixed', 'Continuous', 'Cantilever']} />
          <PropInputRow label="Lu" unit="mm" value={span} onChange={() => {}} desc="unbraced len" />
          <PropCalcRow
            label="kL/r" value="38.4" unit="—"
            formula="kL/r — slenderness (lat-tors)"
            expr={`k=1.0, L=${span}`}
          />
          <PropSelectRow label="Lat sys" value="Beam-only" opts={['Beam-only', 'Slab-on', 'T-beam', 'L-beam']} />
          <PropCalcRow
            label="wsw" value={wsw.toFixed(2)} unit="kN/m"
            formula="wsw = b·h·γc"
            expr={`= ${b}·${h}·24 / 10⁶`}
          />
        </PropGroup>
      </div>
    </div>
  )
}
