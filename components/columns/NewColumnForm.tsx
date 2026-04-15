'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { createColumnDesignAction } from '@/app/actions/columns'

export function NewColumnForm({
  projectId,
  defaults,
}: {
  projectId: string
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

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set('project_id', projectId)
    setError(null)
    startTransition(async () => {
      const result = await createColumnDesignAction(formData)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/projects/${projectId}/columns/${result.columnId}`)
    })
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col">
      <div className="ch">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-text2)' }}>
          New column
        </span>
      </div>
      <div className="cb flex flex-col gap-2.5">
        <Field label="Label" name="label" placeholder="C-1" required />
        <Field
          label="STAAD member IDs"
          name="member_ids"
          placeholder="201, 202"
          help="Comma-separated. Every ID must be tagged as a column in STAAD."
          required
        />
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
          <p className="text-[11.5px]" style={{ color: 'var(--color-red)' }}>{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded px-3 py-2 text-[12.5px] font-semibold disabled:opacity-60"
          style={{ background: 'var(--color-blue)', color: '#fff' }}
        >
          {pending ? 'Creating…' : 'Create column design'}
        </button>
      </div>
    </form>
  )
}

function Field({
  label, name, placeholder, help, required,
}: {
  label: string
  name: string
  placeholder?: string
  help?: string
  required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text2)' }}>
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
        <span className="normal-case text-[10.5px]"
              style={{ color: 'var(--color-text2)' }}>{help}</span>
      ) : null}
    </label>
  )
}

function NumField({
  label, name, value,
}: {
  label: string
  name: string
  value: number
}) {
  return (
    <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text2)' }}>
      {label}
      <input
        type="number"
        name={name}
        defaultValue={value}
        step="1"
        className="mono border rounded px-2 py-1 text-[12px]"
        style={{ borderColor: 'var(--color-border)' }}
      />
    </label>
  )
}
