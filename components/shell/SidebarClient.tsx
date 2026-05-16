'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { setProjectCodeStandardAction } from '@/app/actions/projects'
import { requestResyncAction } from '@/app/actions/loads'
import { Icon, type IconName } from '@/components/ui/Icon'
import { useResizable } from '@/lib/hooks/useResizable'
import type { CodeStandard } from '@/lib/supabase/types'

export type TreeItem = {
  id: string
  label: string
  meta: string
  status: 'pass' | 'fail' | 'warn' | 'pending'
  href: string
}

type Tree = {
  beams: TreeItem[]
  columns: TreeItem[]
  slabs: TreeItem[]
  footings: TreeItem[]
}

const NAV_TOP = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' as IconName, href: '/dashboard' },
] as const

const NAV_PROJECT = [
  { key: 'overview', label: 'STAAD', icon: 'overview' as IconName, sub: '' },
  { key: 'setup', label: 'Setup', icon: 'setup' as IconName, sub: '/setup' },
  { key: 'members', label: 'Members', icon: 'members' as IconName, sub: '/members' },
  { key: 'basicloads', label: 'Basic Loads', icon: 'combos' as IconName, sub: '/basicloads' },
  { key: 'loadcombos', label: 'Load Combos', icon: 'combos' as IconName, sub: '/loadcombos' },
] as const

const NAV_DESIGN = [
  { key: 'beams', label: 'Beams', icon: 'beam' as IconName, sub: '/beams' },
  { key: 'columns', label: 'Columns', icon: 'column' as IconName, sub: '/columns' },
  { key: 'slabs', label: 'Slabs', icon: 'slab' as IconName, sub: '/slabs' },
  { key: 'footings', label: 'Footings', icon: 'footing' as IconName, sub: '/footings' },
] as const

const NAV_BOTTOM = [
  { key: 'mto', label: 'Material Takeoff', icon: 'mto' as IconName, sub: '/mto' },
  { key: 'reports', label: 'Reports', icon: 'reports' as IconName, sub: '/reports' },
] as const

