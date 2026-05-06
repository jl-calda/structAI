'use client'

import Link from 'next/link'
import { useRouter, useSelectedLayoutSegments } from 'next/navigation'
import { useState } from 'react'

import { Icon } from '@/components/ui/Icon'

type ProjectChoice = { id: string; name: string }

export function TopNavClient({
  title,
  projectId,
  codeStandard,
  projects,
}: {
  title?: string
  projectId?: string
  codeStandard?: string
  projects: ProjectChoice[]
}) {
  const router = useRouter()
  const segments = useSelectedLayoutSegments()
  const [view, setView] = useState<'3d' | 'plan' | 'elev'>('3d')

  // Build a breadcrumb from the URL segments. e.g. ["beams","abc-123"] → Design / Beams / abc-123
  const crumb = buildCrumb(segments)

  const onProjectChange = (id: string) => {
    if (id && id !== projectId) router.push(`/projects/${id}`)
  }

  return (
    <div className="topbar">
      <Link href="/dashboard" className="iconbtn" title="Dashboard">
        <Icon name="dashboard" size={15} />
      </Link>
      <div className="divider" />

      <div className="row" style={{ gap: 6 }}>
        <span style={{ fontWeight: 600, letterSpacing: '-0.02em' }}>StructAI</span>
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

      <div className="search">
        <Icon name="search" size={13} />
        <input placeholder="Search members, designs…" />
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
      </div>

      <div className="divider" />

      <div className="toggle-strip">
        <button className={view === '3d' ? 'active' : ''} onClick={() => setView('3d')}>
          <Icon name="cube" size={12} /> 3D
        </button>
        <button className={view === 'plan' ? 'active' : ''} onClick={() => setView('plan')}>
          <Icon name="plan" size={12} /> Plan
        </button>
        <button className={view === 'elev' ? 'active' : ''} onClick={() => setView('elev')}>
          <Icon name="elev" size={12} /> Elev
        </button>
      </div>

      <div className="divider" />

      <select className="select" defaultValue={codeStandard ?? 'NSCP_2015'} style={{ width: 120 }}>
        <option value="NSCP_2015">NSCP 2015</option>
        <option value="ACI_318_19">ACI 318-19</option>
        <option value="EC2_2004">EC2 2004</option>
        <option value="AS_3600_2018">AS 3600-2018</option>
        <option value="CSA_A23_3_19">CSA A23.3-19</option>
      </select>

      <div className="divider" />

      <button className="btn sm" title="Sync STAAD">
        <Icon name="sync" size={12} /> Sync
      </button>
      <button className="btn sm primary" title="Run Design">
        <Icon name="play" size={12} /> Run
      </button>
      <button className="btn sm" title="Save">
        <Icon name="save" size={12} /> Save
      </button>
      <button className="btn sm" onClick={() => window.print()} title="Print / Export">
        <Icon name="export" size={12} /> Export
      </button>
    </div>
  )
}

function buildCrumb(segments: string[]): string[] {
  // segments = ["beams", "abc-123"] etc.
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
    else if (s.length > 12) labels.push(s.slice(0, 8))
    else labels.push(s)
  }
  return labels
}
