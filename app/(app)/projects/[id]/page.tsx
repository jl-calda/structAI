/**
 * Project Overview — docs/10-ui-layouts.md § Project Overview.
 * Phase 1 scope: sync banner, stat cards (counts only, all zero until
 * design modules land), frame viewer, and a placeholder Issues card.
 */
import { SyncBanner } from '@/components/layout/SyncBanner'
import { type MemberAssignment } from '@/components/staad/FrameViewer3D'
import { StaadDataView } from '@/components/staad/StaadDataView'
import { StaadOverviewInteractive } from '@/components/staad/StaadOverviewInteractive'
import { StaadVersionsPanel } from '@/components/staad/StaadVersionsPanel'
import { listBeamDesigns } from '@/lib/data/beams'
import { listColumnDesigns } from '@/lib/data/columns'
import { getProject, listStaadVersions } from '@/lib/data/projects'
import {
  getLatestSync,
  listCombinations,
  listDeflections,
  listDiagramPoints,
  listDisplacements,
  listEndForces,
  listEnvelope,
  listLoadCases,
  listMaterials,
  listMembers,
  listNodes,
  listReactions,
  listSections,
} from '@/lib/data/staad'
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

  const [
    latest, members, nodes, beamDesigns, columnDesigns,
    sections, materials, loadCases, combinations, envelope, reactions,
    displacements, diagramPoints, endForces, deflections, staadVersions,
  ] = await Promise.all([
    getLatestSync(id),
    listMembers(id),
    listNodes(id),
    listBeamDesigns(id),
    listColumnDesigns(id),
    listSections(id),
    listMaterials(id),
    listLoadCases(id),
    listCombinations(id),
    listEnvelope(id),
    listReactions(id),
    listDisplacements(id),
    listDiagramPoints(id, 5000),
    listEndForces(id, 5000),
    listDeflections(id, 5000),
    listStaadVersions(id),
  ])

  const beamCount = members.filter((m) => m.member_type === 'beam').length
  const columnCount = members.filter((m) => m.member_type === 'column').length

  // member_id → design assignment, for FrameViewer click-through.
  const assignments: Record<number, MemberAssignment> = {}
  for (const b of beamDesigns) {
    for (const mid of b.member_ids) {
      assignments[mid] = { kind: 'beam', design_id: b.id, label: b.label }
    }
  }
  for (const c of columnDesigns) {
    for (const mid of c.member_ids) {
      assignments[mid] = { kind: 'column', design_id: c.id, label: c.label }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SyncBanner latest={latest} />

      <StaadVersionsPanel
        projectId={id}
        rows={staadVersions.rows}
        mismatchIncoming={staadVersions.mismatchIncoming}
      />

      <section className="grid grid-cols-4 gap-3">
        <StatCard tone="amber" label="Beams" count={beamCount} />
        <StatCard tone="blue" label="Columns" count={columnCount} />
        <StatCard tone="teal" label="Slabs" count={0} />
        <StatCard tone="green" label="Footings" count={0} />
      </section>

      <StaadOverviewInteractive
        projectId={id}
        nodes={nodes}
        members={members}
        sections={sections}
        assignments={assignments}
      />

      <section>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>STAAD Cached Data</h2>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-4)' }}>
            everything synced from STAAD · sourced from Supabase Object 1 tables
          </span>
        </div>
        <StaadDataView
          nodes={nodes}
          members={members}
          sections={sections}
          materials={materials}
          loadCases={loadCases}
          combinations={combinations}
          envelope={envelope}
          reactions={reactions}
          displacements={displacements}
          diagramPoints={diagramPoints}
          endForces={endForces}
          deflections={deflections}
        />
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

