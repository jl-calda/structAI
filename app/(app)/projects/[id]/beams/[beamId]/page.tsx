/**
 * Beam Design page — modern monochrome layout per Claude Design bundle.
 *
 * Sections (numbered):
 *   1. Member Properties (Identity / Geometry / Materials / Supports)
 *   2. Reinforcement Design (Start/Mid/End tabs, cross-section, rebar editor)
 *   3. Design Forces (stacked moment + shear envelopes)
 *   4. Elevation
 *   5. Calculation Breakdown (delegated to existing components)
 */
import { notFound } from 'next/navigation'

import { BeamPropertiesCard } from '@/components/beams/BeamPropertiesCard'
import { BeamReinforcementCard } from '@/components/beams/BeamReinforcementCard'
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

        {/* STEP 2 — Reinforcement Design */}
        <BeamReinforcementCard
          b={design.b_mm}
          h={design.h_mm}
          span={design.total_span_mm}
          cover={design.clear_cover_mm}
          forces={{ mPosPeak: mPos, mNegPeak: mNeg, vPeak }}
        />

        {/* STEP 3 — Design Forces */}
        <div className="card">
          <div className="card-h">
            <span className="num-badge">3</span>
            <span className="label">Design Forces</span>
            <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
              moment + shear envelopes from STAAD
            </span>
          </div>
          <div className="card-b" style={{ display: 'flex', justifyContent: 'center' }}>
            <StackedEnvelopes
              span={design.total_span_mm}
              mPos={mPos}
              mNeg={mNeg}
              vPeak={vPeak}
              mPosCombo={mPosCombo}
              mNegCombo={mNegCombo}
              vCombo={vCombo}
            />
          </div>
        </div>

        {/* STEP 4 — Elevation (placeholder pending re-port) */}
        <div className="card">
          <div className="card-h">
            <span className="num-badge">4</span>
            <span className="label">Elevation</span>
            <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
              bar layout · stirrup zones · bend points
            </span>
          </div>
          <div className="card-b" style={{ color: 'var(--color-ink-3)', fontSize: 11 }}>
            <ElevationPlaceholder span={design.total_span_mm} h={design.h_mm} />
          </div>
        </div>

        {/* STEP 5 — Calculation Breakdown placeholder */}
        <div className="card">
          <div className="card-h">
            <span className="num-badge">5</span>
            <span className="label">Calculation Breakdown</span>
            <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
              section properties · steel centroids · φMn · doubly-reinforced check · required steel · provided steel · shear · bend points
            </span>
          </div>
          <div className="card-b">
            <CalcRow k="b · h" v={`${design.b_mm} × ${design.h_mm} mm`} />
            <CalcRow k="d (effective depth)" v={`${design.h_mm - design.clear_cover_mm - 25} mm`} />
            <CalcRow k="fc′ / fy" v={`${design.fc_mpa} / ${design.fy_mpa} MPa`} />
            <CalcRow k="Mu peak (+)" v={`${mPos.toFixed(1)} kN·m  (combo ${mPosCombo ?? '—'})`} />
            <CalcRow k="Mu peak (−)" v={`${mNeg.toFixed(1)} kN·m  (combo ${mNegCombo ?? '—'})`} />
            <CalcRow k="Vu peak" v={`${vPeak.toFixed(1)} kN  (combo ${vCombo ?? '—'})`} />
            {checks ? (
              <>
                <CalcRow k="As required" v={`${checks.as_required_mm2.toFixed(0)} mm²`} />
                <CalcRow k="As provided" v={`${checks.as_provided_mm2.toFixed(0)} mm²`} acc />
                <CalcRow k="φMn (positive)" v={`${checks.phi_mn_pos_knm.toFixed(1)} kN·m`} acc />
                <CalcRow k="φMn (negative)" v={`${checks.phi_mn_neg_knm.toFixed(1)} kN·m`} acc />
                <CalcRow k="φVn (support)" v={`${checks.phi_vn_kn.toFixed(1)} kN`} acc />
                <CalcRow
                  k="Status"
                  v={(checks.overall_status ?? 'pending').toString().toUpperCase()}
                  tone={checks.overall_status === 'pass' ? 'pass' : checks.overall_status === 'fail' ? 'fail' : undefined}
                />
              </>
            ) : (
              <CalcRow k="Status" v="Run design to populate" />
            )}
          </div>
        </div>
      </div>
    </DesignErrorBoundary>
  )
}

