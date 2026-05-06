'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'

import { Icon } from '@/components/ui/Icon'

/**
 * TabBar — multi-document tab strip across the top of the center pane.
 *
 * State is encoded in the URL search param `tabs` as a comma-separated
 * list of `{kind}:{id}:{label}` triples (URL-encoded). Each opened
 * design page registers itself via the auto-add effect; clicking the X
 * removes a tab; clicking a tab navigates to it.
 */
type Tab = {
  kind: 'beam' | 'column' | 'slab' | 'footing'
  id: string
  label: string
  href: string
}

function parseTabs(raw: string | null, projectId: string): Tab[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(s => {
      const [kind, id, label] = s.split(':').map(decodeURIComponent)
      if (!kind || !id || !label) return null
      if (!['beam', 'column', 'slab', 'footing'].includes(kind)) return null
      const folder =
        kind === 'beam' ? 'beams'
          : kind === 'column' ? 'columns'
            : kind === 'slab' ? 'slabs' : 'footings'
      return {
        kind: kind as Tab['kind'],
        id,
        label,
        href: `/projects/${projectId}/${folder}/${id}`,
      }
    })
    .filter((t): t is Tab => t !== null)
}

function encodeTabs(tabs: Tab[]): string {
  return tabs
    .map(t => [t.kind, t.id, t.label].map(encodeURIComponent).join(':'))
    .join(',')
}

export function TabBar({
  projectId,
  current,
}: {
  projectId: string
  current?: { kind: 'beam' | 'column' | 'slab' | 'footing'; id: string; label: string }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const raw = params.get('tabs')
  const tabs = useMemo(() => parseTabs(raw, projectId), [raw, projectId])

  // Auto-add the current document if missing.
  useEffect(() => {
    if (!current) return
    const exists = tabs.some(t => t.kind === current.kind && t.id === current.id)
    if (exists) return
    const folder =
      current.kind === 'beam' ? 'beams'
        : current.kind === 'column' ? 'columns'
          : current.kind === 'slab' ? 'slabs' : 'footings'
    const next: Tab[] = [
      ...tabs,
      { ...current, href: `/projects/${projectId}/${folder}/${current.id}` },
    ]
    const next20 = next.slice(-20) // cap
    const sp = new URLSearchParams(params.toString())
    sp.set('tabs', encodeTabs(next20))
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
  }, [current, tabs, pathname, params, router, projectId])

  if (tabs.length === 0) return null

  const activeKey = current ? `${current.kind}:${current.id}` : ''

  const closeTab = (e: React.MouseEvent, t: Tab) => {
    e.preventDefault()
    e.stopPropagation()
    const next = tabs.filter(x => !(x.kind === t.kind && x.id === t.id))
    const sp = new URLSearchParams(params.toString())
    if (next.length === 0) sp.delete('tabs')
    else sp.set('tabs', encodeTabs(next))
    const isActive = `${t.kind}:${t.id}` === activeKey
    if (isActive && next.length > 0) {
      const fallback = next[next.length - 1]
      router.push(`${fallback.href}?${sp.toString()}`)
    } else if (isActive) {
      router.push(`/projects/${projectId}?${sp.toString()}`)
    } else {
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
    }
  }

  return (
    <div className="tabbar">
      {tabs.map(t => {
        const key = `${t.kind}:${t.id}`
        const isActive = key === activeKey
        const sp = new URLSearchParams(params.toString())
        sp.set('tabs', encodeTabs(tabs))
        const href = `${t.href}?${sp.toString()}`
        return (
          <Link key={key} href={href} className={'doc-tab ' + (isActive ? 'active' : '')}>
            <Icon
              name={t.kind === 'beam' ? 'beam' : t.kind === 'column' ? 'column' : t.kind === 'slab' ? 'slab' : 'footing'}
              size={11}
            />
            <span className="id">{t.label}</span>
            <button
              type="button"
              onClick={e => closeTab(e, t)}
              className="x"
              aria-label={`Close ${t.label}`}
              style={{ border: 0, background: 'transparent', cursor: 'pointer' }}
            >
              ×
            </button>
          </Link>
        )
      })}
    </div>
  )
}
