'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { runBeamDesignAction } from '@/app/actions/beams'

export function RunDesignButton({
  projectId,
  beamId,
}: {
  projectId: string
  beamId: string
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
      const result = await runBeamDesignAction({
        projectId,
        beamDesignIds: [beamId],
      })
      if (!result.ok) {
        setMessage({ tone: 'err', text: result.error })
        return
      }
      const first = result.beams[0]
      if (first?.overall === 'pass') {
        setMessage({
          tone: 'ok',
          text: `Design passed in ${result.iterations} iteration${result.iterations === 1 ? '' : 's'}.`,
        })
      } else {
        setMessage({
          tone: 'warn',
          text:
            result.reason ??
            `Design did not converge after ${result.iterations} iteration${result.iterations === 1 ? '' : 's'}.`,
        })
      }
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
        style={{ background: 'var(--color-amber)', color: '#fff' }}
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
