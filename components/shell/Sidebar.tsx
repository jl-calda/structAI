/**
 * Sidebar — 184px, dark chrome.
 * Top nav structure from docs/09-pages.md:
 *
 *   [Dashboard]
 *   ── divider ──
 *   [Project name + sync dot]
 *     Overview · Setup · Members · Load Combos
 *   ── divider ──
 *   Design
 *     Beams · Columns · Slabs · Footings
 *   ── divider ──
 *   Material Takeoff · Reports
 *   ── bottom ──
 *   [Engineer name | Code standard]
 *
 * The project section only renders when a project is active.
 */
import Link from 'next/link'

import type { CodeStandard } from '@/lib/supabase/types'

type ProjectContext = {
  id: string
  name: string
  codeStandard: CodeStandard
  syncStatus: 'green' | 'amber' | 'red'
}

const codeLabels: Record<CodeStandard, string> = {
  NSCP_2015: 'NSCP 2015',
  ACI_318_19: 'ACI 318-19',
  EC2_2004: 'EC2 2004',
  AS_3600_2018: 'AS 3600-2018',
  CSA_A23_3_19: 'CSA A23.3-19',
}

export function Sidebar({
  engineerName = 'Engineer',
  project,
}: {
  engineerName?: string
  project?: ProjectContext
}) {
  const projectBase = project ? `/projects/${project.id}` : null

  return (
    <aside
      className="flex flex-col w-[184px] shrink-0 border-r"
      style={{
        background: 'var(--color-chrome-sidebar)',
        borderColor: 'var(--color-chrome-border)',
        color: 'var(--color-chrome-text)',
      }}
    >
      <nav className="flex-1 py-3 text-[12px]">
        <NavItem href="/dashboard" label="Dashboard" top />

        {project && projectBase ? (
          <>
            <Divider />
            <div className="px-3 pb-1 pt-1 flex items-center gap-2 text-[11px]"
                 style={{ color: 'var(--color-chrome-text)' }}>
              <span
                aria-hidden
                className="inline-block h-[6px] w-[6px] rounded-full"
                style={{ background: dotColor(project.syncStatus) }}
              />
              <span className="mono truncate">{project.name}</span>
            </div>
            <NavItem href={projectBase} label="Overview" />
            <NavItem href={`${projectBase}/setup`} label="Setup" />
            <NavItem href={`${projectBase}/members`} label="Members" />
            <NavItem href={`${projectBase}/combinations`} label="Load Combos" />

            <Divider />
            <SectionLabel>Design</SectionLabel>
            <NavItem href={`${projectBase}/beams`} label="Beams" />
            <NavItem href={`${projectBase}/columns`} label="Columns" />
            <NavItem href={`${projectBase}/slabs`} label="Slabs" />
            <NavItem href={`${projectBase}/footings`} label="Footings" />

            <Divider />
            <NavItem href={`${projectBase}/mto`} label="Material Takeoff" />
            <NavItem href={`${projectBase}/reports`} label="Reports" />
          </>
        ) : null}
      </nav>

      <div
        className="px-3 py-3 border-t text-[10.5px]"
        style={{
          borderColor: 'var(--color-chrome-border)',
          color: 'var(--color-chrome-text2)',
        }}
      >
        <div>{engineerName}</div>
        <div className="mono">
          {project ? codeLabels[project.codeStandard] : '—'}
        </div>
      </div>
    </aside>
  )
}

function NavItem({
  href,
  label,
  top = false,
}: {
  href: string
  label: string
  top?: boolean
}) {
  return (
    <Link
      href={href}
      className={
        'block px-3 py-1.5 hover:bg-white/5 transition-colors ' +
        (top ? 'font-semibold' : '')
      }
      style={{ color: 'var(--color-chrome-text)' }}
    >
      {label}
    </Link>
  )
}

function Divider() {
  return (
    <div
      className="mx-3 my-2 border-t"
      style={{ borderColor: 'var(--color-chrome-border)' }}
    />
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-3 pb-1 pt-1 text-[9.5px] uppercase tracking-wider"
      style={{ color: 'var(--color-chrome-text2)' }}
    >
      {children}
    </div>
  )
}

function dotColor(status: ProjectContext['syncStatus']) {
  if (status === 'green') return 'var(--color-green)'
  if (status === 'amber') return 'var(--color-amber)'
  return 'var(--color-red)'
}
