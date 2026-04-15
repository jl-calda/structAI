import { notFound } from 'next/navigation'

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
      <div className="flex flex-col flex-1 min-w-0">
        <TopNav title={project.name} />
        <main
          className="flex-1 overflow-auto p-4"
          style={{ background: 'var(--color-bg)' }}
        >
          {children}
        </main>
      </div>
    </>
  )
}
