'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { createFootingDesignAction } from '@/app/actions/footings'

export function NewFootingForm({
  projectId,
  columns,
}: {
  projectId: string
  columns: { id: string; label: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set('project_id', projectId)
    setError(null)
    startTransition(async () => {
      const result = await createFootingDesignAction(formData)
      if (!result.ok) { setError(result.error); return }
      router.push(`/projects/${projectId}/footings/${result.footingId}`)
    })
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col">
      <div className="ch">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-text2)' }}>New footing</span>
      </div>
      <div className="cb flex flex-col gap-2.5">
        <Field label="Label" name="label" placeholder="F-1" required />
        <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wider"
               style={{ color: 'var(--color-text2)' }}>
          Type
          <select name="footing_type" defaultValue="isolated"
                  className="border rounded px-2 py-1 text-[12px] normal-case"
                  style={{ borderColor: 'var(--color-border)' }}>
            <option value="isolated">Isolated</option>
            <option value="combined">Combined</option>
            <option value="strip">Strip</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wider"
               style={{ color: 'var(--color-text2)' }}>
          Column (for Pu)
          <select name="column_design_id" defaultValue=""
                  className="border rounded px-2 py-1 text-[12px] normal-case"
                  style={{ borderColor: 'var(--color-border)' }}>
            <option value="">— none (use STAAD node below) —</option>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
        <NumField label="STAAD node ID (fallback)" name="node_id" value={0} allowZero />
        <div className="grid grid-cols-3 gap-2">
          <NumField label="Lx (mm)" name="length_x_mm" value={2000} />
          <NumField label="Ly (mm)" name="width_y_mm" value={2000} />
          <NumField label="Depth (mm)" name="depth_mm" value={500} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="qa (kPa)" name="bearing_capacity_kpa" value={200} />
          <NumField label="Soil depth (mm)" name="soil_depth_mm" value={1500} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <NumField label="f'c (MPa)" name="fc_mpa" value={28} />
          <NumField label="fy (MPa)" name="fy_mpa" value={420} />
          <NumField label="Cover (mm)" name="clear_cover_mm" value={75} />
        </div>
        {error ? (
          <p className="text-[11.5px]" style={{ color: 'var(--color-red)' }}>{error}</p>
        ) : null}
        <button type="submit" disabled={pending}
                className="rounded px-3 py-2 text-[12.5px] font-semibold disabled:opacity-60"
                style={{ background: 'var(--color-green)', color: '#fff' }}>
          {pending ? 'Creating…' : 'Create footing design'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, name, placeholder, required }: {
  label: string; name: string; placeholder?: string; required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text2)' }}>
      {label}{required ? ' *' : ''}
      <input type="text" name={name} placeholder={placeholder} required={required}
             className="normal-case border rounded px-2 py-1 text-[12px]"
             style={{ borderColor: 'var(--color-border)' }} />
    </label>
  )
}

function NumField({ label, name, value, allowZero }: {
  label: string; name: string; value: number; allowZero?: boolean
}) {
  return (
    <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text2)' }}>
      {label}
      <input type="number" name={name} defaultValue={allowZero ? '' : value} step="1"
             className="mono border rounded px-2 py-1 text-[12px]"
             style={{ borderColor: 'var(--color-border)' }} />
    </label>
  )
}
