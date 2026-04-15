import Link from 'next/link'
import { notFound } from 'next/navigation'

import { NewFootingForm } from '@/components/footings/NewFootingForm'
import { Tag } from '@/components/ui/Tag'
import { listColumnDesigns } from '@/lib/data/columns'
import { listFootingDesigns } from '@/lib/data/footings'
import { getProject } from '@/lib/data/projects'

export const dynamic = 'force-dynamic'

export default async function FootingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()
  const [footings, columns] = await Promise.all([
    listFootingDesigns(id),
    listColumnDesigns(id),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[15px] font-semibold">Footing designs</h1>
        <div className="mono text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
          {footings.length} total
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(320px,380px)] gap-3">
        <section className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>Footings</span>
          </div>
          {footings.length === 0 ? (
            <div className="cb text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
              No footing designs yet. Link one to a column (for Pu) or to a STAAD support node.
            </div>
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Type</th>
                  <th className="!text-right">Lx × Ly × d</th>
                  <th>Link</th>
                  <th>Status</th>
                  <th className="!text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {footings.map((f) => {
                  const col = columns.find((c) => c.id === f.column_design_id)
                  return (
                    <tr key={f.id}>
                      <td className="mono font-semibold">{f.label}</td>
                      <td className="mono">{f.footing_type}</td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {f.length_x_mm.toFixed(0)}×{f.width_y_mm.toFixed(0)}×{f.depth_mm.toFixed(0)}
                      </td>
                      <td className="mono text-[11px]" style={{ color: 'var(--color-text2)' }}>
                        {col ? `col ${col.label}` : f.node_id ? `node ${f.node_id}` : '—'}
                      </td>
                      <td><StatusTag status={f.design_status} /></td>
                      <td style={{ textAlign: 'right' }}>
                        <Link href={`/projects/${id}/footings/${f.id}`}
                              className="rounded px-2 py-1 text-[11.5px] font-semibold"
                              style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        <NewFootingForm
          projectId={id}
          columns={columns.map((c) => ({ id: c.id, label: c.label }))}
        />
      </div>
    </div>
  )
}

function StatusTag({ status }: { status: string }) {
  switch (status) {
    case 'pass': return <Tag variant="green">PASS</Tag>
    case 'fail': return <Tag variant="red">FAIL</Tag>
    case 'unverified': return <Tag variant="amber">UNVERIFIED</Tag>
    default: return <Tag variant="amber">PENDING</Tag>
  }
}
