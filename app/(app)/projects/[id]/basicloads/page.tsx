import { notFound } from 'next/navigation'

import { BasicLoadsPage } from '@/components/setup/BasicLoadsPage'
import { getProject } from '@/lib/data/projects'
import { listMembers } from '@/lib/data/staad'

export const dynamic = 'force-dynamic'

export default async function BasicLoads({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const members = await listMembers(id)

  return (
    <BasicLoadsPage
      projectId={id}
      project={{
        code_standard: project.code_standard,
        default_density_kn_m3: project.default_density_kn_m3,
        seismic_zone: project.seismic_zone,
        lightweight_lambda: project.lightweight_lambda,
      }}
      members={members.map(m => ({
        member_id: m.member_id,
        section_name: m.section_name,
        length_mm: m.length_mm,
        member_type: m.member_type,
      }))}
    />
  )
}
