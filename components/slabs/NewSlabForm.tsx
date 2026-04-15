'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { createSlabDesignAction } from '@/app/actions/slabs'

export function NewSlabForm({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set('project_id', projectId)
    setError(null)
    startTransition(async () => {
      const result = await createSlabDesignAction(formData)
      if (!result.ok) { setError(result.error); return }
      router.push(`/projects/${projectId}/slabs/${result.slabId}`)
    })
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col">
      <div className="ch">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-text2)' }}>New slab</span>
      </div>
      <div className="cb flex flex-col gap-2.5">
        <Field label="Label" name="label" placeholder="S-2A" required />
        <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wider"
               style={{ color: 'var(--color-text2)' }}>
          Slab type
          <select name="slab_type" defaultValue="two_way"
                  className="border rounded px-2 py-1 text-[12px] normal-case"
                  style={{ borderColor: 'var(--color-border)' }}>
            <option value="one_way">One-way</option>
            <option value="two_way">Two-way</option>
            <option value="flat_plate">Flat plate</option>
            <option value="flat_slab">Flat slab</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Lx (mm)" name="span_x_mm" value={4000} />
          <NumField label="Ly (mm)" name="span_y_mm" value={5000} />
        </div>
        <NumField label="Thickness (mm)" name="thickness_mm" value={150} />
        <div className="grid grid-cols-3 gap-2">
          <NumField label="SDL (kPa)" name="sdl_kpa" value={1.0} step={0.1} />
          <NumField label="LL (kPa)" name="ll_kpa" value={2.0} step={0.1} />
          <NumField label="Cover (mm)" name="clear_cover_mm" value={20} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="f'c (MPa)" name="fc_mpa" value={28} />
          <NumField label="fy (MPa)" name="fy_mpa" value={420} />
        </div>
        {error ? (
          <p className="text-[11.5px]" style={{ color: 'var(--color-red)' }}>{error}</p>
        ) : null}
        <button type="submit" disabled={pending}
                className="rounded px-3 py-2 text-[12.5px] font-semibold disabled:opacity-60"
                style={{ background: 'var(--color-teal)', color: '#fff' }}>
          {pending ? 'Creating…' : 'Create slab design'}
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

function NumField({ label, name, value, step }: {
  label: string; name: string; value: number; step?: number
}) {
  return (
    <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text2)' }}>
      {label}
      <input type="number" name={name} defaultValue={value} step={step ?? 1}
             className="mono border rounded px-2 py-1 text-[12px]"
             style={{ borderColor: 'var(--color-border)' }} />
    </label>
  )
}
