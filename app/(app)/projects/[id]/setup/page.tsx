import { notFound } from 'next/navigation'

import { SetupTabs } from '@/components/setup/SetupTabs'
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
    <SetupTabs
      projectId={id}
      codeStandard={project.code_standard}
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
