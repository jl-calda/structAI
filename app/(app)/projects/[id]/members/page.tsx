import { notFound } from 'next/navigation'

import { MembersTable } from '@/components/members/MembersTable'
import { getProject } from '@/lib/data/projects'
import { listMembers } from '@/lib/data/staad'

export const dynamic = 'force-dynamic'

export default async function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const members = await listMembers(id)

  // Phase 2 scope: assignment is not wired (beam/column designs land in
  // Phase 3). We surface the member list and render the "Unassigned" state
  // for everything so the page is useful for sanity-checking sync output.
  return (
    <MembersTable
      members={members.map((m) => ({
        id: m.id,
        member_id: m.member_id,
        member_type: m.member_type,
        section_name: m.section_name,
        length_mm: m.length_mm,
      }))}
    />
  )
}
