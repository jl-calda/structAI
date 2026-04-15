import { notFound } from 'next/navigation'

import { Tag } from '@/components/ui/Tag'
import { groupByDia, listMto, summariseMto } from '@/lib/data/mto'
import { getProject } from '@/lib/data/projects'

export const dynamic = 'force-dynamic'

export default async function MtoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const rows = await listMto(id)
  const summary = summariseMto(rows)
  const grouped = groupByDia(rows)

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-4 gap-3">
        <StatCard
          label="Total weight"
          value={`${summary.total_weight_kg.toFixed(1)} kg`}
          tone="amber"
          bold
        />
        <StatCard
          label="Largest Ø"
          value={summary.largest_dia > 0 ? `Ø${summary.largest_dia}` : '—'}
          tone="blue"
        />
        <StatCard
          label="Stirrups"
          value={`${summary.stirrups_kg.toFixed(1)} kg`}
          tone="blue"
          pct={
            summary.total_weight_kg > 0
              ? summary.stirrups_kg / summary.total_weight_kg
              : 0
          }
        />
        <StatCard
          label="Main bars"
          value={`${summary.other_kg.toFixed(1)} kg`}
          tone="amber"
          pct={
            summary.total_weight_kg > 0
              ? summary.other_kg / summary.total_weight_kg
              : 0
          }
        />
      </section>

      <section className="card">
        <div className="ch">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text2)' }}>
            Rebar schedule
          </span>
          <span className="ml-auto mono text-[11px]"
                style={{ color: 'var(--color-text2)' }}>
            {rows.length} line{rows.length === 1 ? '' : 's'}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="cb text-[11.5px]"
               style={{ color: 'var(--color-text2)' }}>
            No rebar takeoff yet. Run a beam design to populate this schedule.
          </div>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Mark</th>
                <th>Ø</th>
                <th>Shape</th>
                <th>Element</th>
                <th className="!text-right">L (mm)</th>
                <th className="!text-right">No.</th>
                <th className="!text-right">Total L (m)</th>
                <th className="!text-right">kg/m</th>
                <th className="!text-right">Weight (kg)</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(grouped.entries())
                .sort((a, b) => a[0] - b[0])
                .map(([dia, groupRows]) => {
                  const subtotalKg = groupRows.reduce(
                    (s, r) => s + r.weight_kg,
                    0,
                  )
                  const tone =
                    dia >= 20
                      ? 'var(--color-amber-l)'
                      : dia >= 12
                        ? 'var(--color-blue-l)'
                        : 'var(--color-teal-l)'
                  return (
                    <>
                      <tr key={`h-${dia}`} style={{ background: tone }}>
                        <td colSpan={9} className="mono text-[11px] font-semibold uppercase tracking-wider">
                          Ø{dia} mm · {groupRows.length} line
                          {groupRows.length === 1 ? '' : 's'}
                        </td>
                      </tr>
                      {groupRows.map((r) => (
                        <tr key={r.id}>
                          <td className="mono">{r.bar_mark}</td>
                          <td className="mono">Ø{r.bar_dia_mm}</td>
                          <td><ShapeTag shape={r.bar_shape} /></td>
                          <td className="mono">{r.element_label}</td>
                          <td className="num" style={{ textAlign: 'right' }}>
                            {r.length_mm.toFixed(0)}
                          </td>
                          <td className="num" style={{ textAlign: 'right' }}>
                            {r.quantity}
                          </td>
                          <td className="num" style={{ textAlign: 'right' }}>
                            {r.total_length_m.toFixed(2)}
                          </td>
                          <td className="num" style={{ textAlign: 'right' }}>
                            {r.unit_weight_kg_m.toFixed(3)}
                          </td>
                          <td className="num" style={{ textAlign: 'right' }}>
                            {r.weight_kg.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                      <tr key={`s-${dia}`}>
                        <td colSpan={8}
                            className="mono text-[11px] uppercase tracking-wider"
                            style={{ color: 'var(--color-text2)', textAlign: 'right' }}>
                          Subtotal Ø{dia}
                        </td>
                        <td className="num font-semibold"
                            style={{ textAlign: 'right' }}>
                          {subtotalKg.toFixed(2)}
                        </td>
                      </tr>
                    </>
                  )
                })}
              <tr
                style={{
                  background: '#121008',
                  color: 'var(--color-amber)',
                }}
              >
                <td colSpan={8}
                    className="mono text-[12px] uppercase tracking-wider"
                    style={{ textAlign: 'right' }}>
                  Grand total
                </td>
                <td
                  className="num mono font-semibold"
                  style={{ textAlign: 'right', fontSize: 14 }}
                >
                  {summary.total_weight_kg.toFixed(2)} kg
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  tone,
  bold,
  pct,
}: {
  label: string
  value: string
  tone: 'amber' | 'blue'
  bold?: boolean
  pct?: number
}) {
  const border = tone === 'amber' ? 'var(--color-amber)' : 'var(--color-blue)'
  return (
    <div className="card" style={{ borderTop: `3px solid ${border}` }}>
      <div className="cb">
        <div className="text-[10px] uppercase tracking-wider"
             style={{ color: 'var(--color-text2)' }}>
          {label}
        </div>
        <div
          className={`mono ${bold ? 'font-semibold' : ''} leading-tight`}
          style={{ fontSize: bold ? 22 : 18 }}
        >
          {value}
        </div>
        {pct !== undefined ? (
          <div className="mt-1 h-1 w-full rounded"
               style={{ background: 'var(--color-surf3)' }}>
            <div
              className="h-1 rounded"
              style={{
                width: `${Math.min(100, Math.max(0, pct * 100)).toFixed(0)}%`,
                background: border,
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ShapeTag({ shape }: { shape: string }) {
  switch (shape) {
    case 'closed_tie':
      return <Tag variant="blue">TIE</Tag>
    case 'bent_45':
    case 'bent_90':
      return <Tag variant="amber">BENT</Tag>
    case 'hooked':
      return <Tag variant="amber">HOOK</Tag>
    default:
      return <Tag variant="green">STR</Tag>
  }
}
