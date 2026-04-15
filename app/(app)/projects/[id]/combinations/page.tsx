import { notFound } from 'next/navigation'

import { Tag } from '@/components/ui/Tag'
import {
  listCombinations,
  listEnvelope,
  listLoadCases,
  summariseEnvelope,
} from '@/lib/data/combinations'
import { getProject } from '@/lib/data/projects'

export const dynamic = 'force-dynamic'

export default async function CombinationsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const [combos, envelope, cases] = await Promise.all([
    listCombinations(id),
    listEnvelope(id),
    listLoadCases(id),
  ])

  const summary = summariseEnvelope(envelope)

  // Lookup: combo_number -> { mpos?, mneg?, vu? } governing spots
  // to tag the row that produced each design peak.
  const governingByCombo = new Map<
    number,
    { mpos?: boolean; mneg?: boolean; vu?: boolean }
  >()
  const mark = (combo: number | null, key: 'mpos' | 'mneg' | 'vu') => {
    if (combo === null) return
    const entry = governingByCombo.get(combo) ?? {}
    entry[key] = true
    governingByCombo.set(combo, entry)
  }
  mark(summary.mpos.combo, 'mpos')
  mark(summary.mneg.combo, 'mneg')
  mark(summary.vu.combo, 'vu')

  // Per-combo peaks across all members (for the M+max / M-max / Vu max cols).
  const byCombo = new Map<
    number,
    { mpos: number; mneg: number; vu: number }
  >()
  for (const e of envelope) {
    if (e.mpos_combo !== null) {
      const b = byCombo.get(e.mpos_combo) ?? { mpos: 0, mneg: 0, vu: 0 }
      if (e.mpos_max_knm > b.mpos) b.mpos = e.mpos_max_knm
      byCombo.set(e.mpos_combo, b)
    }
    if (e.mneg_combo !== null) {
      const b = byCombo.get(e.mneg_combo) ?? { mpos: 0, mneg: 0, vu: 0 }
      if (e.mneg_max_knm > b.mneg) b.mneg = e.mneg_max_knm
      byCombo.set(e.mneg_combo, b)
    }
    if (e.vu_combo !== null) {
      const b = byCombo.get(e.vu_combo) ?? { mpos: 0, mneg: 0, vu: 0 }
      if (e.vu_max_kn > b.vu) b.vu = e.vu_max_kn
      byCombo.set(e.vu_combo, b)
    }
  }

  const caseByNumber = new Map(cases.map((c) => [c.case_number, c]))

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-3 gap-3">
        <SummaryCard
          tone="amber"
          label="Design M+"
          unit="kN·m"
          value={summary.mpos.value}
          combo={summary.mpos.combo}
          member={summary.mpos.member}
        />
        <SummaryCard
          tone="blue"
          label="Design M−"
          unit="kN·m"
          value={summary.mneg.value}
          combo={summary.mneg.combo}
          member={summary.mneg.member}
        />
        <SummaryCard
          tone="red"
          label="Design Vu"
          unit="kN"
          value={summary.vu.value}
          combo={summary.vu.combo}
          member={summary.vu.member}
        />
      </section>

      <section className="card">
        <div className="ch">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text2)' }}>
            Combinations
          </span>
          <span className="ml-auto mono text-[11px]"
                style={{ color: 'var(--color-text2)' }}>
            {combos.length} total · {combos.filter((c) => c.source === 'app_generated').length} app-generated
          </span>
        </div>

        {combos.length === 0 ? (
          <div className="cb text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
            No combinations yet. Generate a set from the Setup → Load Combinations tab.
          </div>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>No.</th>
                <th>Equation</th>
                <th className="!text-right">M+ max</th>
                <th className="!text-right">M− max</th>
                <th className="!text-right">Vu max</th>
                <th>Governs</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {combos.map((c) => {
                const peaks = byCombo.get(c.combo_number)
                const gov = governingByCombo.get(c.combo_number) ?? {}
                const rowClass =
                  gov.mpos ? 'govern' :
                  gov.mneg ? 'govern' :
                  gov.vu ? 'govern' :
                  ''
                return (
                  <tr key={c.id} className={rowClass}>
                    <td className="num">{c.combo_number}</td>
                    <td>
                      <div className="flex flex-col">
                        <span className="mono">{c.title}</span>
                        <span className="text-[10.5px]"
                              style={{ color: 'var(--color-text2)' }}>
                          {summariseFactors(c.factors, caseByNumber)}
                        </span>
                      </div>
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {peaks?.mpos ? peaks.mpos.toFixed(1) : '—'}
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {peaks?.mneg ? peaks.mneg.toFixed(1) : '—'}
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {peaks?.vu ? peaks.vu.toFixed(1) : '—'}
                    </td>
                    <td>
                      {gov.mpos ? <Tag variant="amber">M+</Tag> : null}
                      {gov.mneg ? <Tag variant="blue">M−</Tag> : null}
                      {gov.vu ? <Tag variant="red">Vu</Tag> : null}
                    </td>
                    <td>
                      {c.source === 'imported' ? (
                        <Tag variant="blue">IMPORTED</Tag>
                      ) : (
                        <Tag variant="green">GENERATED</Tag>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function SummaryCard({
  tone,
  label,
  unit,
  value,
  combo,
  member,
}: {
  tone: 'amber' | 'blue' | 'red'
  label: string
  unit: string
  value: number
  combo: number | null
  member: number | null
}) {
  const border =
    tone === 'amber' ? 'var(--color-amber)' :
    tone === 'blue' ? 'var(--color-blue)' :
    'var(--color-red)'
  return (
    <div className="card" style={{ borderTop: `3px solid ${border}` }}>
      <div className="cb">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wider"
                style={{ color: 'var(--color-text2)' }}>
            {label}
          </span>
          <span className="mono text-[10.5px]"
                style={{ color: 'var(--color-text2)' }}>
            {combo !== null ? `combo ${combo}` : '—'}
          </span>
        </div>
        <div className="flex items-baseline gap-1 pt-1">
          <span className="mono text-[22px] font-semibold leading-tight">
            {value ? value.toFixed(1) : '—'}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--color-text2)' }}>
            {unit}
          </span>
        </div>
        <div className="mono text-[10.5px]" style={{ color: 'var(--color-text2)' }}>
          {member !== null ? `member ${member}` : 'no envelope yet'}
        </div>
      </div>
    </div>
  )
}

function summariseFactors(
  factors: { case_number: number; factor: number }[],
  caseByNumber: Map<number, { case_number: number; title: string }>,
): string {
  // Compact, human-ish rendering: "1.2[1]+1.6[3]+0.5[5]"
  return factors
    .map((f) => {
      const label = caseByNumber.has(f.case_number)
        ? `[${f.case_number}]`
        : `[${f.case_number}?]`
      return `${f.factor}${label}`
    })
    .join(' + ')
}
