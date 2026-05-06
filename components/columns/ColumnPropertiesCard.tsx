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

export function ColumnPropertiesCard({
  initial,
  staadRef,
  code_standard,
}: {
  initial: {
    label: string
    b: number
    h: number
    height: number
    cover: number
    fc: number
    fy: number
  }
  staadRef?: string
  code_standard: CodeStandard
}) {
  const code = getCode(code_standard)

  const [b, setB] = useState(initial.b)
  const [h, setH] = useState(initial.h)
  const [height, setHeight] = useState(initial.height)
  const [cover, setCover] = useState(initial.cover)
  const [fc, setFc] = useState(initial.fc)
  const [fy, setFy] = useState(initial.fy)

  const Ag = (b * h / 1000).toFixed(0)
  const Ec = Math.round(4700 * Math.sqrt(fc))
  const beta1 = code.stress_block_depth_factor(fc)
  const codeRef = code_standard.replace(/_/g, ' ')
  // Radius of gyration r ≈ 0.3·h for rectangular column (simplified)
  const r = (0.3 * h).toFixed(0)
  const klu_r = (height / Number.parseFloat(r)).toFixed(1)

  return (
    <div className="card">
      <div className="card-h">
        <span className="num-badge">1</span>
        <span className="label">Member Properties</span>
        <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
          column geometry · materials · slenderness
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-line-2)' }}>
        <PropGroup title="1.1 · Identity">
          <PropTextRow label="Member ID" value={initial.label} />
          <PropTextRow label="Type" value="Column · Tied" />
          {staadRef && <PropTextRow label="STAAD ref" value={staadRef} mono />}
          <PropSelectRow label="Class" value="SMRF" opts={['SMRF', 'IMRF', 'OMRF']} />
          <PropSelectRow label="Bracing" value="Non-sway" opts={['Non-sway', 'Sway']} />
        </PropGroup>

        <PropGroup title="1.2 · Geometry" border>
          <PropInputRow label="b" unit="mm" value={b} onChange={setB} desc="width" />
          <PropInputRow label="h" unit="mm" value={h} onChange={setH} desc="depth" />
          <PropInputRow label="H" unit="mm" value={height} onChange={setHeight} desc="unbraced ht" />
          <PropInputRow label="c" unit="mm" value={cover} onChange={setCover} desc="clear cover" />
          <PropCalcRow
            label="Ag" value={`${Ag}×10³`} unit="mm²"
            formula="b · h" expr={`${b} · ${h}`}
          />
          <PropCalcRow
            label="r" value={`${r}`} unit="mm"
            formula="r ≈ 0.3·h    (rect.)"
            expr={`= 0.3 · ${h}`}
          />
          <PropCalcRow
            label="kL/r" value={klu_r} unit="—"
            formula="kL/r — slenderness"
            expr={`k=1.0, L=${height}`}
          />
        </PropGroup>

        <PropGroup title="1.3 · Materials">
          <PropInputRow label="fc′" unit="MPa" value={fc} onChange={setFc} desc="concrete" />
          <PropInputRow label="fy" unit="MPa" value={fy} onChange={setFy} desc="long. bar" />
          <PropStaticRow label="fyt" value="420" unit="MPa" desc="tie" />
          <PropCalcRow
            label="Ec" value={`${Ec}`} unit="MPa"
            formula="Ec = 4700·√fc′"
            expr={`= 4700·√${fc}`}
          />
          <PropCalcRow
            label="β1" value={beta1.toFixed(3)} unit="—"
            formula={`code.stress_block_depth_factor(${fc})   [${codeRef}]`}
            expr={`= ${beta1.toFixed(3)}`}
          />
        </PropGroup>

        <PropGroup title="1.4 · Loading" border>
          <PropStaticRow label="Pu" value="—" unit="kN" desc="from STAAD or manual" />
          <PropStaticRow label="Mu major" value="—" unit="kN·m" />
          <PropStaticRow label="Mu minor" value="—" unit="kN·m" />
          <PropStaticRow label="Vu" value="—" unit="kN" />
          <PropSelectRow label="Cm" value="0.6 + 0.4·M1/M2" opts={['1.0', '0.6 + 0.4·M1/M2', 'Custom']} />
        </PropGroup>
      </div>
    </div>
  )
}
