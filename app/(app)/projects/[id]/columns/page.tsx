import Link from 'next/link'
import { notFound } from 'next/navigation'

import { NewColumnForm } from '@/components/columns/NewColumnForm'
import { Tag } from '@/components/ui/Tag'
import { listColumnDesigns } from '@/lib/data/columns'
import { getProject } from '@/lib/data/projects'

export const dynamic = 'force-dynamic'

export default async function ColumnsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()
  const columns = await listColumnDesigns(id)

  const counts = {
    total: columns.length,
    pass: columns.filter((c) => c.design_status === 'pass').length,
    fail: columns.filter((c) => c.design_status === 'fail').length,
    pending: columns.filter(
      (c) => c.design_status === 'pending' || c.design_status === 'unverified',
    ).length,
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[15px] font-semibold">Column designs</h1>
        <div className="mono text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
          {counts.total} total ·{' '}
          <span style={{ color: 'var(--color-green)' }}>{counts.pass} pass</span>{' · '}
          <span style={{ color: 'var(--color-red)' }}>{counts.fail} fail</span>{' · '}
          {counts.pending} pending
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(300px,360px)] gap-3">
        <section className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>
              Columns
            </span>
          </div>
          {columns.length === 0 ? (
            <div className="cb text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
              No column designs yet. Create one from the form on the right.
            </div>
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Section</th>
                  <th className="!text-right">Height (mm)</th>
                  <th>Members</th>
                  <th>Status</th>
                  <th className="!text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((c) => (
                  <tr key={c.id}>
                    <td className="mono font-semibold">{c.label}</td>
                    <td className="mono">{c.section_name}</td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {c.height_mm.toFixed(0)}
                    </td>
                    <td className="mono">[{c.member_ids.join(', ')}]</td>
                    <td><StatusTag status={c.design_status} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/projects/${id}/columns/${c.id}`}
                        className="rounded px-2 py-1 text-[11.5px] font-semibold"
                        style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <NewColumnForm
          projectId={id}
          defaults={{
            fc_mpa: 28,
            fy_mpa: 420,
            fys_mpa: 420,
            clear_cover_mm: 40,
          }}
        />
      </div>
    </div>
  )
}

function StatusTag({ status }: { status: string }) {
  switch (status) {
    case 'pass':   return <Tag variant="green">PASS</Tag>
    case 'fail':   return <Tag variant="red">FAIL</Tag>
    case 'unverified': return <Tag variant="amber">UNVERIFIED</Tag>
    default:       return <Tag variant="amber">PENDING</Tag>
  }
}
