'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { recheckBeamAction } from '@/app/actions/rebar'
import type { BeamTensionLayer } from '@/lib/supabase/types'

/**
 * Interactive rebar editor for a single beam. Matches the three-panel
 * layout in docs/10-ui-layouts.md § Beam Design § Col 2:
 *
 *   PERIMETER box (amber, locked count=4) — dia dropdown.
 *   ADDITIONAL TENSION — up to two layers, count + dia + bent-down toggle.
 *   COMPRESSION As' box (teal) — count + dia.
 *   STIRRUP row — dia + legs.
 *   Result bar: "As = X ≥ req Y ✓" / "✗" from last re-check.
 *   Re-check button.
 *
 * On mount the component is seeded with the current beam_reinforcement
 * row (from the server page). Changes stay local until the user clicks
 * "Re-check" — then we POST to /api/design/beam/check and refresh the
 * surrounding page.
 */
export type BeamRebarInit = {
  perimeter_dia_mm: number
  tension_layers: BeamTensionLayer[]
  compression_dia_mm: number
  compression_count: number
  stirrup_dia_mm: number
  stirrup_legs: number
}

type ResultBar = {
  tone: 'ok' | 'warn' | 'err'
  as_provided?: number
  as_required?: number
  phi_Mn_pos?: number
  Mu_pos?: number
  phi_Vn?: number
  Vu?: number
  overall?: 'pass' | 'fail'
  text: string
}

const BAR_DIAS = [10, 12, 16, 20, 25, 28, 32]
const STIRRUP_DIAS = [10, 12, 16]

