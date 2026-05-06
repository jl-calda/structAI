/**
 * TopNav — 36px chrome strip with project picker, breadcrumb, search,
 * view-mode toggle, code standard select, and global actions (Sync/Run/
 * Save/Export). Most controls are interactive; route to TopNavClient.
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
