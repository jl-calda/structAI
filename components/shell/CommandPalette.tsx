'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { Icon } from '@/components/ui/Icon'

export type CommandItem = {
  kind: 'beam' | 'column' | 'slab' | 'footing'
  id: string
  label: string
  meta: string
  href: string
}

export function CommandPalette({ items }: { items: CommandItem[] }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        setQ('')
        setActive(0)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const filtered = useMemo(() => {
    if (!q.trim()) return items.slice(0, 20)
    const needle = q.toLowerCase()
    return items
      .filter(it => it.label.toLowerCase().includes(needle) || it.meta.toLowerCase().includes(needle))
      .slice(0, 20)
  }, [q, items])

  if (!open) return null

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15,17,21,0.35)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 480, maxWidth: '92vw',
          background: 'var(--color-panel)',
          border: '1px solid var(--color-line)',
          borderRadius: 8,
          boxShadow: '0 10px 40px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)' }}>
          <Icon name="search" size={14} />
          <input
            autoFocus
            value={q}
            onChange={e => { setQ(e.target.value); setActive(0) }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
              else if (e.key === 'Enter') {
                const it = filtered[active]
                if (it) { window.location.href = it.href; setOpen(false) }
              }
            }}
            placeholder="Search beams, columns, slabs, footings…"
            style={{ flex: 1, border: 0, outline: 0, fontSize: 13, fontFamily: 'var(--font-sans)' }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-ink-4)',
              padding: '1px 4px', border: '1px solid var(--color-line)', borderRadius: 2,
            }}
          >
            esc
          </span>
        </div>
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--color-ink-3)', fontSize: 12 }}>No results.</div>
          ) : (
            filtered.map((it, i) => (
              <Link
                key={`${it.kind}:${it.id}`}
                href={it.href}
                onClick={() => setOpen(false)}
                onMouseEnter={() => setActive(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px',
                  background: i === active ? 'var(--color-chrome-2)' : 'transparent',
                  color: 'var(--color-ink)',
                  textDecoration: 'none',
                  borderBottom: '1px solid var(--color-line-2)',
                }}
              >
                <Icon
                  name={it.kind === 'beam' ? 'beam' : it.kind === 'column' ? 'column' : it.kind === 'slab' ? 'slab' : 'footing'}
                  size={14}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--color-ink)' }}>{it.label}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>{it.meta}</div>
                </div>
                <span className="tag">{it.kind.toUpperCase()}</span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
