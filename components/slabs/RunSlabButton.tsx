'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { runSlabDesignAction } from '@/app/actions/slabs'

export function RunSlabButton({ projectId, slabId }: {
  projectId: string; slabId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null)

  const onClick = () => {
    setMessage(null)
    startTransition(async () => {
      const result = await runSlabDesignAction({ projectId, slabDesignId: slabId })
      if (!result.ok) { setMessage({ tone: 'err', text: result.error }); return }
      setMessage({
        tone: result.status === 'pass' ? 'ok' : 'warn',
        text: `${result.status.toUpperCase()}`,
      })
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onClick} disabled={pending}
              className="rounded px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60"
              style={{ background: 'var(--color-teal)', color: '#fff' }}>
        {pending ? 'Running…' : 'Run design'}
      </button>
      {message ? (
        <span className="text-[11.5px]" style={{
          color:
            message.tone === 'ok' ? 'var(--color-green)' :
            message.tone === 'warn' ? 'var(--color-amber)' :
            'var(--color-red)',
        }}>{message.text}</span>
      ) : null}
    </div>
  )
}
