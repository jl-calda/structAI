'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { recheckColumnAction } from '@/app/actions/rebar'

/**
 * Interactive rebar editor for a single column. Matches the fields on
 * docs/10-ui-layouts.md § Column Design § Col 1 — vertical bar count +
 * dia, tie dia + spacing, plus the seismic end-zone fields (end spacing
 * + end-zone length).
 */
export type ColumnRebarInit = {
  bar_dia_mm: number
  bar_count: number
  tie_dia_mm: number
  tie_spacing_mm: number
  tie_spacing_end_mm: number
  tie_end_zone_length_mm: number
}

type ResultBar = {
  tone: 'ok' | 'warn' | 'err'
  text: string
}

const BAR_DIAS = [16, 20, 25, 28, 32, 36]
const TIE_DIAS = [10, 12, 16]

export function ColumnRebarEditor({
  projectId,
  columnDesignId,
  initial,
  initialInteraction,
  initialRho,
}: {
  projectId: string
  columnDesignId: string
  initial: ColumnRebarInit
  initialInteraction: number | null
  initialRho: number | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [bar_dia_mm, setBarDia] = useState(initial.bar_dia_mm)
  const [bar_count, setBarCount] = useState(initial.bar_count)
  const [tie_dia_mm, setTieDia] = useState(initial.tie_dia_mm)
  const [tie_spacing_mm, setTieSpacing] = useState(initial.tie_spacing_mm)
  const [tie_spacing_end_mm, setTieSpacingEnd] = useState(initial.tie_spacing_end_mm)
  const [tie_end_zone_length_mm, setTieEndZoneLength] = useState(initial.tie_end_zone_length_mm)

  const [result, setResult] = useState<ResultBar>(() => {
    if (initialInteraction === null || initialRho === null) {
      return { tone: 'warn', text: 'Run design first to establish a baseline.' }
    }
    return {
      tone: initialInteraction <= 1 ? 'ok' : 'warn',
      text: `interaction ${(initialInteraction * 100).toFixed(0)}% · ρ ${initialRho.toFixed(2)}%`,
    }
  })

  const onRecheck = () => {
    startTransition(async () => {
      const r = await recheckColumnAction({
        projectId,
        columnDesignId,
        rebar: {
          bar_dia_mm,
          bar_count,
          tie_dia_mm,
          tie_spacing_mm,
          tie_spacing_end_mm,
          tie_end_zone_length_mm,
        },
      })
      if (!r.ok) {
        setResult({ tone: 'err', text: r.error })
        return
      }
      const d = r.data
      setResult({
        tone: d.overall === 'pass' ? 'ok' : 'warn',
        text:
          `${d.overall.toUpperCase()} · interaction ${(d.interaction_ratio * 100).toFixed(0)}% · ` +
          `ρ ${d.rho_percent.toFixed(2)}% ${d.rho_min_ok ? '≥' : '<'} 1% ${d.rho_max_ok ? '≤' : '>'} 8%`,
      })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <RebarBox tone="amber" title="VERTICAL BARS">
        <Row>
          <Label>Count × Dia</Label>
          <div className="flex items-center gap-1">
            <CountInput value={bar_count} onChange={setBarCount} min={4} max={24} />
            <span className="text-[11px]" style={{ color: 'var(--color-text2)' }}>×</span>
            <DiaSelect value={bar_dia_mm} options={BAR_DIAS} onChange={setBarDia} />
          </div>
        </Row>
      </RebarBox>

      <RebarBox tone="teal" title="TIES">
        <Row>
          <Label>Dia</Label>
          <DiaSelect value={tie_dia_mm} options={TIE_DIAS} onChange={setTieDia} />
        </Row>
        <Row>
          <Label>Mid spacing</Label>
          <NumberInput value={tie_spacing_mm} onChange={setTieSpacing} suffix="mm" />
        </Row>
        <Row>
          <Label>End spacing</Label>
          <NumberInput value={tie_spacing_end_mm} onChange={setTieSpacingEnd} suffix="mm" />
        </Row>
        <Row>
          <Label>End zone L</Label>
          <NumberInput value={tie_end_zone_length_mm} onChange={setTieEndZoneLength} suffix="mm" />
        </Row>
      </RebarBox>

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
        style={{ background: 'var(--color-blue)', color: '#fff' }}
      >
        {pending ? 'Re-checking…' : 'Re-check'}
      </button>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────

function RebarBox({
  title, children, tone,
}: {
  title: string
  children: React.ReactNode
  tone?: 'amber' | 'teal'
}) {
  const bg =
    tone === 'amber' ? 'var(--color-amber-l)' :
    tone === 'teal' ? 'var(--color-teal-l)' :
    'transparent'
  return (
    <div className="rounded border px-2 py-1.5"
         style={{ background: bg, borderColor: 'var(--color-border)' }}>
      <div className="text-[9.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text2)' }}>
        {title}
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
  value, onChange, min = 0, max = 24,
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

function NumberInput({
  value, onChange, suffix,
}: {
  value: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        step={25}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10) || 0)}
        className="mono border rounded px-1 py-0.5 text-[11.5px] w-20 text-right"
        style={{ borderColor: 'var(--color-border)' }}
      />
      {suffix ? (
        <span className="text-[10px]" style={{ color: 'var(--color-text2)' }}>{suffix}</span>
      ) : null}
    </div>
  )
}
