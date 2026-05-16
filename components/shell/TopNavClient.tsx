'use client'

import Link from 'next/link'
import { useSelectedLayoutSegments } from 'next/navigation'
import { useRouter } from 'next/navigation'

import { Icon } from '@/components/ui/Icon'

type ProjectChoice = { id: string; name: string }

export function TopNavClient({
  title,
  projectId,
  projects,
}: {
  title?: string
  projectId?: string
  codeStandard?: string
  projects: ProjectChoice[]
}) {
  const router = useRouter()
  const segments = useSelectedLayoutSegments()
  const crumb = buildCrumb(segments)

  const onProjectChange = (id: string) => {
    if (id && id !== projectId) router.push(`/projects/${id}`)
  }

  const onSearchClick = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
    }
  }

  return (
    <div className="topbar">
      <div className="row" style={{ gap: 6 }}>
        <Link href="/dashboard" style={{ fontWeight: 600, letterSpacing: '-0.02em', textDecoration: 'none', color: 'inherit' }}>
          StructAI
        </Link>
        <span style={{ color: 'var(--color-ink-5)' }}>/</span>
        {projects.length > 0 ? (
          <select
            className="select"
            style={{ width: 170, height: 22 }}
            value={projectId ?? ''}
            onChange={e => onProjectChange(e.target.value)}
          >
            <option value="">— select project —</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : (
          <span style={{ color: 'var(--color-ink-3)' }}>{title ?? '—'}</span>
        )}
        {crumb.length > 0 && (
          <>
            <span style={{ color: 'var(--color-ink-5)' }}>/</span>
            <span className="crumb">
              {crumb.map((c, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span className={i === crumb.length - 1 ? 'cur mono' : ''}>{c}</span>
                  {i < crumb.length - 1 && <span className="sep">/</span>}
                </span>
              ))}
            </span>
          </>
        )}
      </div>

      <div className="spacer" />

      <button
        type="button"
        className="search"
        onClick={onSearchClick}
        style={{ cursor: 'pointer', textAlign: 'left' }}
        title="Open command palette (⌘K)"
      >
        <Icon name="search" size={13} />
        <span style={{ flex: 1, color: 'var(--color-ink-4)' }}>Search members, designs…</span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--color-ink-4)',
            padding: '1px 4px',
            border: '1px solid var(--color-line)',
            borderRadius: 2,
          }}
        >
          ⌘K
        </span>
      </button>
    </div>
  )
}

function buildCrumb(segments: string[]): string[] {
  if (segments.length === 0) return []
  const labels: string[] = []
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    if (s === 'beams') labels.push('Beams')
    else if (s === 'columns') labels.push('Columns')
    else if (s === 'slabs') labels.push('Slabs')
    else if (s === 'footings') labels.push('Footings')
    else if (s === 'members') labels.push('Members')
    else if (s === 'mto') labels.push('Material Takeoff')
    else if (s === 'reports') labels.push('Reports')
    else if (s === 'combinations') labels.push('Load Combos')
    else if (s === 'setup') labels.push('Setup')
    else if (s === 'basicloads') labels.push('Basic Loads')
    else if (s === 'loadcombos') labels.push('Load Combos')
    else if (s.length > 12) labels.push(s.slice(0, 8))
    else labels.push(s)
  }
  return labels
}
