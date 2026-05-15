'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { createBeamDesignAction } from '@/app/actions/beams'
import { MemberPicker3D, type MemberInfo } from '@/components/staad/MemberPicker3D'
import type { MemberLite, NodeLite } from '@/components/staad/FrameViewer3D'
import type { MemberRow, NodeRow } from '@/lib/data/staad'

export function NewBeamForm({
  projectId,
  nodes,
  members,
  defaults,
}: {
  projectId: string
  nodes: NodeRow[]
  members: MemberRow[]
  defaults: {
    fc_mpa: number
    fy_mpa: number
    fys_mpa: number
    clear_cover_mm: number
  }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'staad' | 'manual'>('manual')
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([])

  const available: MemberInfo[] = members
    .filter((m) => m.member_type === 'beam')
    .map((m) => ({
      member_id: m.member_id,
      section_name: m.section_name,
      length_mm: m.length_mm,
      member_type: m.member_type,
    }))

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set('project_id', projectId)
    formData.set('input_mode', mode)
    if (mode === 'staad') {
      if (selectedMemberIds.length === 0) {
        setError('Pick at least one STAAD member.')
        return
      }
      formData.set('member_ids', selectedMemberIds.join(','))
    }
    setError(null)
    startTransition(async () => {
      const result = await createBeamDesignAction(formData)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/projects/${projectId}/beams/${result.beamId}`)
    })
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col">
      <div className="ch">
        <span
          className="text-[11.5px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text2)' }}
        >
          New beam
        </span>
      </div>
      <div className="cb flex flex-col gap-2.5">
        <div className="flex gap-1">
          <ModeBtn active={mode === 'manual'} onClick={() => setMode('manual')}>
            Manual
          </ModeBtn>
          <ModeBtn active={mode === 'staad'} onClick={() => setMode('staad')}>
            STAAD
          </ModeBtn>
        </div>

        <div className="grid grid-cols-2 gap-3" style={{ alignItems: 'start' }}>
          <div className="flex flex-col gap-2.5">
            <Field label="Label" name="label" placeholder="B-1" required />

            {mode === 'manual' && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <NumField label="b (mm)" name="b_mm" value={300} />
                  <NumField label="h (mm)" name="h_mm" value={600} />
                  <NumField label="Span (mm)" name="total_span_mm" value={6000} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumField label="wu (kN/m)" name="manual_wu_kn_m" value={30} />
                  <NumField label="Pu mid (kN)" name="manual_pu_mid_kn" value={0} />
                </div>
                <label
                  className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}
                >
                  Support
                  <select
                    name="support_condition"
                    defaultValue="simply_supported"
                    className="border rounded px-2 py-1 text-[12px] normal-case"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <option value="simply_supported">Simply supported</option>
                    <option value="fixed_fixed">Fixed-Fixed</option>
                    <option value="fixed_pinned">Fixed-Pinned</option>
                    <option value="cantilever">Cantilever</option>
                    <option value="continuous">Continuous</option>
                  </select>
                </label>
              </>
            )}

            <div className="grid grid-cols-3 gap-2">
              <NumField label="f'c (MPa)" name="fc_mpa" value={defaults.fc_mpa} />
              <NumField label="fy (MPa)" name="fy_mpa" value={defaults.fy_mpa} />
              <NumField label="fys (MPa)" name="fys_mpa" value={defaults.fys_mpa} />
            </div>
            <NumField
              label="Clear cover (mm)"
              name="clear_cover_mm"
              value={defaults.clear_cover_mm}
            />

            {error ? (
              <p className="text-[11.5px]" style={{ color: 'var(--color-red)' }}>
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="rounded px-3 py-2 text-[12.5px] font-semibold disabled:opacity-60"
              style={{ background: 'var(--color-amber)', color: '#fff' }}
            >
              {pending ? 'Creating…' : 'Create beam design'}
            </button>
          </div>

          {mode === 'staad' && (
            <div className="flex flex-col gap-1.5">
              <span
                className="text-[10.5px] uppercase tracking-wider"
                style={{ color: 'var(--color-text2)' }}
              >
                STAAD members
              </span>
              <MemberPicker3D
                projectId={projectId}
                nodes={nodes as NodeLite[]}
                members={members as MemberLite[]}
                available={available}
                selected={selectedMemberIds}
                onChange={setSelectedMemberIds}
              />
              <span
                className="text-[10.5px] normal-case"
                style={{ color: 'var(--color-text2)' }}
              >
                Click beams in the 3D view or pick from the dropdown.
                Multiple selections allowed.
              </span>
            </div>
          )}
        </div>
      </div>
    </form>
  )
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
      style={{
        background: active ? 'var(--color-amber)' : 'transparent',
        color: active ? '#fff' : 'var(--color-text2)',
        border: active ? 'none' : '1px solid var(--color-border)',
      }}
    >
      {children}
    </button>
  )
}

function Field({
  label,
  name,
  placeholder,
  help,
  required,
}: {
  label: string
  name: string
  placeholder?: string
  help?: string
  required?: boolean
}) {
  return (
    <label
      className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wider"
      style={{ color: 'var(--color-text2)' }}
    >
      {label}{required ? ' *' : ''}
      <input
        type="text"
        name={name}
        placeholder={placeholder}
        required={required}
        className="normal-case border rounded px-2 py-1 text-[12px]"
        style={{ borderColor: 'var(--color-border)' }}
      />
      {help ? (
        <span
          className="normal-case text-[10.5px]"
          style={{ color: 'var(--color-text2)' }}
        >
          {help}
        </span>
      ) : null}
    </label>
  )
}

function NumField({
  label,
  name,
  value,
}: {
  label: string
  name: string
  value: number
}) {
  return (
    <label
      className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wider"
      style={{ color: 'var(--color-text2)' }}
    >
      {label}
      <input
        type="number"
        name={name}
        defaultValue={value}
        step="any"
        className="mono border rounded px-2 py-1 text-[12px]"
        style={{ borderColor: 'var(--color-border)' }}
      />
    </label>
  )
}
