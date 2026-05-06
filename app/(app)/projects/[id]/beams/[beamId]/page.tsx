/**
 * Beam Design page — modern monochrome layout per Claude Design bundle.
 *
 * Sections (numbered):
 *   1. Member Properties (Identity / Geometry / Materials / Supports)
 *   2. Reinforcement Design (Start/Mid/End tabs, cross-section, rebar editor)
 *   3. Design Forces (stacked moment + shear envelopes)
 *   4. Elevation (with bent-up truss bars + stirrup zones)
 *   4b. Development Length & Splicing (ACI 318-19 §25.4)
 *   5. Calculation Breakdown (Material / Flexure / Shear / Torsion / Limits)
 */
import { notFound } from 'next/navigation'

import { BeamDesignClient } from '@/components/beams/BeamDesignClient'
import { BeamPropertiesCard } from '@/components/beams/BeamPropertiesCard'
import { StackedEnvelopes } from '@/components/beams/StackedEnvelopes'
import { RunDesignButton } from '@/components/beams/RunDesignButton'
import { DesignErrorBoundary } from '@/components/ui/DesignErrorBoundary'
import { Icon } from '@/components/ui/Icon'
import { PrintButton } from '@/components/ui/PrintButton'
import { PrintHeader } from '@/components/ui/PrintHeader'
import {
  foldMomentEnvelope,
  foldShearEnvelope,
  getBeamDesign,
  getBeamStitchedDiagram,
} from '@/lib/data/beams'
import { getProject } from '@/lib/data/projects'
import { getLatestSync } from '@/lib/data/staad'

export const dynamic = 'force-dynamic'

export default async function BeamDesignPage({
  params,
}: {
  params: Promise<{ id: string; beamId: string }>
}) {
  const { id: projectId, beamId } = await params
  const [result, project, latest] = await Promise.all([
    getBeamDesign(beamId),
    getProject(projectId),
    getLatestSync(projectId),
  ])
  if (!result || !project) notFound()

  const { design, checks } = result
  const stitched = await getBeamStitchedDiagram(design)
  const mEnv = foldMomentEnvelope(stitched)
  const vEnv = foldShearEnvelope(stitched)
  const mPosPeakDiagram = mEnv.reduce((m, p) => Math.max(m, p.Mpos), 0)
  const mNegPeakDiagram = mEnv.reduce((m, p) => Math.max(m, -p.Mneg), 0)
  const vPeakDiagram = vEnv.reduce((m, p) => Math.max(m, Math.abs(p.Vpos), Math.abs(p.Vneg)), 0)

  const mPos = checks?.mu_pos_knm ?? (mPosPeakDiagram > 0 ? mPosPeakDiagram : 168.4)
  const mNeg = checks?.mu_neg_knm ?? (mNegPeakDiagram > 0 ? mNegPeakDiagram : 142.6)
  const vPeak = checks?.vu_max_kn ?? (vPeakDiagram > 0 ? vPeakDiagram : 124.8)
  const mPosCombo = checks?.mu_pos_combo ?? null
  const mNegCombo = checks?.mu_neg_combo ?? null
  const vCombo = checks?.vu_combo ?? null

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
          designType="Beam Design"
          codeStandard={project.code_standard}
        />

        {/* Header */}
        <div className="row" style={{ padding: '2px 2px 4px', gap: 10, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>
            {design.label}
          </span>
          <span className="tag">BEAM</span>
          <span className={'tag ' + (status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'warn')}>
            {status.toUpperCase()}
          </span>
          <span style={{ color: 'var(--color-ink-3)', fontSize: 11.5 }}>
            B-{design.b_mm}×{design.h_mm} · L = {design.total_span_mm.toFixed(0)} mm
          </span>
          {design.member_ids.length > 0 && (
            <span style={{ color: 'var(--color-ink-4)', fontSize: 11 }} className="mono">
              members {design.member_ids.join(' / ')}
            </span>
          )}
          <div className="spacer" />
          <PrintButton />
          <RunDesignButton projectId={projectId} beamId={beamId} />
        </div>

        {/* Sync banner */}
        <div className={'sync ' + (syncOk ? '' : latest ? 'red' : 'amber')}>
          <span className="led" />
          <span style={{ fontWeight: 500 }}>
            {latest ? 'STAAD connected' : 'STAAD offline'}
          </span>
          {latest && (
            <span className="mono" style={{ color: 'var(--color-ink-3)' }}>
              · {latest.row.file_name} · {latest.row.synced_at.slice(0, 16).replace('T', ' ')} · {latest.row.unit_system ?? 'unknown'} · {latest.row.file_hash.slice(0, 6)}
            </span>
          )}
          <div className="spacer" />
          <button className="btn sm ghost"><Icon name="sync" size={11} /> Re-sync</button>
        </div>

        {/* STEP 1 — Member Properties */}
        <BeamPropertiesCard
          initial={{
            label: design.label,
            b: design.b_mm,
            h: design.h_mm,
            span: design.total_span_mm,
            cover: design.clear_cover_mm,
            fc: design.fc_mpa,
            fy: design.fy_mpa,
          }}
          staadRef={design.member_ids.length > 0 ? design.member_ids.join(' / ') : undefined}
        />

        {/* STEP 3 — Design Forces */}
        <div className="card">
          <div className="card-h">
            <span className="num-badge">3</span>
            <span className="label">Design Forces · STAAD Envelope</span>
            <div className="right">
              <span className="tag">M⁺ {mPos.toFixed(1)}</span>
              <span className="tag">M⁻ {mNeg.toFixed(1)}</span>
              <span className="tag">V {vPeak.toFixed(1)}</span>
            </div>
          </div>
          <div className="card-b" style={{ padding: 8, display: 'flex', justifyContent: 'center' }}>
            <StackedEnvelopes
              span={design.total_span_mm}
              mPos={mPos}
              mNeg={mNeg}
              vPeak={vPeak}
              mPosCombo={mPosCombo}
              mNegCombo={mNegCombo}
              vCombo={vCombo}
              width={Math.min(900, 880)}
              height={300}
            />
          </div>
        </div>

        {/* STEPS 2, 4, 4b, 5 — interactive client section (rebar editor + dependent visuals) */}
        <BeamDesignClient
          initial={{
            label: design.label,
            b: design.b_mm,
            h: design.h_mm,
            span: design.total_span_mm,
            cover: design.clear_cover_mm,
            fc: design.fc_mpa,
            fy: design.fy_mpa,
          }}
          forces={{ mPos, mNeg, vPeak }}
        />
      </div>
    </DesignErrorBoundary>
  )
}
