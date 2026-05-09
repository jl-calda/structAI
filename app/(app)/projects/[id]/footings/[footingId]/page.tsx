/**
 * Footing Design page — rich 7-step interactive layout per Claude Design bundle.
 *
 * Steps:
 *   1. Member Properties (geometry, soil, column reactions, tie-beam)
 *   2. Reinforcement Design (plan + rebar controls + capacity)
 *   3. Design Forces (bearing, punching, one-way shear)
 *   4. Plan & Section (full plan + A-A/B-B cuts)
 *   4b. Development & Splicing
 *   5. Calculation Breakdown (7 tabs)
 *   6. Material Take-Off
 */
import { notFound } from 'next/navigation'

import { FootingDesignClient } from '@/components/footings/FootingDesignClient'
import { RunFootingButton } from '@/components/footings/RunFootingButton'
import { DesignErrorBoundary } from '@/components/ui/DesignErrorBoundary'
import { Icon } from '@/components/ui/Icon'
import { PrintButton } from '@/components/ui/PrintButton'
import { PrintHeader } from '@/components/ui/PrintHeader'
import { getColumnDesign } from '@/lib/data/columns'
import { getFootingDesign } from '@/lib/data/footings'
import { getProject } from '@/lib/data/projects'
import { getLatestSync } from '@/lib/data/staad'

export const dynamic = 'force-dynamic'

export default async function FootingDesignPage({
  params,
}: {
  params: Promise<{ id: string; footingId: string }>
}) {
  const { id: projectId, footingId } = await params
  const [result, project, latest] = await Promise.all([
    getFootingDesign(footingId),
    getProject(projectId),
    getLatestSync(projectId),
  ])
  if (!result || !project) notFound()
  const { design, checks } = result
  const col = design.column_design_id ? await getColumnDesign(design.column_design_id) : null

  const colB = col?.design?.b_mm ?? design.col_b_mm ?? 400
  const colH = col?.design?.h_mm ?? design.col_h_mm ?? 400

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
          designType="Footing Design"
          codeStandard={project.code_standard}
        />

        {/* Header */}
        <div className="row" style={{ padding: '2px 2px 4px', gap: 10, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>
            {design.label}
          </span>
          <span className="tag">FOOTING</span>
          <span className="tag">{design.footing_type.toUpperCase()}</span>
          <span className={'tag ' + (status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'warn')}>
            {status.toUpperCase()}
          </span>
          {col?.design?.label && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--color-ink-3)' }}>
              linked → {col.design.label}
            </span>
          )}
          <span style={{ color: 'var(--color-ink-3)', fontSize: 11.5 }}>
            {design.length_x_mm.toFixed(0)} × {design.width_y_mm.toFixed(0)} × {design.depth_mm.toFixed(0)} mm
          </span>
          <div className="spacer" />
          {checks && (
            <div className={'result-bar ' + (status === 'pass' ? 'pass' : 'fail')} style={{ margin: 0, padding: '4px 10px' }}>
              <span className="label">Pu</span>
              <span>{checks.pu_kn.toFixed(1)}</span>
              <span style={{ color: 'var(--color-ink-3)' }}>kN · q</span>
              <span>{checks.q_net_kpa.toFixed(1)}</span>
              <span style={{ color: 'var(--color-ink-3)' }}>kPa</span>
              <span>{status === 'pass' ? '✓' : '✗'}</span>
            </div>
          )}
          <PrintButton />
          <RunFootingButton projectId={projectId} footingId={footingId} />
        </div>

        {/* Sync banner */}
        <div className={'sync ' + (syncOk ? '' : latest ? 'red' : 'amber')}>
          <span className="led" />
          <span style={{ fontWeight: 500 }}>{latest ? 'STAAD connected' : 'STAAD offline'}</span>
          {latest && (
            <span className="mono" style={{ color: 'var(--color-ink-3)' }}>
              · {latest.row.file_name} · {latest.row.unit_system ?? 'unknown'}
            </span>
          )}
          <div className="spacer" />
          <button className="btn sm ghost"><Icon name="sync" size={11} /> Re-sync</button>
        </div>

        {/* All interactive steps (2–6) */}
        <FootingDesignClient
          initial={{
            label: design.label,
            Lx: design.length_x_mm,
            Ly: design.width_y_mm,
            depth: design.depth_mm,
            cover: design.clear_cover_mm,
            fc: design.fc_mpa,
            fy: design.fy_mpa,
            qa: design.bearing_capacity_kpa,
            soilDepth: design.soil_depth_mm,
            soilGamma: 18,
            colB,
            colH,
            Pser: checks?.pu_kn ? checks.pu_kn * 0.7 : design.manual_pu_kn ?? 500,
            Mser: checks?.mu_knm ? checks.mu_knm * 0.7 : design.manual_mu_knm ?? 30,
            Pu: checks?.pu_kn ?? design.manual_pu_kn ?? 700,
            Mu: checks?.mu_knm ?? design.manual_mu_knm ?? 45,
            sds: 0.44,
          }}
          code_standard={project.code_standard}
          checks={checks ?? null}
        />
      </div>
    </DesignErrorBoundary>
  )
}
