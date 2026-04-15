'use client'

import { useEffect, useRef, useState } from 'react'

type Message = { role: 'user' | 'assistant'; content: string }

export function AssistantPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hi — I'm the StructAI assistant. Ask about beam capacities, " +
        "governing combos, slab deflection, anything in this project.",
    },
  ])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  const send = async () => {
    const text = input.trim()
    if (!text || pending) return
    setError(null)
    setInput('')
    const next: Message[] = [...messages, { role: 'user' as const, content: text }]
    setMessages([...next, { role: 'assistant' as const, content: '' }])
    setPending(true)
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, messages: next }),
      })
      if (!res.ok || !res.body) {
        const errBody = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}${errBody ? ` — ${errBody.slice(0, 120)}` : ''}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const events = buf.split('\n\n')
        buf = events.pop() ?? ''
        for (const ev of events) {
          const line = ev.trim()
          if (!line.startsWith('data:')) continue
          const json = line.slice(5).trim()
          try {
            const parsed = JSON.parse(json) as
              | { delta: string }
              | { done: true }
              | { error: string }
            if ('error' in parsed) {
              setError(parsed.error)
              continue
            }
            if ('delta' in parsed) {
              setMessages((prev) => {
                const out = prev.slice()
                out[out.length - 1] = {
                  role: 'assistant',
                  content: out[out.length - 1].content + parsed.delta,
                }
                return out
              })
            }
          } catch { /* ignore non-JSON lines */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      {/* Toggle button — bottom right */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed right-4 bottom-4 z-40 rounded-full px-3 py-2 text-[12px] font-semibold shadow"
        style={{
          background: 'var(--color-purple, #6B3FA0)',
          color: '#fff',
        }}
      >
        {open ? 'Close AI' : 'Ask AI'}
      </button>

      {open ? (
        <aside
          className="fixed right-4 bottom-16 z-40 flex flex-col rounded shadow-lg"
          style={{
            width: 360,
            maxHeight: '70vh',
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
          }}
        >
          <div
            className="px-3 py-2 flex items-center gap-2"
            style={{
              background: 'var(--color-surf2)',
              borderBottom: '0.5px solid var(--color-border)',
            }}
          >
            <span
              className="tag"
              style={{ background: 'var(--color-purple-l, #EDE4F5)', color: 'var(--color-purple, #6B3FA0)' }}
            >
              AI
            </span>
            <span className="text-[11.5px] font-semibold">StructAI assistant</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto text-[11px]"
              style={{ color: 'var(--color-text2)' }}
            >
              hide
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-2 flex flex-col gap-2 text-[12px]">
            {messages.map((m, i) => (
              <div
                key={i}
                className="rounded px-2 py-1.5"
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  background: m.role === 'user' ? 'var(--color-amber-l)' : 'var(--color-surf3)',
                  color: 'var(--color-text)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content || (m.role === 'assistant' && pending ? '…' : '')}
              </div>
            ))}
            {error ? (
              <div
                className="rounded px-2 py-1.5 text-[11px]"
                style={{ background: 'var(--color-red-l)', color: 'var(--color-red)' }}
              >
                {error}
              </div>
            ) : null}
          </div>

          <div className="p-2 flex items-center gap-2"
               style={{ borderTop: '0.5px solid var(--color-border)' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Ask about a beam, combo, MTO…"
              className="flex-1 border rounded px-2 py-1.5 text-[12px]"
              style={{ borderColor: 'var(--color-border)' }}
              disabled={pending}
            />
            <button
              type="button"
              onClick={send}
              disabled={pending || !input.trim()}
              className="rounded px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60"
              style={{
                background: 'var(--color-purple, #6B3FA0)',
                color: '#fff',
              }}
            >
              {pending ? '…' : 'Send'}
            </button>
          </div>
        </aside>
      ) : null}
    </>
  )
}
