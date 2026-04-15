import { notFound } from 'next/navigation'

import { BeamCrossSection } from '@/components/beams/BeamCrossSection'
import { BeamElevation } from '@/components/beams/BeamElevation'
import { BeamRebarEditor } from '@/components/beams/BeamRebarEditor'
import { MomentEnvelope } from '@/components/beams/MomentEnvelope'
import { RunDesignButton } from '@/components/beams/RunDesignButton'
import { ShearEnvelope } from '@/components/beams/ShearEnvelope'
import { Tag } from '@/components/ui/Tag'
import {
  foldMomentEnvelope,
  foldShearEnvelope,
  getBeamDesign,
  getBeamStitchedDiagram,
} from '@/lib/data/beams'
import type {
  BeamStirrupZone,
  BeamTensionLayer,
} from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function BeamDesignPage({
  params,
}: {
  params: Promise<{ id: string; beamId: string }>
}) {
  const { id: projectId, beamId } = await params
  const result = await getBeamDesign(beamId)
  if (!result) notFound()

  const { design, rebar, checks } = result
  const stitched = await getBeamStitchedDiagram(design)
  const momentEnvelope = foldMomentEnvelope(stitched)
  const shearEnvelope = foldShearEnvelope(stitched)

  const tensionLayers: BeamTensionLayer[] =
    (rebar?.tension_layers as BeamTensionLayer[]) ?? []
  const stirrupZones: BeamStirrupZone[] =
    (rebar?.stirrup_zones as BeamStirrupZone[]) ?? []

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-baseline gap-3">
        <h1 className="mono text-[20px] font-semibold">{design.label}</h1>
        <StatusTag status={design.design_status} />
        {checks?.is_doubly_reinforced ? (
          <Tag variant="amber">DOUBLY REINFORCED</Tag>
        ) : null}
        <span className="mono text-[11.5px]"
              style={{ color: 'var(--color-text2)' }}>
          [{design.member_ids.join(', ')}] · {design.section_name} ·{' '}
          {design.total_span_mm.toFixed(0)} mm ·{' '}
          {`f'c`} {design.fc_mpa} · fy {design.fy_mpa}
        </span>
        <div className="ml-auto">
          <RunDesignButton projectId={projectId} beamId={beamId} />
        </div>
      </header>

      {checks ? (
        <ResultBar checks={checks} />
      ) : (
        <NoDesignBar />
      )}

      {/* ── Row 1: force diagrams ──────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3">
        <div className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>
              Moment envelope
            </span>
          </div>
          <div className="cb flex items-center justify-center">
            <MomentEnvelope
              envelope={momentEnvelope}
              total_span_mm={design.total_span_mm}
              mpos_peak={checks?.mu_pos_knm ?? 0}
              mpos_peak_combo={checks?.mu_pos_combo ?? null}
              mneg_peak={checks?.mu_neg_knm ?? 0}
              mneg_peak_combo={checks?.mu_neg_combo ?? null}
            />
          </div>
        </div>
        <div className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>
              Shear envelope
            </span>
          </div>
          <div className="cb flex items-center justify-center">
            <ShearEnvelope
              envelope={shearEnvelope}
              total_span_mm={design.total_span_mm}
              v_peak={checks?.vu_max_kn ?? 0}
              v_peak_combo={checks?.vu_combo ?? null}
            />
          </div>
        </div>
      </section>

      {/* ── Row 2: cross section + rebar + elevation ───────────── */}
      <section className="grid grid-cols-[220px_220px_minmax(0,1fr)] gap-3">
        <div className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>
              Cross-section
            </span>
          </div>
          <div className="cb flex items-center justify-center">
            <BeamCrossSection
              b_mm={design.b_mm}
              h_mm={design.h_mm}
              clear_cover_mm={design.clear_cover_mm}
              perimeter_dia_mm={rebar?.perimeter_dia_mm ?? 20}
              tension_layers={tensionLayers}
              compression_dia_mm={rebar?.compression_dia_mm ?? 0}
              compression_count={rebar?.compression_count ?? 0}
              stirrup_dia_mm={rebar?.stirrup_dia_mm ?? 10}
            />
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>
              Rebar
            </span>
          </div>
          <div className="cb">
            <BeamRebarEditor
              projectId={projectId}
              beamDesignId={beamId}
              initial={{
                perimeter_dia_mm: rebar?.perimeter_dia_mm ?? 20,
                tension_layers: tensionLayers,
                compression_dia_mm: rebar?.compression_dia_mm ?? 20,
                compression_count: rebar?.compression_count ?? 0,
                stirrup_dia_mm: rebar?.stirrup_dia_mm ?? 10,
                stirrup_legs: rebar?.stirrup_legs ?? 2,
              }}
              initialProvidedAs={checks?.as_provided_mm2 ?? 0}
              initialRequiredAs={checks?.as_required_mm2 ?? 0}
            />
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>
              Elevation
            </span>
          </div>
          <div className="cb flex items-center justify-center">
            <BeamElevation
              total_span_mm={design.total_span_mm}
              h_mm={design.h_mm}
              stirrup_zones={stirrupZones}
              tension_layers={tensionLayers}
              bend_point_left_mm={checks?.bend_point_left_mm ?? 0}
              bend_point_right_mm={
                checks?.bend_point_right_mm ?? design.total_span_mm
              }
            />
          </div>
        </div>
      </section>

      {/* ── Row 3: calculation breakdown ──────────────────────────── */}
      {checks ? (
        <section className="grid grid-cols-2 gap-3">
          <StepCard n={1} title="Section & Material Props">
            <Row label="b × h" value={`${design.b_mm} × ${design.h_mm} mm`} />
            <Row label="d (used)" value={`${checks.d_mm.toFixed(0)} mm`} />
            <Row label="cover" value={`${design.clear_cover_mm} mm`} />
            <Row label="f'c · fy · fys" value={`${design.fc_mpa} · ${design.fy_mpa} · ${design.fys_mpa} MPa`} />
          </StepCard>

          <StepCard n={2} title="Governing forces">
            <Row label="Mu+" value={`${checks.mu_pos_knm.toFixed(1)} kN·m (combo ${checks.mu_pos_combo ?? '—'})`} />
            <Row label="Mu−" value={`${checks.mu_neg_knm.toFixed(1)} kN·m (combo ${checks.mu_neg_combo ?? '—'})`} />
            <Row label="Vu" value={`${checks.vu_max_kn.toFixed(1)} kN (combo ${checks.vu_combo ?? '—'})`} />
          </StepCard>

          <StepCard n={3} title="φMn,max singly">
            <Row
              label="Threshold"
              value={`${checks.phi_mn_max_singly_knm.toFixed(1)} kN·m`}
            />
          </StepCard>

          <StepCard
            n={4}
            title="Doubly reinforced check"
            toneOnValue={checks.is_doubly_reinforced ? 'red' : 'green'}
          >
            <Row
              label="Trigger"
              value={
                checks.is_doubly_reinforced
                  ? `Mu+ > φMn,max → DR required`
                  : 'singly ok'
              }
            />
          </StepCard>

          <StepCard n={5} title="Required steel">
            <Row label="As,req" value={`${checks.as_required_mm2.toFixed(0)} mm²`} />
            <Row label="As,prov" value={`${checks.as_provided_mm2.toFixed(0)} mm²`} />
          </StepCard>

          <StepCard
            n={6}
            title="Flexure capacity"
            toneOnValue={checks.flexure_pos_status === 'pass' ? 'green' : 'red'}
          >
            <Row
              label="φMn+ ≥ Mu+"
              value={`${checks.phi_mn_pos_knm.toFixed(1)} ≥ ${checks.mu_pos_knm.toFixed(1)} kN·m`}
            />
            <Row
              label="φMn− ≥ Mu−"
              value={`${checks.phi_mn_neg_knm.toFixed(1)} ≥ ${checks.mu_neg_knm.toFixed(1)} kN·m`}
            />
          </StepCard>

          <StepCard
            n={7}
            title="Shear design"
            toneOnValue={checks.shear_status === 'pass' ? 'green' : 'red'}
          >
            <Row
              label="φVn ≥ Vu"
              value={`${checks.phi_vn_kn.toFixed(1)} ≥ ${checks.vu_max_kn.toFixed(1)} kN`}
            />
          </StepCard>

          <StepCard n={8} title="Bend points & perimeter capacity">
            <Row
              label="x_L"
              value={`${checks.bend_point_left_mm.toFixed(0)} mm`}
            />
            <Row
              label="x_R"
              value={`${checks.bend_point_right_mm.toFixed(0)} mm`}
            />
            <Row
              label="φMn (perim only)"
              value={`${checks.perimeter_only_phi_mn_knm.toFixed(1)} kN·m`}
            />
          </StepCard>
        </section>
      ) : null}

      {/* ── Row 4: stirrup zones + all checks ─────────────────────── */}
      {checks ? (
        <section className="grid grid-cols-2 gap-3">
          <div className="card">
            <div className="ch">
              <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--color-text2)' }}>
                Stirrup zones
              </span>
            </div>
            <div className="cb">
              {stirrupZones.length === 0 ? (
                <p className="text-[11.5px]"
                   style={{ color: 'var(--color-text2)' }}>
                  No zones yet.
                </p>
              ) : (
                <table className="t">
                  <thead>
                    <tr>
                      <th>Zone</th>
                      <th className="!text-right">Start</th>
                      <th className="!text-right">End</th>
                      <th className="!text-right">s (mm)</th>
                      <th className="!text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stirrupZones.map((z, i) => {
                      const length = Math.max(0, z.end_mm - z.start_mm)
                      const count =
                        z.spacing_mm > 0
                          ? Math.floor(length / z.spacing_mm) + 1
                          : 0
                      return (
                        <tr key={i}>
                          <td className="mono">{z.zone}</td>
                          <td className="num" style={{ textAlign: 'right' }}>
                            {z.start_mm.toFixed(0)}
                          </td>
                          <td className="num" style={{ textAlign: 'right' }}>
                            {z.end_mm.toFixed(0)}
                          </td>
                          <td className="num" style={{ textAlign: 'right' }}>
                            {z.spacing_mm.toFixed(0)}
                          </td>
                          <td className="num" style={{ textAlign: 'right' }}>
                            {count}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card">
            <div className="ch">
              <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--color-text2)' }}>
                All checks
              </span>
            </div>
            <div className="cb">
              <table className="t">
                <tbody>
                  <CheckRow
                    label="+ Flexure"
                    value={`${checks.phi_mn_pos_knm.toFixed(1)} ≥ ${checks.mu_pos_knm.toFixed(1)} kN·m`}
                    pass={checks.flexure_pos_status === 'pass'}
                  />
                  <CheckRow
                    label="− Flexure"
                    value={`${checks.phi_mn_neg_knm.toFixed(1)} ≥ ${checks.mu_neg_knm.toFixed(1)} kN·m`}
                    pass={checks.flexure_neg_status === 'pass'}
                  />
                  <CheckRow
                    label="Shear"
                    value={`${checks.phi_vn_kn.toFixed(1)} ≥ ${checks.vu_max_kn.toFixed(1)} kN`}
                    pass={checks.shear_status === 'pass'}
                  />
                  <CheckRow
                    label="Steel ratio"
                    value={`As ${checks.as_provided_mm2.toFixed(0)} ≥ ${checks.as_required_mm2.toFixed(0)} mm²`}
                    pass={checks.as_provided_mm2 >= checks.as_required_mm2}
                  />
                  <CheckRow
                    label="Code"
                    value={checks.code_standard.replace(/_/g, ' ')}
                    pass
                  />
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
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

function NoDesignBar() {
  return (
    <div
      className="rounded px-3 py-2 text-[11.5px]"
      style={{
        background: 'var(--color-amber-l)',
        color: 'var(--color-amber)',
      }}
    >
      No design results yet. Click <span className="font-semibold">Run design</span> to compute flexure, shear, and bend points for this beam.
    </div>
  )
}

function ResultBar({
  checks,
}: {
  checks: {
    mu_pos_knm: number
    phi_mn_pos_knm: number
    vu_max_kn: number
    phi_vn_kn: number
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
      <span>φMn+ {checks.phi_mn_pos_knm.toFixed(1)} ≥ Mu+ {checks.mu_pos_knm.toFixed(1)} kN·m</span>
      <span>·</span>
      <span>φVn {checks.phi_vn_kn.toFixed(1)} ≥ Vu {checks.vu_max_kn.toFixed(1)} kN</span>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10.5px] tracking-wider uppercase"
            style={{ color: 'var(--color-text2)' }}>
        {label}
      </span>
      <span className="mono">{value}</span>
    </div>
  )
}

function StepCard({
  n,
  title,
  children,
  toneOnValue,
}: {
  n: number
  title: string
  children: React.ReactNode
  toneOnValue?: 'green' | 'red'
}) {
  return (
    <div className="card">
      <div className="ch flex items-center gap-2">
        <span
          className="mono inline-flex items-center justify-center rounded text-[10px] font-semibold"
          style={{
            background: 'var(--color-blue-l)',
            color: 'var(--color-blue)',
            width: 18,
            height: 18,
          }}
        >
          {n}
        </span>
        <span className="text-[11.5px] font-semibold">{title}</span>
        {toneOnValue ? (
          <span
            className="ml-auto mono text-[10.5px]"
            style={{
              color:
                toneOnValue === 'green'
                  ? 'var(--color-green)'
                  : 'var(--color-red)',
            }}
          >
            {toneOnValue === 'green' ? '✓' : '✗'}
          </span>
        ) : null}
      </div>
      <div className="cb flex flex-col gap-1">{children}</div>
    </div>
  )
}

function CheckRow({
  label,
  value,
  pass,
}: {
  label: string
  value: string
  pass: boolean
}) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num mono" style={{ textAlign: 'right' }}>
        {value}
      </td>
      <td
        style={{
          textAlign: 'right',
          color: pass ? 'var(--color-green)' : 'var(--color-red)',
          fontWeight: 600,
        }}
      >
        {pass ? '✓' : '✗'}
      </td>
    </tr>
  )
}
