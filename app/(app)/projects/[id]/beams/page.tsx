import Link from 'next/link'
import { notFound } from 'next/navigation'

import { NewBeamForm } from '@/components/beams/NewBeamForm'
import { Tag } from '@/components/ui/Tag'
import { listBeamDesigns } from '@/lib/data/beams'
import { getProject } from '@/lib/data/projects'

export const dynamic = 'force-dynamic'

export default async function BeamsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()
  const beams = await listBeamDesigns(id)

  const counts = {
    total: beams.length,
    pass: beams.filter((b) => b.design_status === 'pass').length,
    fail: beams.filter((b) => b.design_status === 'fail').length,
    pending: beams.filter(
      (b) => b.design_status === 'pending' || b.design_status === 'unverified',
    ).length,
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[15px] font-semibold">Beam designs</h1>
        <div className="mono text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
          {counts.total} total · <span style={{ color: 'var(--color-green)' }}>{counts.pass} pass</span>
          {' · '}
          <span style={{ color: 'var(--color-red)' }}>{counts.fail} fail</span>
          {' · '}
          {counts.pending} pending
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(300px,360px)] gap-3">
        <section className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>
              Beams
            </span>
          </div>
          {beams.length === 0 ? (
            <div className="cb text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
              No beam designs yet. Create one from the form on the right — link it to one or more STAAD members.
            </div>
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Section</th>
                  <th className="!text-right">Span (mm)</th>
                  <th>Members</th>
                  <th>Status</th>
                  <th className="!text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {beams.map((b) => (
                  <tr key={b.id}>
                    <td className="mono font-semibold">{b.label}</td>
                    <td className="mono">{b.section_name}</td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {b.total_span_mm.toFixed(0)}
                    </td>
                    <td className="mono">[{b.member_ids.join(', ')}]</td>
                    <td><StatusTag status={b.design_status} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/projects/${id}/beams/${b.id}`}
                        className="rounded px-2 py-1 text-[11.5px] font-semibold"
                        style={{
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text)',
                        }}
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

        <NewBeamForm
          projectId={id}
          defaults={{
            fc_mpa:
              project.code_standard === 'NSCP_2015' ? 28 : 28,
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
    case 'pass':
      return <Tag variant="green">PASS</Tag>
    case 'fail':
      return <Tag variant="red">FAIL</Tag>
    case 'unverified':
      return <Tag variant="amber">UNVERIFIED</Tag>
    default:
      return <Tag variant="amber">PENDING</Tag>
  }
}
