import { notFound } from 'next/navigation'

import { ProjectSetup } from '@/components/setup/ProjectSetup'
import {
  listCombinations,
  listLoadCases,
  listSystemTemplates,
  listEnvelope,
  summariseEnvelope,
} from '@/lib/data/combinations'
import { getProject } from '@/lib/data/projects'
import { getLatestSync } from '@/lib/data/staad'

export const dynamic = 'force-dynamic'

export default async function SetupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const [latest, templates, cases, combos, envelope] = await Promise.all([
    getLatestSync(id),
    listSystemTemplates(project.code_standard),
    listLoadCases(id),
    listCombinations(id),
    listEnvelope(id),
  ])

  return (
    <ProjectSetup
      projectId={id}
      project={{
        name: project.name,
        description: project.description,
        client: project.client,
        location: project.location,
        code_standard: project.code_standard,
        default_fc_mpa: project.default_fc_mpa,
        default_fy_mpa: project.default_fy_mpa,
        default_fys_mpa: project.default_fys_mpa,
        default_clear_cover_mm: project.default_clear_cover_mm,
        default_density_kn_m3: project.default_density_kn_m3,
        seismic_zone: project.seismic_zone,
        exposure_class: project.exposure_class,
        aggregate_type: project.aggregate_type,
        lightweight_lambda: project.lightweight_lambda,
        engineer_name: project.engineer_name,
      }}
      latestSync={
        latest
          ? {
              fileName: latest.row.file_name,
              hash: latest.row.file_hash,
              syncedAt: latest.row.synced_at,
              nodes: latest.row.node_count,
              members: latest.row.member_count,
              status: latest.row.status,
              mismatch: latest.row.mismatch_detected,
            }
          : null
      }
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        combinations: t.combinations.length,
      }))}
      loadCaseCount={cases.length}
      comboCount={combos.length}
      envelopeSummary={summariseEnvelope(envelope)}
    />
  )
}
