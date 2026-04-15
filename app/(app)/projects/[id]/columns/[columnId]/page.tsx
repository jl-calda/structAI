import { notFound } from 'next/navigation'

import { ColumnCrossSection } from '@/components/columns/ColumnCrossSection'
import { PmDiagram } from '@/components/columns/PmDiagram'
import { RunColumnDesignButton } from '@/components/columns/RunColumnDesignButton'
import { Tag } from '@/components/ui/Tag'
import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'
import { buildPmCurve } from '@/lib/engineering/concrete/column/interaction'
import { getColumnDesign } from '@/lib/data/columns'
import { getProject } from '@/lib/data/projects'

export const dynamic = 'force-dynamic'

export default async function ColumnDesignPage({
  params,
}: {
  params: Promise<{ id: string; columnId: string }>
}) {
  const { id: projectId, columnId } = await params
  const [project, result] = await Promise.all([
    getProject(projectId),
    getColumnDesign(columnId),
  ])
  if (!project || !result) notFound()

  const { design, rebar, checks } = result

  // Rebuild the interaction curve for display. Uses current rebar config;
  // if no rebar exists yet, fall back to a default 4-bar section so the
  // page still renders a placeholder curve.
  const code = getCode(project.code_standard)
  const d_prime = design.clear_cover_mm + (rebar?.tie_dia_mm ?? 10) + (rebar?.bar_dia_mm ?? 20) / 2
  const curve = buildPmCurve(
    {
      b_mm: design.b_mm,
      h_mm: design.h_mm,
      d_prime_mm: d_prime,
    },
    {
      bar_count: rebar?.bar_count ?? 4,
      bar_dia_mm: rebar?.bar_dia_mm ?? 20,
      type: 'tied',
    },
    {
      fc_mpa: design.fc_mpa,
      fy_mpa: design.fy_mpa,
      fys_mpa: design.fys_mpa,
    },
    code,
  )

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-3">
        <h1 className="mono text-[20px] font-semibold">{design.label}</h1>
        <StatusTag status={design.design_status} />
        {checks?.slender ? <Tag variant="amber">SLENDER</Tag> : null}
        <span className="mono text-[11.5px]"
              style={{ color: 'var(--color-text2)' }}>
          [{design.member_ids.join(', ')}] · {design.section_name} ·{' '}
          {design.b_mm.toFixed(0)}×{design.h_mm.toFixed(0)} ·{' '}
          H {design.height_mm.toFixed(0)} mm
        </span>
        <div className="ml-auto">
          <RunColumnDesignButton projectId={projectId} columnId={columnId} />
        </div>
      </header>

      {checks ? (
        <ResultBar checks={checks} />
      ) : (
        <NoDesignBar />
      )}

      <section className="grid grid-cols-[240px_minmax(0,1fr)_260px] gap-3">
        {/* Col 1 — section + rebar */}
        <div className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>
              Cross-section
            </span>
          </div>
          <div className="cb flex flex-col items-center gap-3">
            <ColumnCrossSection
              b_mm={design.b_mm}
              h_mm={design.h_mm}
              clear_cover_mm={design.clear_cover_mm}
              bar_dia_mm={rebar?.bar_dia_mm ?? 20}
              bar_count={rebar?.bar_count ?? 4}
              tie_dia_mm={rebar?.tie_dia_mm ?? 10}
            />
            <div className="w-full flex flex-col gap-1.5 text-[11.5px] mono">
              <Row label="Bars" value={`${rebar?.bar_count ?? 4} × Ø${rebar?.bar_dia_mm ?? 20}`} />
              <Row label="Ties" value={`Ø${rebar?.tie_dia_mm ?? 10} @ ${rebar?.tie_spacing_mm ?? 200} mm`} />
              {checks ? (
                <div
                  className="rounded px-2 py-1.5"
                  style={{
                    background:
                      checks.rho_min_ok && checks.rho_max_ok
                        ? 'var(--color-green-l)'
                        : 'var(--color-red-l)',
                    color:
                      checks.rho_min_ok && checks.rho_max_ok
                        ? 'var(--color-green)'
                        : 'var(--color-red)',
                  }}
                >
                  ρ = {checks.rho_percent.toFixed(2)}% ·{' '}
                  {checks.rho_min_ok ? '≥' : '<'} 1%{' '}
                  {checks.rho_max_ok ? '≤' : '>'} 8%
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Col 2 — P-M diagram */}
        <div className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>
              P-M interaction
            </span>
          </div>
          <div className="cb flex items-center justify-center">
            <PmDiagram
              curve={curve.map((p) => ({
                phi_Pn_kN: p.phi_Pn_kN,
                phi_Mn_kNm: p.phi_Mn_kNm,
                eps_t: p.eps_t,
              }))}
              Pu_kN={checks?.pu_kn ?? 0}
              Mu_kNm={checks?.mu_major_knm ?? 0}
            />
          </div>
        </div>

        {/* Col 3 — checks */}
        <div className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>
              Check results
            </span>
          </div>
          <div className="cb flex flex-col gap-2.5">
            {checks ? (
              <>
                <Section title="Governing forces">
                  <Row label="Pu" value={`${checks.pu_kn.toFixed(1)} kN`} />
                  <Row label="Mu major" value={`${checks.mu_major_knm.toFixed(1)} kN·m`} />
                  <Row label="combo" value={checks.governing_combo?.toString() ?? '—'} />
                </Section>
                <Section title="Interaction">
                  <Row
                    label="ratio"
                    value={`${(checks.interaction_ratio * 100).toFixed(0)}%`}
                    ok={checks.interaction_ratio <= 1}
                  />
                  <Row
                    label="ρ"
                    value={`${checks.rho_percent.toFixed(2)}%`}
                    ok={checks.rho_min_ok && checks.rho_max_ok}
                  />
                </Section>
                <Section title="Shear">
                  <Row
                    label="φVn ≥ Vu"
                    value={`${checks.phi_vn_kn.toFixed(1)} ≥ ${checks.vu_kn.toFixed(1)} kN`}
                    ok={checks.shear_status === 'pass'}
                  />
                </Section>
                <Section title="Ties & slenderness">
                  <Row label="klu/r" value={checks.klu_r.toFixed(1)} />
                  <Row
                    label="slender"
                    value={checks.slender ? 'yes' : 'no'}
                    ok={!checks.slender}
                  />
                </Section>
              </>
            ) : (
              <p className="text-[11.5px]"
                 style={{ color: 'var(--color-text2)' }}>
                Run design to populate checks.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function StatusTag({ status }: { status: string }) {
  switch (status) {
    case 'pass':  return <Tag variant="green">PASS</Tag>
    case 'fail':  return <Tag variant="red">FAIL</Tag>
    case 'unverified': return <Tag variant="amber">UNVERIFIED</Tag>
    default:      return <Tag variant="amber">PENDING</Tag>
  }
}

function ResultBar({
  checks,
}: {
  checks: {
    pu_kn: number
    mu_major_knm: number
    interaction_ratio: number
    overall_status: string
  }
}) {
  const pass = checks.overall_status === 'pass'
  return (
    <div
      className="rounded px-3 py-2 flex items-baseline gap-3 text-[11.5px] mono"
      style={{
        background: pass ? 'var(--color-green-l)' : 'var(--color-red-l)',
        color: pass ? 'var(--color-green)' : 'var(--color-red)',
      }}
    >
      <span className="font-semibold">{pass ? 'PASS' : 'FAIL'}</span>
      <span>Pu {checks.pu_kn.toFixed(1)} kN · Mu {checks.mu_major_knm.toFixed(1)} kN·m</span>
      <span>· interaction {(checks.interaction_ratio * 100).toFixed(0)}%</span>
    </div>
  )
}

function NoDesignBar() {
  return (
    <div
      className="rounded px-3 py-2 text-[11.5px]"
      style={{ background: 'var(--color-amber-l)', color: 'var(--color-amber)' }}
    >
      No design results yet. Click <span className="font-semibold">Run design</span> to build the P-M curve and evaluate Pu/Mu against it.
    </div>
  )
}

function Row({
  label, value, ok,
}: {
  label: string
  value: string
  ok?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
      <span className="uppercase tracking-wider"
            style={{ color: 'var(--color-text2)' }}>
        {label}
      </span>
      <span
        className="mono"
        style={{
          color:
            ok === undefined
              ? 'var(--color-text)'
              : ok
                ? 'var(--color-green)'
                : 'var(--color-red)',
          fontWeight: ok === false ? 600 : 400,
        }}
      >
        {value} {ok === false ? '✗' : ok ? '✓' : ''}
      </span>
    </div>
  )
}

function Section({
  title, children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[9.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text2)' }}>
        {title}
      </div>
      {children}
    </div>
  )
}
