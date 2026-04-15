/**
 * Dashboard `/dashboard`
 * See docs/10-ui-layouts.md § Dashboard.
 *
 * Phase 1 subset: app header row, project cards grid, + New Project card.
 * Stat cards and Recent Activity table will be filled in once beam/column
 * design status exists (Phase 3+) — stubbed with counts derived from
 * projects + syncs for now.
 */
import Link from 'next/link'

import { NewProjectCard } from '@/components/projects/NewProjectCard'
import { Tag } from '@/components/ui/Tag'
import { listProjects } from '@/lib/data/projects'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const projects = await listProjects()
  const today = new Date()

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <header className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[18px] font-semibold tracking-tight">StructAI</h1>
          <span
            className="mono text-[11.5px]"
            style={{ color: 'var(--color-text2)' }}
          >
            {today.toISOString().slice(0, 10)}
          </span>
        </div>
        <div
          className="mono text-[11.5px]"
          style={{ color: 'var(--color-text2)' }}
        >
          {projects.length} project{projects.length === 1 ? '' : 's'}
        </div>
      </header>

      {/* Stat cards — placeholders until design modules land */}
      <section className="grid grid-cols-4 gap-3">
        <StatCard label="Active Projects" value={projects.length.toString()} />
        <StatCard label="Completed" value="0" />
        <StatCard label="Members Designed" value="0" />
        <StatCard label="Reports" value="0" />
      </section>

      {/* Projects grid */}
      <section>
        <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--color-text2)' }}>
          Projects
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card hover:shadow-sm transition-shadow">
              <div className="ch">
                <span className="mono text-[13px] font-semibold truncate">{p.name}</span>
                <div className="ml-auto">
                  {p.last_sync?.mismatch_detected
                    ? <Tag variant="red">MISMATCH</Tag>
                    : p.last_sync
                      ? <Tag variant="green">SYNCED</Tag>
                      : <Tag variant="amber">NO SYNC</Tag>}
                </div>
              </div>
              <div className="cb flex flex-col gap-2">
                <div className="text-[11.5px]"
                     style={{ color: 'var(--color-text2)' }}>
                  {[p.client, p.location].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <Stat label="Beams"    value="0 / 0" />
                  <Stat label="Columns"  value="0 / 0" />
                  <Stat label="Slabs"    value="0 / 0" />
                  <Stat label="Footings" value="0 / 0" />
                </div>
                <div className="h-1 w-full rounded"
                     style={{ background: 'var(--color-surf3)' }}>
                  <div className="h-1 rounded"
                       style={{ width: '0%', background: 'var(--color-amber)' }} />
                </div>
                <div className="flex items-center justify-between text-[10.5px]"
                     style={{ color: 'var(--color-text2)' }}>
                  <span className="mono">0% complete</span>
                  <span className="mono">
                    {p.last_sync?.synced_at
                      ? `synced ${p.last_sync.synced_at.slice(0, 10)}`
                      : 'not synced'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
          <NewProjectCard />
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="cb">
        <div className="text-[10px] uppercase tracking-wider"
             style={{ color: 'var(--color-text2)' }}>
          {label}
        </div>
        <div className="mono text-[22px] font-semibold leading-tight">{value}</div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span style={{ color: 'var(--color-text2)' }}>{label}</span>
      <span className="mono">{value}</span>
    </div>
  )
}
