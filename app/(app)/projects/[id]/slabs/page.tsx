import Link from 'next/link'
import { notFound } from 'next/navigation'

import { NewSlabForm } from '@/components/slabs/NewSlabForm'
import { Tag } from '@/components/ui/Tag'
import { listSlabDesigns } from '@/lib/data/slabs'
import { getProject } from '@/lib/data/projects'

export const dynamic = 'force-dynamic'

export default async function SlabsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()
  const slabs = await listSlabDesigns(id)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[15px] font-semibold">Slab designs</h1>
        <div className="mono text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
          {slabs.length} total
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(300px,360px)] gap-3">
        <section className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>Slabs</span>
            <Tag variant="teal">NO STAAD LINK</Tag>
          </div>
          {slabs.length === 0 ? (
            <div className="cb text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
              No slab designs yet. Slabs are user-defined — geometry and loads come from the form on the right.
            </div>
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Type</th>
                  <th className="!text-right">Lx × Ly</th>
                  <th className="!text-right">t (mm)</th>
                  <th>Status</th>
                  <th className="!text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {slabs.map((s) => (
                  <tr key={s.id}>
                    <td className="mono font-semibold">{s.label}</td>
                    <td className="mono">{s.slab_type.replace('_', '-')}</td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {s.span_x_mm.toFixed(0)}×{s.span_y_mm.toFixed(0)}
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>{s.thickness_mm.toFixed(0)}</td>
                    <td><StatusTag status={s.design_status} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <Link href={`/projects/${id}/slabs/${s.id}`}
                            className="rounded px-2 py-1 text-[11.5px] font-semibold"
                            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <NewSlabForm projectId={id} />
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
