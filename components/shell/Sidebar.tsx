/**
 * Sidebar — server component that fetches project tree data and hands
 * it off to the interactive client component for rendering.
 *
 * Layout (per design bundle):
 *   - Project chip (name, id, code, sync pill)
 *   - Navigate section (Dashboard, Overview, Setup, Members, Combos)
 *   - Design section (Beams, Columns, Slabs, Footings, MTO, Reports)
 *   - Project Tree (collapsible groups: Beams/Columns/Slabs/Footings, status dots)
 *   - Engineer footer
 */
import { listBeamDesigns } from '@/lib/data/beams'
import { listColumnDesigns } from '@/lib/data/columns'
import { listFootingDesigns } from '@/lib/data/footings'
import { listSlabDesigns } from '@/lib/data/slabs'
import type { CodeStandard, DesignStatus } from '@/lib/supabase/types'

import { SidebarClient, type TreeItem } from './SidebarClient'

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

function statusToDot(s: DesignStatus): 'pass' | 'fail' | 'warn' | 'pending' {
  if (s === 'pass') return 'pass'
  if (s === 'fail') return 'fail'
  if (s === 'unverified') return 'warn'
  return 'pending'
}

export async function Sidebar({
  engineerName = 'Engineer',
  project,
}: {
  engineerName?: string
  project?: ProjectContext
}) {
  let beams: TreeItem[] = []
  let columns: TreeItem[] = []
  let slabs: TreeItem[] = []
  let footings: TreeItem[] = []

  if (project) {
    const [b, c, s, f] = await Promise.all([
      listBeamDesigns(project.id),
      listColumnDesigns(project.id),
      listSlabDesigns(project.id),
      listFootingDesigns(project.id),
    ])
    beams = b.map((d) => ({
      id: d.id,
      label: d.label,
      meta: d.section_name,
      status: statusToDot(d.design_status),
      href: `/projects/${project.id}/beams/${d.id}`,
    }))
    columns = c.map((d) => ({
      id: d.id,
      label: d.label,
      meta: d.section_name,
      status: statusToDot(d.design_status),
      href: `/projects/${project.id}/columns/${d.id}`,
    }))
    slabs = s.map((d) => ({
      id: d.id,
      label: d.label,
      meta: `${d.span_x_mm.toFixed(0)}×${d.span_y_mm.toFixed(0)}`,
      status: statusToDot(d.design_status),
      href: `/projects/${project.id}/slabs/${d.id}`,
    }))
    footings = f.map((d) => ({
      id: d.id,
      label: d.label,
      meta: `${d.length_x_mm.toFixed(0)}×${d.width_y_mm.toFixed(0)}`,
      status: statusToDot(d.design_status),
      href: `/projects/${project.id}/footings/${d.id}`,
    }))
  }

  return (
    <SidebarClient
      engineerName={engineerName}
      project={
        project
          ? { ...project, codeLabel: codeLabels[project.codeStandard] }
          : undefined
      }
      tree={{ beams, columns, slabs, footings }}
    />
  )
}
