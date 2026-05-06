'use client'

import Link from 'next/link'
import { useRouter, useSelectedLayoutSegments } from 'next/navigation'
import { useState, useTransition } from 'react'

import { setProjectCodeStandardAction } from '@/app/actions/projects'
import { requestResyncAction } from '@/app/actions/loads'
import { Icon } from '@/components/ui/Icon'
import type { CodeStandard } from '@/lib/supabase/types'

type ProjectChoice = { id: string; name: string }

const CODES: { value: CodeStandard; label: string }[] = [
  { value: 'NSCP_2015', label: 'NSCP 2015' },
  { value: 'ACI_318_19', label: 'ACI 318-19' },
  { value: 'EC2_2004', label: 'EC2 2004' },
  { value: 'AS_3600_2018', label: 'AS 3600-2018' },
  { value: 'CSA_A23_3_19', label: 'CSA A23.3-19' },
]

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
  const [syncing, startSync] = useTransition()
  const [savingCode, startSaveCode] = useTransition()
  const [toast, setToast] = useState<{ tone: 'pass' | 'fail' | 'info'; msg: string } | null>(null)
  const [code, setCode] = useState(codeStandard ?? 'NSCP_2015')

  const crumb = buildCrumb(segments)

  const onProjectChange = (id: string) => {
    if (id && id !== projectId) router.push(`/projects/${id}`)
  }

  const onSync = () => {
    if (!projectId) return
    startSync(async () => {
      const result = await requestResyncAction(projectId)
      if (result.ok) {
        setToast({ tone: 'pass', msg: 'Bridge resync requested.' })
        router.refresh()
      } else {
        const offline = 'offline' in result && result.offline
        setToast({ tone: 'fail', msg: offline ? 'Bridge offline — start the Python bridge.' : result.error })
      }
      setTimeout(() => setToast(null), 3500)
    })
  }

  const onRun = () => {
    if (!projectId) {
      setToast({ tone: 'info', msg: 'Open a beam/column/slab/footing detail page to run its design.' })
      setTimeout(() => setToast(null), 3000)
      return
    }
    setToast({ tone: 'info', msg: 'Use the Run button on the design detail page.' })
    setTimeout(() => setToast(null), 3000)
  }

  const onSave = () => {
    setToast({ tone: 'info', msg: 'Auto-saved — all edits are persisted as you make them.' })
    setTimeout(() => setToast(null), 2500)
  }

  const onExport = () => {
    if (typeof window !== 'undefined') window.print()
  }

  const onSearchClick = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
    }
  }

  const onCodeChange = (next: CodeStandard) => {
    if (!projectId) {
      setCode(next)
      return
    }
    const prev = code
    setCode(next)
    startSaveCode(async () => {
      const result = await setProjectCodeStandardAction(projectId, next)
      if (result.ok) {
        setToast({ tone: 'pass', msg: `Code standard set to ${next.replace(/_/g, ' ')}.` })
        router.refresh()
      } else {
        setCode(prev)
        setToast({ tone: 'fail', msg: result.error })
      }
      setTimeout(() => setToast(null), 3000)
    })
  }

  return (
    <>
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

        <div className="divider" />

        <div className="toggle-strip">
          <button type="button" className={view === '3d' ? 'active' : ''} onClick={() => setView('3d')}>
            <Icon name="cube" size={12} /> 3D
          </button>
          <button type="button" className={view === 'plan' ? 'active' : ''} onClick={() => setView('plan')}>
            <Icon name="plan" size={12} /> Plan
          </button>
          <button type="button" className={view === 'elev' ? 'active' : ''} onClick={() => setView('elev')}>
            <Icon name="elev" size={12} /> Elev
          </button>
        </div>

        <div className="divider" />

        <select
          className="select"
          value={code}
          onChange={e => onCodeChange(e.target.value as CodeStandard)}
          style={{ width: 120 }}
          disabled={savingCode}
        >
          {CODES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <div className="divider" />

        <button type="button" className="btn sm" onClick={onSync} disabled={syncing || !projectId} title="Resync STAAD bridge">
          <Icon name="sync" size={12} /> {syncing ? 'Syncing…' : 'Sync'}
        </button>
        <button type="button" className="btn sm primary" onClick={onRun} title="Run the design on the current detail page">
          <Icon name="play" size={12} /> Run
        </button>
        <button type="button" className="btn sm" onClick={onSave} title="Save (auto-saved on every edit)">
          <Icon name="save" size={12} /> Save
        </button>
        <button type="button" className="btn sm" onClick={onExport} title="Print / Export PDF">
          <Icon name="export" size={12} /> Export
        </button>
      </div>

      {toast && (
        <div
          className={'sync ' + (toast.tone === 'pass' ? '' : toast.tone === 'fail' ? 'red' : 'amber')}
          style={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            zIndex: 60,
            boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
            maxWidth: 360,
          }}
        >
          <span className="led" />
          <span style={{ fontSize: 11.5 }}>{toast.msg}</span>
        </div>
      )}
    </>
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
    else if (s.length > 12) labels.push(s.slice(0, 8))
    else labels.push(s)
  }
  return labels
}
