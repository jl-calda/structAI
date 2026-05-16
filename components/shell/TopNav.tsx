/**
 * TopNav — minimal chrome strip: project picker + breadcrumb + search.
 * All other actions (code standard, sync, run, export) live in the
 * sidebar or on individual design pages.
 */
import { listProjects } from '@/lib/data/projects'

import { TopNavClient } from './TopNavClient'

export async function TopNav({
  title,
  projectId,
  codeStandard,
}: {
  title?: string
  projectId?: string
  codeStandard?: string
}) {
  const projects = await listProjects().catch(() => [])
  return (
    <TopNavClient
      title={title}
      projectId={projectId}
      codeStandard={codeStandard}
      projects={projects.map(p => ({ id: p.id, name: p.name }))}
    />
  )
}
