import { listBeamDesigns } from '@/lib/data/beams'
import { listColumnDesigns } from '@/lib/data/columns'
import { listFootingDesigns } from '@/lib/data/footings'
import { listSlabDesigns } from '@/lib/data/slabs'

import { CommandPalette, type CommandItem } from './CommandPalette'

export async function ProjectCommandPalette({ projectId }: { projectId: string }) {
  const [beams, cols, slabs, fts] = await Promise.all([
    listBeamDesigns(projectId),
    listColumnDesigns(projectId),
    listSlabDesigns(projectId),
    listFootingDesigns(projectId),
  ])

  const items: CommandItem[] = [
    ...beams.map(d => ({
      kind: 'beam' as const,
      id: d.id,
      label: d.label,
      meta: `${d.section_name} · ${d.total_span_mm.toFixed(0)} mm`,
      href: `/projects/${projectId}/beams/${d.id}`,
    })),
    ...cols.map(d => ({
      kind: 'column' as const,
      id: d.id,
      label: d.label,
      meta: `${d.section_name} · H ${d.height_mm.toFixed(0)} mm`,
      href: `/projects/${projectId}/columns/${d.id}`,
    })),
    ...slabs.map(d => ({
      kind: 'slab' as const,
      id: d.id,
      label: d.label,
      meta: `${d.span_x_mm.toFixed(0)}×${d.span_y_mm.toFixed(0)} · t${d.thickness_mm.toFixed(0)}`,
      href: `/projects/${projectId}/slabs/${d.id}`,
    })),
    ...fts.map(d => ({
      kind: 'footing' as const,
      id: d.id,
      label: d.label,
      meta: `${d.length_x_mm.toFixed(0)}×${d.width_y_mm.toFixed(0)}×${d.depth_mm.toFixed(0)}`,
      href: `/projects/${projectId}/footings/${d.id}`,
    })),
  ]

  return <CommandPalette items={items} />
}
