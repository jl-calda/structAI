'use client'

import { useActionState, useState } from 'react'

import { createProject } from '@/app/actions/projects'
import { CODE_STANDARDS } from '@/lib/constants'

type CreateState = { ok: boolean; error?: string } | null

/**
 * "+ New Project" card at the end of the projects grid.
 * Clicks open an inline form rendered in-card; submission goes to the
 * `createProject` server action which redirects to the new project page.
 */
export function NewProjectCard() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<CreateState, FormData>(
    async (_prev, formData) => {
      const result = await createProject(formData)
      return result ?? null
    },
    null,
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card flex items-center justify-center min-h-[140px] border-dashed
                   hover:bg-[var(--color-surf2)] transition-colors text-[13px]"
        style={{ color: 'var(--color-text2)' }}
      >
        + New Project
      </button>
    )
  }

  return (
    <form action={formAction} className="card flex flex-col">
      <div className="ch">
        <span className="text-[12px] font-semibold">New Project</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-[11px]"
          style={{ color: 'var(--color-text2)' }}
        >
          Cancel
        </button>
      </div>
      <div className="cb flex flex-col gap-2">
        <Field name="name" label="Name" required />
        <Field name="client" label="Client" />
        <Field name="location" label="Location" />
        <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wider"
               style={{ color: 'var(--color-text2)' }}>
          Code standard
          <select
            name="code_standard"
            defaultValue="NSCP_2015"
            className="border rounded px-2 py-1 text-[12px] normal-case"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {CODE_STANDARDS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>

        {state?.error ? (
          <p className="text-[11px]" style={{ color: 'var(--color-red)' }}>
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60"
          style={{ background: 'var(--color-amber)', color: '#fff' }}
        >
          {pending ? 'Creating…' : 'Create project'}
        </button>
      </div>
    </form>
  )
}

function Field({
  name,
  label,
  required,
}: {
  name: string
  label: string
  required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text2)' }}>
      {label}{required ? ' *' : ''}
      <input
        type="text"
        name={name}
        required={required}
        className="border rounded px-2 py-1 text-[12px] normal-case"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
      />
    </label>
  )
}
