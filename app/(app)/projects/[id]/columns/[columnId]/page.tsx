/**
 * Column Design page — modern monochrome layout per Claude Design bundle.
 *
 * Sections:
 *   1. Member Properties (geometry, materials, slenderness)
 *   2. Reinforcement & Cross-section (rebar editor + live preview)
 *   3. P-M Interaction Diagram
 *   4. Check Results (forces / interaction / shear / ties)
 */
import { notFound } from 'next/navigation'

import { ColumnCrossSection } from '@/components/columns/ColumnCrossSection'
import { ColumnPropertiesCard } from '@/components/columns/ColumnPropertiesCard'
import { ColumnRebarEditor } from '@/components/columns/ColumnRebarEditor'
import { PmDiagram } from '@/components/columns/PmDiagram'
import { RunColumnDesignButton } from '@/components/columns/RunColumnDesignButton'
import { DesignErrorBoundary } from '@/components/ui/DesignErrorBoundary'
import { Icon } from '@/components/ui/Icon'
import { PrintButton } from '@/components/ui/PrintButton'
import { PrintHeader } from '@/components/ui/PrintHeader'
import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'
import { buildPmCurve } from '@/lib/engineering/concrete/column/interaction'
import { getColumnDesign } from '@/lib/data/columns'
import { getProject } from '@/lib/data/projects'
import { getLatestSync } from '@/lib/data/staad'

export const dynamic = 'force-dynamic'

