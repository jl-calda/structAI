/**
 * Column Design page — full 7-step layout per Claude Design bundle.
 *
 * Steps:
 *   1. Member Properties (geometry, materials, framing)
 *   1b. Member Definition & Loads (STAAD member sets + manual input)
 *   2. Reinforcement Design (cross-section + rebar editor + ties)
 *   3. Design Forces (P-M interaction + biaxial surface)
 *   4. Elevation / Tie Layout (confined zones)
 *   4b. Development & Splicing
 *   5. Calculation Breakdown (6 tabs)
 *   6. Material Take-Off (cutting list)
 */
import { notFound } from 'next/navigation'

import { BiaxialSurface } from '@/components/columns/BiaxialSurface'
import { ColCalcBreakdownCard } from '@/components/columns/ColCalcBreakdownCard'
import { ColDevSpliceCard } from '@/components/columns/ColDevSpliceCard'
import { ColRebarMTO } from '@/components/columns/ColRebarMTO'
import { ColumnElevation } from '@/components/columns/ColumnElevation'
import { ColumnMemberLoadsCard } from '@/components/columns/MemberLoadsCard'
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
import { getLatestSync, listMembers } from '@/lib/data/staad'

export const dynamic = 'force-dynamic'

export default async function ColumnDesignPage({
  params,
}: {
  params: Promise<{ id: string; columnId: string }>
}) {
  const { id: projectId, columnId } = await params
  const [project, result, latest, allMembers] = await Promise.all([
    getProject(projectId),
    getColumnDesign(columnId),
    getLatestSync(projectId),
    listMembers(projectId),
  ])
  if (!project || !result) notFound()

  const { design, rebar, checks } = result

  const code = getCode(project.code_standard)
  const barDia = rebar?.bar_dia_mm ?? code.default_dia_long
  const tieDia = rebar?.tie_dia_mm ?? code.default_dia_stirrup
  const barCount = rebar?.bar_count ?? 8
  const tieMid = rebar?.tie_spacing_mm ?? 200
  const tieEnd = rebar?.tie_spacing_end_mm ?? 100
  const tieEndZone = rebar?.tie_end_zone_length_mm ?? Math.max(design.h_mm, Math.round(design.height_mm / 6), 450)

  const d_prime = design.clear_cover_mm + tieDia + barDia / 2
  const curve = buildPmCurve(
    { b_mm: design.b_mm, h_mm: design.h_mm, d_prime_mm: d_prime },
    { bar_count: barCount, bar_dia_mm: barDia, type: 'tied' },
    { fc_mpa: design.fc_mpa, fy_mpa: design.fy_mpa, fys_mpa: design.fys_mpa },
    code,
  )

  const A = (d: number) => Math.PI * d * d / 4
  const nLong = barCount
  const AsLong = nLong * A(barDia)
  const Ag = design.b_mm * design.h_mm
  const rhoG = AsLong / Ag
  const dEff = design.h_mm - design.clear_cover_mm - tieDia - barDia / 2

  const phi = code.phi_axial(0, 'tied')
  const factor = code.Pn_max_factor('tied')
  const Po = 0.85 * design.fc_mpa * (Ag - AsLong) + design.fy_mpa * AsLong
  const phiPnMax = factor * phi * Po / 1000

  const Pu = checks?.pu_kn ?? 0
  const Mux = checks?.mu_major_knm ?? 0
  const Muy = checks?.mu_minor_knm ?? 0
  const Vu = checks?.vu_kn ?? 0
  const phiMn = checks?.phi_mn_knm ?? (phiPnMax > 0 ? phiPnMax * 0.3 : 100)

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
          <span className="tag">TIED</span>
          <span className={'tag ' + (status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'warn')}>
            {status.toUpperCase()}
          </span>
          {checks?.slender ? <span className="tag warn">SLENDER</span> : null}
          <span style={{ color: 'var(--color-ink-3)', fontSize: 11.5 }}>
            C-{design.b_mm.toFixed(0)}×{design.h_mm.toFixed(0)} · H = {design.height_mm.toFixed(0)} mm
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

        {/* STEP 1b — Member Definition & Loads */}
        <ColumnMemberLoadsCard
          projectId={projectId}
          initialMemberIds={design.member_ids}
          allMembers={allMembers.map(m => ({
            member_id: m.member_id,
            section_name: m.section_name,
            length_mm: m.length_mm,
            member_type: m.member_type,
          }))}
          designLabel={design.label}
        />

        {/* STEP 2 — Reinforcement Design */}
        <div className="card" data-step="2-reinforcement">
          <div className="card-h">
            <span className="num-badge">2</span>
            <span className="label">Reinforcement Design</span>
            <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
              longitudinal pattern is full-height · ties zoned per {code.code.replace(/_/g, ' ')}
            </span>
          </div>
          <ColumnRebarEditor
            projectId={projectId}
            columnDesignId={columnId}
            initial={{
              bar_dia_mm: barDia,
              bar_count: barCount,
              tie_dia_mm: tieDia,
              tie_spacing_mm: tieMid,
              tie_spacing_end_mm: tieEnd,
              tie_end_zone_length_mm: tieEndZone,
            }}
            initialInteraction={checks?.interaction_ratio ?? null}
            initialRho={checks?.rho_percent ?? null}
            b_mm={design.b_mm}
            h_mm={design.h_mm}
            clear_cover_mm={design.clear_cover_mm}
            fc_mpa={design.fc_mpa}
            fy_mpa={design.fy_mpa}
            code_standard={project.code_standard}
          />
        </div>

        {/* STEP 3 — Design Forces (P-M + Biaxial) */}
        <div className="card" data-step="3-forces">
          <div className="card-h">
            <span className="num-badge">3</span>
            <span className="label">Design Forces · STAAD Envelope</span>
            <div className="right">
              <span className="tag">Pu,max {Pu.toFixed(0)}</span>
              <span className="tag">Mux {Mux.toFixed(1)}</span>
              <span className="tag">Muy {Muy.toFixed(1)}</span>
              <span className="tag">V {Vu.toFixed(1)}</span>
            </div>
          </div>
          <div className="card-b" style={{ padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <PmDiagram
              curve={curve.map(p => ({
                phi_Pn_kN: p.phi_Pn_kN,
                phi_Mn_kNm: p.phi_Mn_kNm,
                eps_t: p.eps_t,
              }))}
              Pu_kN={Pu}
              Mu_kNm={Mux}
            />
            <BiaxialSurface
              phiPnMax={phiPnMax}
              phiMn={phiMn}
              Pu={Pu}
              Mux={Mux}
              Muy={Muy}
            />
          </div>
        </div>

        {/* STEP 4 — Elevation / Tie Layout */}
        <div className="card">
          <div className="card-h">
            <span className="num-badge">4</span>
            <span className="label">Elevation · Tie Layout</span>
            <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
              confined zones at top &amp; bottom · {tieEnd}/{tieMid} mm
            </span>
          </div>
          <div className="card-b" style={{ padding: 10, display: 'flex', justifyContent: 'center' }}>
            <ColumnElevation
              b={design.b_mm} h={design.h_mm} Hc={design.height_mm}
              cover={design.clear_cover_mm}
              barDia={barDia} tieDia={tieDia}
              sConf={tieEnd} sMid={tieMid} loConf={tieEndZone}
            />
          </div>
        </div>

        {/* STEP 4b — Development & Splicing */}
        <ColDevSpliceCard
          fc={design.fc_mpa} fy={design.fy_mpa}
          cover={design.clear_cover_mm}
          b={design.b_mm} h={design.h_mm} Hc={design.height_mm}
          barDia={barDia} tieDia={tieDia}
          nLong={nLong}
          code_standard={project.code_standard}
        />

        {/* STEP 5 — Calculation Breakdown */}
        <ColCalcBreakdownCard
          b={design.b_mm} h={design.h_mm} cover={design.clear_cover_mm}
          fc={design.fc_mpa} fy={design.fy_mpa} Hc={design.height_mm}
          barDia={barDia} tieDia={tieDia}
          nLong={nLong} AsLong={AsLong} Ag={Ag} rhoG={rhoG}
          sConf={tieEnd} sMid={tieMid} loConf={tieEndZone}
          classCol="Tied" bracedFrame={true}
          PuMax={Pu} Mux={Mux} Muy={Muy} Vu={Vu} phiMn={phiMn}
          dEff={dEff}
          code_standard={project.code_standard}
        />

        {/* STEP 6 — Material Take-Off */}
        <ColRebarMTO
          colId={design.label}
          b={design.b_mm} h={design.h_mm} Hc={design.height_mm}
          cover={design.clear_cover_mm}
          barDia={barDia} nLong={nLong}
          tieDia={tieDia} tiePattern="perim+x"
          sConf={tieEnd} sMid={tieMid} loConf={tieEndZone}
          fc={design.fc_mpa} fy={design.fy_mpa}
          code_standard={project.code_standard}
        />
      </div>
    </DesignErrorBoundary>
  )
}
