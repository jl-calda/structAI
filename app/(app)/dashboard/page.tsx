/**
 * Dashboard `/dashboard`
 * See docs/10-ui-layouts.md § Dashboard.
 */
import Link from 'next/link'

import { NewProjectCard } from '@/components/projects/NewProjectCard'
import { SetupRequired } from '@/components/setup/SetupRequired'
import { Tag } from '@/components/ui/Tag'
import {
  getDashboardStats,
  listProjectCards,
  listRecentActivity,
  type ActivityEvent,
  type ElementCounts,
} from '@/lib/data/projects'
import { isSupabaseConfigured } from '@/lib/env'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const today = new Date()

  if (!isSupabaseConfigured()) {
    return <SetupRequired />
  }

  const [projects, stats, activity] = await Promise.all([
    listProjectCards(),
    getDashboardStats(),
    listRecentActivity(20),
  ])

  const totalDesigns =
    stats.beams.total + stats.columns.total +
    stats.slabs.total + stats.footings.total
  const totalPassed =
    stats.beams.pass + stats.columns.pass +
    stats.slabs.pass + stats.footings.pass

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <header className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[18px] font-semibold tracking-tight">StructAI</h1>
          <span className="mono text-[11.5px]"
                style={{ color: 'var(--color-text2)' }}>
            {today.toISOString().slice(0, 10)}
          </span>
        </div>
        <div className="mono text-[11.5px]"
             style={{ color: 'var(--color-text2)' }}>
          {projects.length} project{projects.length === 1 ? '' : 's'}
        </div>
      </header>

      {/* Stat cards */}
      <section className="grid grid-cols-4 gap-3">
        <StatCard label="Active Projects" value={stats.projects.active} />
        <StatCard label="Elements designed" value={totalDesigns} />
        <StatCard
          label="Passing"
          value={totalPassed}
          tone={totalDesigns > 0 && totalPassed === totalDesigns ? 'green' : undefined}
        />
        <StatCard label="Reports" value={stats.reports_count} />
      </section>

      {/* Projects grid */}
      <section>
        <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--color-text2)' }}>
          Projects
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {projects.map((p) => {
            const total =
              p.beams.total + p.columns.total +
              p.slabs.total + p.footings.total
            const pass =
              p.beams.pass + p.columns.pass +
              p.slabs.pass + p.footings.pass
            const pct = total > 0 ? (pass / total) * 100 : 0
            return (
              <Link key={p.id} href={`/projects/${p.id}`}
                    className="card hover:shadow-sm transition-shadow">
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
                    <CountLine label="Beams" counts={p.beams} />
                    <CountLine label="Columns" counts={p.columns} />
                    <CountLine label="Slabs" counts={p.slabs} />
                    <CountLine label="Footings" counts={p.footings} />
                  </div>
                  <div className="h-1 w-full rounded"
                       style={{ background: 'var(--color-surf3)' }}>
                    <div className="h-1 rounded"
                         style={{
                           width: `${Math.min(100, pct).toFixed(0)}%`,
                           background: total > 0 ? 'var(--color-amber)' : 'var(--color-surf3)',
                         }} />
                  </div>
                  <div className="flex items-center justify-between text-[10.5px]"
                       style={{ color: 'var(--color-text2)' }}>
                    <span className="mono">{pct.toFixed(0)}% complete</span>
                    <span className="mono">
                      {p.last_sync?.synced_at
                        ? `synced ${p.last_sync.synced_at.slice(0, 10)}`
                        : 'not synced'}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
          <NewProjectCard />
        </div>
      </section>

      {/* Recent activity */}
      <section className="card">
        <div className="ch">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text2)' }}>
            Recent activity
          </span>
        </div>
        {activity.length === 0 ? (
          <div className="cb text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
            Nothing has happened yet. Run a STAAD sync or design a beam to see events here.
          </div>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Time</th>
                <th>Project</th>
                <th>Action</th>
                <th>Element</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((e, i) => (
                <tr key={i}>
                  <td className="mono text-[11px]">
                    {e.at.slice(0, 19).replace('T', ' ')}
                  </td>
                  <td>
                    <Link href={`/projects/${e.project_id}`}
                          className="mono hover:underline">
                      {e.project_name}
                    </Link>
                  </td>
                  <td>{actionLabel(e.kind)}</td>
                  <td className="mono text-[11px]">{e.element_label ?? '—'}</td>
                  <td><StatusChip status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function StatCard({
  label, value, tone,
}: {
  label: string
  value: number | string
  tone?: 'green'
}) {
  const borderTop =
    tone === 'green' ? 'var(--color-green)' : 'var(--color-blue)'
  return (
    <div className="card" style={{ borderTop: `3px solid ${borderTop}` }}>
      <div className="cb">
        <div className="text-[10px] uppercase tracking-wider"
             style={{ color: 'var(--color-text2)' }}>
          {label}
        </div>
        <div className="mono text-[22px] font-semibold leading-tight">
          {typeof value === 'number' ? value : value}
        </div>
      </div>
    </div>
  )
}

function CountLine({ label, counts }: { label: string; counts: ElementCounts }) {
  return (
    <div className="flex items-baseline justify-between">
      <span style={{ color: 'var(--color-text2)' }}>{label}</span>
      <span className="mono">
        {counts.pass} / {counts.total}
        {counts.fail > 0 ? (
          <span style={{ color: 'var(--color-red)' }}> · {counts.fail} ✗</span>
        ) : null}
      </span>
    </div>
  )
}

function actionLabel(kind: ActivityEvent['kind']): string {
  switch (kind) {
    case 'sync': return 'STAAD sync'
    case 'beam_designed': return 'Beam designed'
    case 'column_designed': return 'Column designed'
    case 'slab_designed': return 'Slab designed'
    case 'footing_designed': return 'Footing designed'
    case 'report_generated': return 'Report generated'
  }
}

function StatusChip({ status }: { status: ActivityEvent['status'] }) {
  switch (status) {
    case 'pass': return <Tag variant="green">PASS</Tag>
    case 'fail': return <Tag variant="red">FAIL</Tag>
    case 'pending': return <Tag variant="amber">PENDING</Tag>
    case 'unverified': return <Tag variant="amber">UNVERIFIED</Tag>
    case 'mismatch': return <Tag variant="red">MISMATCH</Tag>
    case 'ok': return <Tag variant="green">OK</Tag>
  }
}