export function SidebarClient({
  engineerName,
  project,
  tree,
}: {
  engineerName: string
  project?: {
    id: string
    name: string
    codeLabel: string
    codeStandard: CodeStandard
    syncStatus: 'green' | 'amber' | 'red'
  }
  tree: Tree
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [w, startDrag] = useResizable(240, 180, 380, 'left', 'structai.sidebar.w')
  const [groups, setGroups] = useState<Record<string, boolean>>({
    beams: true, columns: false, slabs: false, footings: false,
  })

  const projectBase = project ? `/projects/${project.id}` : null

  const CODES: { value: CodeStandard; label: string }[] = [
    { value: 'NSCP_2015', label: 'NSCP 2015' },
    { value: 'ACI_318_19', label: 'ACI 318-19' },
    { value: 'EC2_2004', label: 'EC2 2004' },
    { value: 'AS_3600_2018', label: 'AS 3600-2018' },
    { value: 'CSA_A23_3_19', label: 'CSA A23.3-19' },
  ]
  const [code, setCode] = useState<CodeStandard>(project?.codeStandard ?? 'NSCP_2015')
  const [savingCode, startSaveCode] = useTransition()
  const [syncing, startSync] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  const onCodeChange = (next: CodeStandard) => {
    if (!project) return
    const prev = code
    setCode(next)
    startSaveCode(async () => {
      const result = await setProjectCodeStandardAction(project.id, next)
      if (result.ok) {
        router.refresh()
      } else {
        setCode(prev)
        setToast(result.error)
        setTimeout(() => setToast(null), 3000)
      }
    })
  }

  const onSync = () => {
    if (!project) return
    startSync(async () => {
      const result = await requestResyncAction(project.id)
      if (!result.ok) {
        setToast('offline' in result && result.offline ? 'Bridge offline' : result.error)
        setTimeout(() => setToast(null), 3000)
      } else {
        router.refresh()
      }
    })
  }

  const renderNavItem = (
    href: string,
    label: string,
    icon: IconName,
    extraActiveCheck?: (path: string) => boolean,
  ) => {
    const isActive = pathname === href || (extraActiveCheck?.(pathname) ?? false)
    return (
      <Link key={href} href={href} className={'nav-item ' + (isActive ? 'active' : '')}>
        <Icon name={icon} size={13} />
        <span>{label}</span>
      </Link>
    )
  }

  const total = tree.beams.length + tree.columns.length + tree.slabs.length + tree.footings.length

  if (collapsed) {
    return (
      <aside className="left collapsed">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0', gap: 2 }}>
          <button className="iconbtn" onClick={() => setCollapsed(false)} title="Expand sidebar">
            <Icon name="panel" size={14} />
          </button>
          {projectBase && (
            <>
              <Link href={projectBase} className="iconbtn" title="Overview"><Icon name="overview" size={14} /></Link>
              <Link href={`${projectBase}/members`} className="iconbtn" title="Members"><Icon name="members" size={14} /></Link>
              <Link href={`${projectBase}/beams`} className="iconbtn" title="Beams"><Icon name="beam" size={14} /></Link>
              <Link href={`${projectBase}/columns`} className="iconbtn" title="Columns"><Icon name="column" size={14} /></Link>
              <Link href={`${projectBase}/slabs`} className="iconbtn" title="Slabs"><Icon name="slab" size={14} /></Link>
              <Link href={`${projectBase}/footings`} className="iconbtn" title="Footings"><Icon name="footing" size={14} /></Link>
            </>
          )}
        </div>
      </aside>
    )
  }

  return (
    <aside className="left" style={{ width: w }}>
      <div className="resizer resizer-l" onMouseDown={startDrag} />

      {/* Project chip */}
      {project ? (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-line-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="folder" size={14} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {project.name}
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>
                {project.id.slice(0, 8)}
              </div>
            </div>
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className={'pill ' + (project.syncStatus === 'green' ? '' : project.syncStatus === 'amber' ? 'warn' : 'fail')}
              style={{ cursor: 'pointer', border: 0, background: 'none', padding: 0 }}
              title="Click to resync STAAD bridge"
            >
              <span className="led" /> {syncing ? '…' : 'sync'}
            </button>
          </div>
          <select
            className="select"
            value={code}
            onChange={e => onCodeChange(e.target.value as CodeStandard)}
            disabled={savingCode}
            style={{ width: '100%', height: 22, fontSize: 10.5 }}
          >
            {CODES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          {toast && (
            <div style={{ fontSize: 10, color: 'var(--color-fail)', lineHeight: 1.3 }}>{toast}</div>
          )}
        </div>
      ) : (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-line-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>StructAI</span>
        </div>
      )}

      {/* Navigation */}
      <div className="left-section" style={{ flex: '0 0 auto' }}>
        <div className="left-head">Navigate</div>
        {NAV_TOP.map(n => renderNavItem(n.href, n.label, n.icon))}
        {projectBase && NAV_PROJECT.map(n => {
          const href = projectBase + n.sub
          return renderNavItem(href, n.label, n.icon, p =>
            n.sub === '' ? p === projectBase : p.startsWith(href),
          )
        })}

        {projectBase && (
          <>
            <div className="left-head" style={{ marginTop: 6 }}>Design</div>
            {NAV_DESIGN.map(n => {
              const href = projectBase + n.sub
              return renderNavItem(href, n.label, n.icon, p => p.startsWith(href))
            })}
            {NAV_BOTTOM.map(n => {
              const href = projectBase + n.sub
              return renderNavItem(href, n.label, n.icon, p => p.startsWith(href))
            })}
          </>
        )}
      </div>

      {/* Project Tree */}
      {projectBase && total > 0 && (
        <div className="left-section" style={{ flex: '1 1 auto', minHeight: 0 }}>
          <div className="left-head" style={{ display: 'flex' }}>
            <span>Project Tree</span>
            <span className="mono" style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0, color: 'var(--color-ink-4)' }}>
              {total} items
            </span>
          </div>
          <div className="tree-scroll">
            {[
              { k: 'beams' as const, label: 'Beams', items: tree.beams },
              { k: 'columns' as const, label: 'Columns', items: tree.columns },
              { k: 'slabs' as const, label: 'Slabs', items: tree.slabs },
              { k: 'footings' as const, label: 'Footings', items: tree.footings },
            ].map(g => (
              <div key={g.k} className={'tree-group ' + (groups[g.k] ? '' : 'collapsed')}>
                <div className="tree-group-head" onClick={() => setGroups({ ...groups, [g.k]: !groups[g.k] })}>
                  <Icon name="chev" size={10} className="chev" />
                  <span>{g.label}</span>
                  <span className="count">{g.items.length}</span>
                </div>
                <div className="tree-children">
                  {g.items.map(it => (
                    <Link
                      key={it.id}
                      href={it.href}
                      className={'tree-item ' + (pathname === it.href ? 'active' : '')}
                    >
                      <span className={'dot ' + it.status} />
                      <span className="id">{it.label}</span>
                      <span className="meta">{it.meta}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Engineer footer */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid var(--color-line-2)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: 'var(--color-ink-3)' }}>
        <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--color-chrome-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="user" size={11} />
        </div>
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
          <div style={{ color: 'var(--color-ink-2)', fontSize: 11 }}>{engineerName}</div>
          <div className="mono" style={{ fontSize: 9.5 }}>{project?.codeLabel ?? '—'}</div>
        </div>
        <button className="iconbtn" onClick={() => setCollapsed(true)} title="Collapse">
          <Icon name="chevL" size={11} />
        </button>
      </div>
    </aside>
  )
}