export default async function ColumnDesignPage({
  params,
}: {
  params: Promise<{ id: string; columnId: string }>
}) {
  const { id: projectId, columnId } = await params
  const [project, result, latest] = await Promise.all([
    getProject(projectId),
    getColumnDesign(columnId),
    getLatestSync(projectId),
  ])
  if (!project || !result) notFound()

  const { design, rebar, checks } = result

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

  const status: 'pass' | 'fail' | 'pending' =
    design.design_status === 'pass' || design.design_status === 'fail'
      ? design.design_status
      : 'pending'

  const syncOk = latest && latest.status !== 'red'

  return (
    <DesignErrorBoundary>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PrintHeader
          projectName={project.name}
          designLabel={design.label}
          designType="Column Design"
          codeStandard={project.code_standard}
        />

        {/* Header */}
        <div className="row" style={{ padding: '2px 2px 4px', gap: 10, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>
            {design.label}
          </span>
          <span className="tag">COLUMN</span>
          <span className={'tag ' + (status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'warn')}>
            {status.toUpperCase()}
          </span>
          {checks?.slender ? <span className="tag warn">SLENDER</span> : null}
          <span style={{ color: 'var(--color-ink-3)', fontSize: 11.5 }}>
            {design.section_name} · {design.b_mm.toFixed(0)}×{design.h_mm.toFixed(0)} · H {design.height_mm.toFixed(0)} mm
          </span>
          {design.member_ids.length > 0 && (
            <span style={{ color: 'var(--color-ink-4)', fontSize: 11 }} className="mono">
              members {design.member_ids.join(' / ')}
            </span>
          )}
          <div className="spacer" />
          {checks && (
            <div className={'result-bar ' + (checks.overall_status === 'pass' ? 'pass' : 'fail')} style={{ margin: 0, padding: '4px 10px' }}>
              <span className="label">Pu</span>
              <span>{checks.pu_kn.toFixed(1)}</span>
              <span style={{ color: 'var(--color-ink-3)' }}>kN ·</span>
              <span className="label">Mu</span>
              <span>{checks.mu_major_knm.toFixed(1)}</span>
              <span style={{ color: 'var(--color-ink-3)' }}>kN·m · ratio</span>
              <span>{(checks.interaction_ratio * 100).toFixed(0)}%</span>
              <span>{checks.overall_status === 'pass' ? '✓' : '✗'}</span>
            </div>
          )}
          <PrintButton />
          <RunColumnDesignButton projectId={projectId} columnId={columnId} />
        </div>

        {/* Sync banner */}
        <div className={'sync ' + (syncOk ? '' : latest ? 'red' : 'amber')}>
          <span className="led" />
          <span style={{ fontWeight: 500 }}>{latest ? 'STAAD connected' : 'STAAD offline'}</span>
          {latest && (
            <span className="mono" style={{ color: 'var(--color-ink-3)' }}>
              · {latest.row.file_name} · {latest.row.synced_at.slice(0, 16).replace('T', ' ')} · {latest.row.unit_system ?? 'unknown'} · {latest.row.file_hash.slice(0, 6)}
            </span>
          )}
          <div className="spacer" />
          <button className="btn sm ghost"><Icon name="sync" size={11} /> Re-sync</button>
        </div>

        {/* STEP 1 — Member Properties */}
        <ColumnPropertiesCard
          initial={{
            label: design.label,
            b: design.b_mm,
            h: design.h_mm,
            height: design.height_mm,
            cover: design.clear_cover_mm,
            fc: design.fc_mpa,
            fy: design.fy_mpa,
          }}
          staadRef={design.member_ids.length > 0 ? design.member_ids.join(' / ') : undefined}
          code_standard={project.code_standard}
        />

        {/* STEP 2 — Reinforcement */}
        <div className="card">
          <div className="card-h">
            <span className="num-badge">2</span>
            <span className="label">Reinforcement Design</span>
            <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
              longitudinal bars · ties · spacing
            </span>
          </div>
          <div className="card-b" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <ColumnCrossSection
                b_mm={design.b_mm}
                h_mm={design.h_mm}
                clear_cover_mm={design.clear_cover_mm}
                bar_dia_mm={rebar?.bar_dia_mm ?? 20}
                bar_count={rebar?.bar_count ?? 4}
                tie_dia_mm={rebar?.tie_dia_mm ?? 10}
              />
            </div>
            <div>
              <ColumnRebarEditor
                projectId={projectId}
                columnDesignId={columnId}
                initial={{
                  bar_dia_mm: rebar?.bar_dia_mm ?? 20,
                  bar_count: rebar?.bar_count ?? 4,
                  tie_dia_mm: rebar?.tie_dia_mm ?? 10,
                  tie_spacing_mm: rebar?.tie_spacing_mm ?? 200,
                  tie_spacing_end_mm: rebar?.tie_spacing_end_mm ?? 100,
                  tie_end_zone_length_mm: rebar?.tie_end_zone_length_mm ?? 500,
                }}
                initialInteraction={checks?.interaction_ratio ?? null}
                initialRho={checks?.rho_percent ?? null}
              />
            </div>
          </div>
        </div>

        {/* STEP 3 — P-M Interaction */}
        <div className="card">
          <div className="card-h">
            <span className="num-badge">3</span>
            <span className="label">P-M Interaction</span>
            <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
              strain-compatibility sweep · governing combo plotted
            </span>
          </div>
          <div className="card-b" style={{ display: 'flex', justifyContent: 'center' }}>
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

        {/* STEP 4 — Checks */}
        <div className="card">
          <div className="card-h">
            <span className="num-badge">4</span>
            <span className="label">Check Results</span>
            <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
              ACI 318-19 / NSCP 2015 code checks
            </span>
          </div>
          <div className="card-b">
            {checks ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                <CheckSection title="Governing forces">
                  <CheckRow k="Pu" v={`${checks.pu_kn.toFixed(1)} kN`} />
                  <CheckRow k="Mu major" v={`${checks.mu_major_knm.toFixed(1)} kN·m`} />
                  <CheckRow k="combo" v={checks.governing_combo?.toString() ?? '—'} />
                </CheckSection>
                <CheckSection title="Interaction">
                  <CheckRow k="ratio" v={`${(checks.interaction_ratio * 100).toFixed(0)}%`} ok={checks.interaction_ratio <= 1} />
                  <CheckRow k="ρ" v={`${checks.rho_percent.toFixed(2)}%`} ok={checks.rho_min_ok && checks.rho_max_ok} />
                </CheckSection>
                <CheckSection title="Shear">
                  <CheckRow k="φVn ≥ Vu" v={`${checks.phi_vn_kn.toFixed(1)} ≥ ${checks.vu_kn.toFixed(1)} kN`} ok={checks.shear_status === 'pass'} />
                </CheckSection>
                <CheckSection title="Ties &amp; slenderness">
                  <CheckRow k="klu/r" v={checks.klu_r.toFixed(1)} />
                  <CheckRow k="slender" v={checks.slender ? 'yes' : 'no'} ok={!checks.slender} />
                </CheckSection>
              </div>
            ) : (
              <p style={{ fontSize: 11.5, color: 'var(--color-ink-3)' }}>Run design to populate checks.</p>
            )}
          </div>
        </div>
      </div>
    </DesignErrorBoundary>
  )
}

function CheckSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="sub-label" style={{ marginBottom: 4 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>
    </div>
  )
}

function CheckRow({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, padding: '2px 0' }}>
      <span style={{ color: 'var(--color-ink-3)' }}>{k}</span>
      <span
        className="mono"
        style={{
          color: ok === undefined ? 'var(--color-ink)' : ok ? 'var(--color-pass)' : 'var(--color-fail)',
          fontWeight: ok === false ? 600 : 400,
        }}
      >
        {v} {ok === false ? '✗' : ok ? '✓' : ''}
      </span>
    </div>
  )
}
