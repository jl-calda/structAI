import { notFound } from 'next/navigation'

import { DesignErrorBoundary } from '@/components/ui/DesignErrorBoundary'
import { RunFootingButton } from '@/components/footings/RunFootingButton'
import { Tag } from '@/components/ui/Tag'
import { getColumnDesign } from '@/lib/data/columns'
import { getFootingDesign } from '@/lib/data/footings'

export const dynamic = 'force-dynamic'

export default async function FootingDesignPage({
  params,
}: {
  params: Promise<{ id: string; footingId: string }>
}) {
  const { id: projectId, footingId } = await params
  const result = await getFootingDesign(footingId)
  if (!result) notFound()
  const { design, checks } = result
  const col = design.column_design_id
    ? await getColumnDesign(design.column_design_id)
    : null

  return (
    <DesignErrorBoundary>
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-3">
        <h1 className="mono text-[20px] font-semibold">{design.label}</h1>
        <Tag variant="green">{design.footing_type.toUpperCase()}</Tag>
        <StatusTag status={design.design_status} />
        {col?.design?.label ? (
          <span className="mono text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
            linked to col {col.design.label}
          </span>
        ) : null}
        <span className="mono text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
          {design.length_x_mm.toFixed(0)} × {design.width_y_mm.toFixed(0)} × {design.depth_mm.toFixed(0)} mm
        </span>
        <div className="ml-auto">
          <RunFootingButton projectId={projectId} footingId={footingId} />
        </div>
      </header>

      <section className="grid grid-cols-[240px_minmax(0,1fr)_260px] gap-3">
        <div className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>Geometry & soil</span>
          </div>
          <div className="cb flex flex-col gap-1.5 text-[12px]">
            <Row label="Lx" value={`${design.length_x_mm.toFixed(0)} mm`} />
            <Row label="Ly" value={`${design.width_y_mm.toFixed(0)} mm`} />
            <Row label="Depth" value={`${design.depth_mm.toFixed(0)} mm`} />
            <Row label="Cover" value={`${design.clear_cover_mm.toFixed(0)} mm`} />
            <Row label="qa" value={`${design.bearing_capacity_kpa.toFixed(1)} kPa`} />
            <Row label="Soil depth" value={`${design.soil_depth_mm.toFixed(0)} mm`} />
            <Row label="f'c · fy" value={`${design.fc_mpa} · ${design.fy_mpa} MPa`} />
            {checks ? (
              <div className="pt-1 mt-1 border-t"
                   style={{ borderColor: 'var(--color-border)' }}>
                <Row label="Pu" value={`${checks.pu_kn.toFixed(1)} kN`} />
                <Row label="Mu" value={`${checks.mu_knm.toFixed(1)} kN·m`} />
                <Row label="combo" value={checks.governing_combo?.toString() ?? '—'} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>Footing plan</span>
          </div>
          <div className="cb flex items-center justify-center">
            <FootingPlan
              Lx={design.length_x_mm}
              Ly={design.width_y_mm}
              col_b={col?.design?.b_mm ?? 400}
              col_h={col?.design?.h_mm ?? 400}
              depth={design.depth_mm}
              cover={design.clear_cover_mm}
            />
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>Checks</span>
          </div>
          <div className="cb flex flex-col gap-2.5">
            {checks ? (
              <>
                <Section title="Soil pressure">
                  <Row
                    label="q_net"
                    value={`${checks.q_net_kpa.toFixed(1)} kPa`}
                    ok={checks.bearing_status === 'pass'}
                  />
                  <Row
                    label="qa"
                    value={`${design.bearing_capacity_kpa.toFixed(1)} kPa`}
                  />
                </Section>
                <Section title="Shear">
                  <Row
                    label="one-way φVc"
                    value={`${checks.phi_vn_oneway_kn.toFixed(1)} kN`}
                    ok={checks.shear_oneway_status === 'pass'}
                  />
                  <Row
                    label="punching φVc"
                    value={`${checks.phi_vn_twoway_kn.toFixed(1)} kN`}
                    ok={checks.shear_twoway_status === 'pass'}
                  />
                </Section>
                <Section title="Flexure">
                  <Row
                    label="φMn ≥ Mu"
                    value={`${checks.phi_mn_knm.toFixed(1)} ≥ ${checks.mu_face_knm.toFixed(1)} kN·m`}
                    ok={checks.flexure_status === 'pass'}
                  />
                </Section>
                <Section title="Col bearing">
                  <Row
                    label="φBn ≥ Pu"
                    value={`${checks.phi_bn_kn.toFixed(1)} ≥ ${checks.pu_kn.toFixed(1)} kN`}
                    ok={checks.bearing_col_status === 'pass'}
                  />
                </Section>
              </>
            ) : (
              <p className="text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
                Run design to evaluate bearing, shear (1-way + punching), flexure at face, and column bearing.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
    </DesignErrorBoundary>
  )
}

function FootingPlan({
  Lx, Ly, col_b, col_h, depth, cover,
}: {
  Lx: number; Ly: number; col_b: number; col_h: number
  depth: number; cover: number
}) {
  const width = 420, height = 260
  const pad = 30
  const drawW = width - 2 * pad, drawH = height - 2 * pad
  const scale = Math.min(drawW / Lx, drawH / Ly)
  const w = Lx * scale, h = Ly * scale
  const x0 = (width - w) / 2, y0 = (height - h) / 2
  const cx = x0 + w / 2, cy = y0 + h / 2
  const cw = col_b * scale, ch = col_h * scale
  const dEff = (depth - cover - 8) * scale // effective depth guess
  const punchInset = dEff * 0.5

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
         role="img" aria-label="Footing plan">
      {/* Footing outline */}
      <rect x={x0} y={y0} width={w} height={h}
            fill="#E8E4DC" stroke="#4A4038" strokeWidth={2} />
      {/* Bottom bars (amber lines across, representing short direction) */}
      {Array.from({ length: 7 }).map((_, i) => {
        const y = y0 + (h / 6) * i
        return <line key={i} x1={x0 + 4} y1={y} x2={x0 + w - 4} y2={y}
                     stroke="#D4820F" strokeWidth={0.6} />
      })}
      {/* Column rectangle */}
      <rect x={cx - cw / 2} y={cy - ch / 2} width={cw} height={ch}
            fill="#9A9490" stroke="#4A4038" strokeWidth={1.5} />
      {/* d/2 punching perimeter */}
      <rect x={cx - cw / 2 - punchInset} y={cy - ch / 2 - punchInset}
            width={cw + 2 * punchInset} height={ch + 2 * punchInset}
            fill="none" stroke="#1755A0" strokeDasharray="4 3" strokeWidth={1} />
      {/* One-way shear critical section (dashed red line at d from column face) */}
      <line x1={cx - cw / 2 - dEff} y1={y0 + 2}
            x2={cx - cw / 2 - dEff} y2={y0 + h - 2}
            stroke="#A02020" strokeDasharray="4 3" strokeWidth={1} />
      <line x1={cx + cw / 2 + dEff} y1={y0 + 2}
            x2={cx + cw / 2 + dEff} y2={y0 + h - 2}
            stroke="#A02020" strokeDasharray="4 3" strokeWidth={1} />
      <g fontFamily="IBM Plex Mono" fontSize={9} fill="#6A6560">
        <text x={x0 + w / 2} y={y0 + h + 18} textAnchor="middle">
          Lx = {Lx.toFixed(0)} mm
        </text>
        <text x={x0 - 8} y={y0 + h / 2} textAnchor="end">
          Ly = {Ly.toFixed(0)} mm
        </text>
        <text x={cx} y={cy - ch / 2 - 4} textAnchor="middle" fill="#1755A0">
          punching d/2
        </text>
      </g>
    </svg>
  )
}

function StatusTag({ status }: { status: string }) {
  switch (status) {
    case 'pass': return <Tag variant="green">PASS</Tag>
    case 'fail': return <Tag variant="red">FAIL</Tag>
    case 'unverified': return <Tag variant="amber">UNVERIFIED</Tag>
    default: return <Tag variant="amber">PENDING</Tag>
  }
}

function Row({ label, value, ok }: {
  label: string; value: string; ok?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
      <span className="uppercase tracking-wider" style={{ color: 'var(--color-text2)' }}>{label}</span>
      <span className="mono" style={{
        color: ok === undefined ? 'var(--color-text)' : ok ? 'var(--color-green)' : 'var(--color-red)',
        fontWeight: ok === false ? 600 : 400,
      }}>
        {value} {ok === false ? '✗' : ok ? '✓' : ''}
      </span>
    </div>
  )
}

function Section({ title, children }: {
  title: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text2)' }}>{title}</div>
      {children}
    </div>
  )
}
