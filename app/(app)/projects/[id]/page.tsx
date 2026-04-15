/**
 * Project Overview — docs/10-ui-layouts.md § Project Overview.
 * Phase 1 scope: sync banner, stat cards (counts only, all zero until
 * design modules land), frame viewer, and a placeholder Issues card.
 */
import { SyncBanner } from '@/components/layout/SyncBanner'
import { FrameViewer } from '@/components/staad/FrameViewer'
import { getProject } from '@/lib/data/projects'
import { getLatestSync, listMembers, listNodes } from '@/lib/data/staad'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const [latest, members, nodes] = await Promise.all([
    getLatestSync(id),
    listMembers(id),
    listNodes(id),
  ])

  const beamCount = members.filter((m) => m.member_type === 'beam').length
  const columnCount = members.filter((m) => m.member_type === 'column').length

  return (
    <div className="flex flex-col gap-4">
      <SyncBanner latest={latest} />

      <section className="grid grid-cols-4 gap-3">
        <StatCard tone="amber" label="Beams" count={beamCount} />
        <StatCard tone="blue" label="Columns" count={columnCount} />
        <StatCard tone="teal" label="Slabs" count={0} />
        <StatCard tone="green" label="Footings" count={0} />
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)_320px] gap-3">
        <div className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>
              STAAD Frame
            </span>
            <span className="ml-auto mono text-[11px]"
                  style={{ color: 'var(--color-text2)' }}>
              {nodes.length} node{nodes.length === 1 ? '' : 's'} ·{' '}
              {members.length} member{members.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="cb flex items-center justify-center">
            <FrameViewer nodes={nodes} members={members} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="card">
            <div className="ch">
              <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--color-text2)' }}>
                Issues
              </span>
            </div>
            <div className="cb text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
              {latest?.row.mismatch_detected
                ? 'STAAD model mismatch detected — re-sync or flag designs as unverified.'
                : 'No issues. Design modules come online in Phase 3.'}
            </div>
          </div>

          <div className="card">
            <div className="ch">
              <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--color-text2)' }}>
                Quick Actions
              </span>
            </div>
            <div className="cb flex flex-col gap-1.5 text-[12px]">
              <ActionPlaceholder label="Re-run failed designs" />
              <ActionPlaceholder label="Assign unassigned members" />
              <ActionPlaceholder label="Generate report" />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function StatCard({
  tone,
  label,
  count,
}: {
  tone: 'amber' | 'blue' | 'teal' | 'green'
  label: string
  count: number
}) {
  const topBorder =
    tone === 'amber' ? 'var(--color-amber)' :
    tone === 'blue' ? 'var(--color-blue)' :
    tone === 'teal' ? 'var(--color-teal)' :
    'var(--color-green)'
  return (
    <div className="card" style={{ borderTop: `3px solid ${topBorder}` }}>
      <div className="cb">
        <div className="text-[10px] uppercase tracking-wider"
             style={{ color: 'var(--color-text2)' }}>
          {label}
        </div>
        <div className="mono text-[22px] font-semibold leading-tight">{count}</div>
        <div className="mt-1 text-[10.5px]" style={{ color: 'var(--color-text2)' }}>
          0 designed of {count}
        </div>
      </div>
    </div>
  )
}

function ActionPlaceholder({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      className="text-left rounded border px-2 py-1.5 disabled:opacity-60 cursor-not-allowed"
      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text2)' }}
    >
      {label}
    </button>
  )
}
