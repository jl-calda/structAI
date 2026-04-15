'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { runColumnDesignAction } from '@/app/actions/columns'

export function RunColumnDesignButton({
  projectId,
  columnId,
}: {
  projectId: string
  columnId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{
    tone: 'ok' | 'warn' | 'err'
    text: string
  } | null>(null)

  const onClick = () => {
    setMessage(null)
    startTransition(async () => {
      const result = await runColumnDesignAction({
        projectId,
        columnDesignId: columnId,
      })
      if (!result.ok) {
        setMessage({ tone: 'err', text: result.error })
        return
      }
      setMessage({
        tone: result.status === 'pass' ? 'ok' : 'warn',
        text: `${result.status.toUpperCase()} · interaction ${(result.interaction_ratio * 100).toFixed(0)}%`,
      })
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60"
        style={{ background: 'var(--color-blue)', color: '#fff' }}
      >
        {pending ? 'Running…' : 'Run design'}
      </button>
      {message ? (
        <span
          className="text-[11.5px]"
          style={{
            color:
              message.tone === 'ok' ? 'var(--color-green)' :
              message.tone === 'warn' ? 'var(--color-amber)' :
              'var(--color-red)',
          }}
        >
          {message.text}
        </span>
      ) : null}
    </div>
  )
}
