import { notFound } from 'next/navigation'

import { ReportsPanel } from '@/components/reports/ReportsPanel'
import { getProject } from '@/lib/data/projects'
import { listReports } from '@/lib/data/reports'
import { getLatestSync } from '@/lib/data/staad'

export const dynamic = 'force-dynamic'

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const [reports, latest] = await Promise.all([
    listReports(id),
    getLatestSync(id),
  ])

  const syncStatus: 'green' | 'amber' | 'red' = latest
    ? latest.status === 'red' ? 'red' : 'green'
    : 'amber'

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[15px] font-semibold">Reports</h1>
      <ReportsPanel
        projectId={id}
        initialReports={reports.map((r) => ({
          id: r.id,
          title: r.title,
          generated_at: r.generated_at,
          staad_file_name: r.staad_file_name,
          staad_file_hash: r.staad_file_hash,
          is_in_sync: r.is_in_sync,
          storage_url: r.storage_url,
          scope: r.scope,
        }))}
        syncStatus={syncStatus}
        defaultEngineer="Engineer of Record"
      />
    </div>
  )
}
