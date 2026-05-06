import { notFound } from 'next/navigation'

import { LoadCombosPage } from '@/components/setup/LoadCombosPage'
import {
  listCombinations,
  listLoadCases,
  listSystemTemplates,
  listEnvelope,
  summariseEnvelope,
} from '@/lib/data/combinations'
import { getProject } from '@/lib/data/projects'
import { listMembers } from '@/lib/data/staad'

export const dynamic = 'force-dynamic'

export default async function LoadCombos({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const [templates, cases, combos, envelope] = await Promise.all([
    listSystemTemplates(project.code_standard),
    listLoadCases(id),
    listCombinations(id),
    listEnvelope(id),
  ])

  return (
    <LoadCombosPage
      projectId={id}
      codeStandard={project.code_standard}
      templates={templates.map(t => ({ id: t.id, name: t.name, combinations: t.combinations.length }))}
      loadCases={cases.map(c => ({ case_number: c.case_number, title: c.title, load_type: c.load_type }))}
      loadCaseCount={cases.length}
      comboCount={combos.length}
      envelopeSummary={summariseEnvelope(envelope)}
    />
  )
}