export function BeamRebarEditor({
  projectId,
  beamDesignId,
  initial,
  initialProvidedAs,
  initialRequiredAs,
}: {
  projectId: string
  beamDesignId: string
  initial: BeamRebarInit
  initialProvidedAs: number
  initialRequiredAs: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [perimeter_dia_mm, setPerimeterDia] = useState(initial.perimeter_dia_mm)

  // Keep two tension-layer slots so the UI is stable; count=0 means
  // "not present". When sending to the API we filter out zero-count.
  const seeded = initial.tension_layers
  const [l1, setL1] = useState({
    count: seeded[0]?.count ?? 0,
    dia_mm: seeded[0]?.dia_mm ?? 20,
    bent_down: seeded[0]?.bent_down ?? true,
  })
  const [l2, setL2] = useState({
    count: seeded[1]?.count ?? 0,
    dia_mm: seeded[1]?.dia_mm ?? 20,
    bent_down: seeded[1]?.bent_down ?? false,
  })

  const [compression_dia_mm, setCompDia] = useState(initial.compression_dia_mm || 20)
  const [compression_count, setCompCount] = useState(initial.compression_count)
  const [stirrup_dia_mm, setStirrupDia] = useState(initial.stirrup_dia_mm)
  const [stirrup_legs, setStirrupLegs] = useState(initial.stirrup_legs)

  const [result, setResult] = useState<ResultBar>({
    tone: initialProvidedAs >= initialRequiredAs ? 'ok' : 'warn',
    as_provided: initialProvidedAs,
    as_required: initialRequiredAs,
    text:
      initialProvidedAs > 0
        ? `As = ${initialProvidedAs.toFixed(0)} ≥ req ${initialRequiredAs.toFixed(0)} mm² ${initialProvidedAs >= initialRequiredAs ? '✓' : '✗'}`
        : 'Run design first to establish a baseline.',
  })

  const onRecheck = () => {
    const tension_layers: BeamTensionLayer[] = []
    if (l1.count > 0) {
      tension_layers.push({ layer: 1, dia_mm: l1.dia_mm, count: l1.count, bent_down: l1.bent_down })
    }
    if (l2.count > 0) {
      tension_layers.push({ layer: 2, dia_mm: l2.dia_mm, count: l2.count, bent_down: l2.bent_down })
    }

    startTransition(async () => {
      const r = await recheckBeamAction({
        projectId,
        beamDesignId,
        rebar: {
          perimeter_dia_mm,
          tension_layers,
          compression_dia_mm,
          compression_count,
          stirrup_dia_mm,
          stirrup_legs,
        },
      })
      if (!r.ok) {
        setResult({ tone: 'err', text: r.error })
        return
      }
      const d = r.data
      setResult({
        tone: d.overall === 'pass' ? 'ok' : 'warn',
        as_provided: d.as_provided_mm2,
        as_required: d.as_required_mm2,
        phi_Mn_pos: d.phi_Mn_pos_kNm,
        Mu_pos: d.Mu_pos_kNm,
        phi_Vn: d.phi_Vn_kN,
        Vu: d.Vu_kN,
        overall: d.overall,
        text:
          `${d.overall.toUpperCase()} · As = ${d.as_provided_mm2.toFixed(0)} ≥ ${d.as_required_mm2.toFixed(0)} mm² · ` +
          `φMn+ ${d.phi_Mn_pos_kNm.toFixed(1)} ≥ Mu+ ${d.Mu_pos_kNm.toFixed(1)} · ` +
          `φVn ${d.phi_Vn_kN.toFixed(1)} ≥ Vu ${d.Vu_kN.toFixed(1)}`,
      })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {/* PERIMETER — locked at 4 corners */}
      <RebarBox tone="amber" title="PERIMETER" locked>
        <Row>
          <Label>Count</Label>
          <span className="mono text-[11.5px]"
                style={{ color: 'var(--color-text2)' }}>
            4 (locked)
          </span>
        </Row>
        <Row>
          <Label>Dia</Label>
          <DiaSelect
            value={perimeter_dia_mm}
            options={BAR_DIAS}
            onChange={setPerimeterDia}
          />
        </Row>
      </RebarBox>

      {/* ADDITIONAL TENSION */}
      <RebarBox title="ADDITIONAL TENSION">
        <LayerRow
          label="L1"
          value={l1}
          onChange={setL1}
        />
        <LayerRow
          label="L2"
          value={l2}
          onChange={setL2}
        />
      </RebarBox>

      {/* COMPRESSION */}
      <RebarBox tone="teal" title="COMPRESSION As'">
        <Row>
          <Label>Count × Dia</Label>
          <div className="flex items-center gap-1">
            <CountInput value={compression_count} onChange={setCompCount} />
            <span className="text-[11px]" style={{ color: 'var(--color-text2)' }}>×</span>
            <DiaSelect
              value={compression_dia_mm}
              options={BAR_DIAS}
              onChange={setCompDia}
            />
          </div>
        </Row>
      </RebarBox>

      {/* STIRRUPS */}
      <RebarBox title="STIRRUPS">
        <Row>
          <Label>Dia × legs</Label>
          <div className="flex items-center gap-1">
            <DiaSelect
              value={stirrup_dia_mm}
              options={STIRRUP_DIAS}
              onChange={setStirrupDia}
            />
            <span className="text-[11px]" style={{ color: 'var(--color-text2)' }}>×</span>
            <CountInput value={stirrup_legs} onChange={setStirrupLegs} min={2} max={6} />
          </div>
        </Row>
      </RebarBox>

      {/* Result bar */}
      <div
        className="rounded px-2 py-1.5 text-[11px] mono"
        style={{
          background:
            result.tone === 'ok' ? 'var(--color-green-l)' :
            result.tone === 'warn' ? 'var(--color-amber-l)' :
            'var(--color-red-l)',
          color:
            result.tone === 'ok' ? 'var(--color-green)' :
            result.tone === 'warn' ? 'var(--color-amber)' :
            'var(--color-red)',
        }}
      >
        {result.text}
      </div>

      <button
        type="button"
        onClick={onRecheck}
        disabled={pending}
        className="rounded px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60"
        style={{ background: 'var(--color-amber)', color: '#fff' }}
      >
        {pending ? 'Re-checking…' : 'Re-check'}
      </button>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────

function RebarBox({
  title, children, tone, locked,
}: {
  title: string
  children: React.ReactNode
  tone?: 'amber' | 'teal'
  locked?: boolean
}) {
  const bg =
    tone === 'amber' ? 'var(--color-amber-l)' :
    tone === 'teal' ? 'var(--color-teal-l)' :
    'transparent'
  return (
    <div className="rounded border px-2 py-1.5"
         style={{ background: bg, borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between text-[9.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text2)' }}>
        <span>{title}</span>
        {locked ? <span>🔒</span> : null}
      </div>
      <div className="mt-1 flex flex-col gap-1">{children}</div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11.5px]">
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="uppercase tracking-wider text-[10px]"
          style={{ color: 'var(--color-text2)' }}>
      {children}
    </span>
  )
}

function DiaSelect({
  value, options, onChange,
}: {
  value: number
  options: number[]
  onChange: (v: number) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
      className="mono border rounded px-1 py-0.5 text-[11.5px]"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {options.map((d) => (
        <option key={d} value={d}>Ø{d}</option>
      ))}
    </select>
  )
}

function CountInput({
  value, onChange, min = 0, max = 20,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={1}
      onChange={(e) => onChange(Number.parseInt(e.target.value, 10) || 0)}
      className="mono border rounded px-1 py-0.5 text-[11.5px] w-14 text-right"
      style={{ borderColor: 'var(--color-border)' }}
    />
  )
}

function LayerRow({
  label, value, onChange,
}: {
  label: string
  value: { count: number; dia_mm: number; bent_down: boolean }
  onChange: (v: { count: number; dia_mm: number; bent_down: boolean }) => void
}) {
  return (
    <Row>
      <Label>{label}</Label>
      <div className="flex items-center gap-1">
        <CountInput
          value={value.count}
          onChange={(count) => onChange({ ...value, count })}
        />
        <span className="text-[11px]" style={{ color: 'var(--color-text2)' }}>×</span>
        <DiaSelect
          value={value.dia_mm}
          options={BAR_DIAS}
          onChange={(dia_mm) => onChange({ ...value, dia_mm })}
        />
        <label className="flex items-center gap-1 text-[10px]"
               style={{ color: 'var(--color-text2)' }}>
          <input
            type="checkbox"
            checked={value.bent_down}
            onChange={(e) => onChange({ ...value, bent_down: e.target.checked })}
          />
          bent
        </label>
      </div>
    </Row>
  )
}
