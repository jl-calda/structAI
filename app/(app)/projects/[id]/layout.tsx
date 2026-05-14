import { notFound } from 'next/navigation'

import { AssistantPanel } from '@/components/ai/AssistantPanel'
import { ProjectCommandPalette } from '@/components/shell/ProjectCommandPalette'
import { MobileNavToggle } from '@/components/shell/MobileNavToggle'
import { RightInspector } from '@/components/shell/RightInspector'
import { Sidebar } from '@/components/shell/Sidebar'
import { TopNav } from '@/components/shell/TopNav'
import { getProject } from '@/lib/data/projects'
import { getLatestSync } from '@/lib/data/staad'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const latest = await getLatestSync(id)
  const syncStatus: 'green' | 'amber' | 'red' = latest
    ? latest.status === 'red' ? 'red' : 'green'
    : 'amber'

  return (
    <>
      <Sidebar
        project={{
          id: project.id,
          name: project.name,
          codeStandard: project.code_standard,
          syncStatus,
        }}
      />
      <div className="flex flex-col flex-1 min-w-0 center">
        <TopNav title={project.name} projectId={project.id} codeStandard={project.code_standard} />
        {project.archived_at && (
          <div
            style={{
              padding: '6px 12px',
              fontSize: 11.5,
              fontWeight: 600,
              color: '#92400e',
              background: '#fef3c7',
              borderBottom: '1px solid #fcd34d',
            }}
          >
            Archived snapshot — read only. STAAD file:{' '}
            <span className="mono">
              {project.active_staad_file_name ?? '—'}
            </span>{' '}
            · archived {new Date(project.archived_at).toLocaleString()}
          </div>
        )}
        <main className="flex-1 overflow-auto canvas">
          {children}
        </main>
      </div>
      <RightInspector />
      <MobileNavToggle />
      <ProjectCommandPalette projectId={project.id} />
      <AssistantPanel projectId={project.id} />
    </>
  )
}