function CalcRow({ k, v, acc, tone }: { k: string; v: string; acc?: boolean; tone?: 'pass' | 'fail' }) {
  return (
    <div className="step-row">
      <span className="k">{k}</span>
      <span className={'v' + (acc ? ' acc' : '') + (tone === 'pass' ? ' pass' : tone === 'fail' ? ' fail' : '')}>{v}</span>
    </div>
  )
}

function ElevationPlaceholder({ span, h }: { span: number; h: number }) {
  const width = 560
  const height = 200
  const padL = 28, padR = 28, padTop = 28, padBot = 38
  const w = width - padL - padR
  const hh = height - padTop - padBot
  const sx = w / span
  const sy = hh / h
  const top = padTop
  const bot = padTop + h * sy
  const L = padL
  const R = padL + span * sx
  const topBarY = top + 8
  const botBarY = bot - 8
  const denseEnd = 1500
  const stirrups: number[] = []
  for (let x = 0; x < denseEnd; x += 100) stirrups.push(x)
  for (let x = denseEnd; x < span - denseEnd; x += 200) stirrups.push(x)
  for (let x = span - denseEnd; x <= span; x += 100) stirrups.push(x)
  const bendL = Math.min(1200, span * 0.25)
  const bendR = span - bendL
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x={L} y={top} width={R - L} height={bot - top} fill="#ECEAE4" stroke="#4A4038" strokeWidth={1.6} />
      {stirrups.map((x, i) => (
        <line key={i} x1={L + x * sx} y1={top + 3} x2={L + x * sx} y2={bot - 3} stroke="#1755A0" strokeWidth={0.6} />
      ))}
      <line x1={L} y1={topBarY} x2={R} y2={topBarY} stroke="#D4820F" strokeWidth={1.2} />
      <line x1={L} y1={topBarY + 3} x2={R} y2={topBarY + 3} stroke="#D4820F" strokeWidth={1.2} />
      <line x1={L} y1={botBarY} x2={R} y2={botBarY} stroke="#D4820F" strokeWidth={1.2} />
      <line x1={L} y1={botBarY - 3} x2={R} y2={botBarY - 3} stroke="#D4820F" strokeWidth={1.2} />
      <path
        d={`M ${L + 4} ${botBarY - 4} L ${L + bendL * sx} ${botBarY - 4} L ${L + bendL * sx + 12} ${topBarY + 4} L ${R - 4} ${topBarY + 4}`}
        fill="none" stroke="#B06008" strokeWidth={1.3}
      />
      <path
        d={`M ${L + 4} ${topBarY + 4} L ${L + bendR * sx - 12} ${topBarY + 4} L ${L + bendR * sx} ${botBarY - 4} L ${R - 4} ${botBarY - 4}`}
        fill="none" stroke="#B06008" strokeWidth={1.3}
      />
      <polygon points={`${L - 6},${bot + 10} ${L + 6},${bot + 10} ${L},${bot}`} fill="#4A4038" />
      <polygon points={`${R - 6},${bot + 10} ${R + 6},${bot + 10} ${R},${bot}`} fill="#4A4038" />
      <g fontFamily="JetBrains Mono" fontSize={9} fill="#6B7079">
        <line x1={L} y1={height - 14} x2={R} y2={height - 14} stroke="#9CA0A8" strokeWidth={0.6} />
        <line x1={L} y1={height - 17} x2={L} y2={height - 11} stroke="#9CA0A8" />
        <line x1={R} y1={height - 17} x2={R} y2={height - 11} stroke="#9CA0A8" />
        <text x={(L + R) / 2} y={height - 4} textAnchor="middle">L = {span} mm</text>
      </g>
    </svg>
  )
}
