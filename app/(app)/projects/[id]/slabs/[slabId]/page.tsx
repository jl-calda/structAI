import { notFound } from 'next/navigation'

import { DesignErrorBoundary } from '@/components/ui/DesignErrorBoundary'
import { RunSlabButton } from '@/components/slabs/RunSlabButton'
import { Tag } from '@/components/ui/Tag'
import { getSlabDesign } from '@/lib/data/slabs'

export const dynamic = 'force-dynamic'

export default async function SlabDesignPage({
  params,
}: {
  params: Promise<{ id: string; slabId: string }>
}) {
  const { id: projectId, slabId } = await params
  const result = await getSlabDesign(slabId)
  if (!result) notFound()
  const { design, rebar, checks } = result

  return (
    <DesignErrorBoundary>
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-3">
        <h1 className="mono text-[20px] font-semibold">{design.label}</h1>
        <Tag variant="teal">{design.slab_type.replace('_', '-').toUpperCase()}</Tag>
        <Tag variant="teal">NO STAAD LINK</Tag>
        <StatusTag status={design.design_status} />
        <span className="mono text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
          {design.span_x_mm.toFixed(0)} × {design.span_y_mm.toFixed(0)} mm · t = {design.thickness_mm.toFixed(0)} mm
        </span>
        <div className="ml-auto">
          <RunSlabButton projectId={projectId} slabId={slabId} />
        </div>
      </header>

      <section className="grid grid-cols-[260px_minmax(0,1fr)_260px] gap-3">
        <div className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>Geometry</span>
          </div>
          <div className="cb flex flex-col gap-1.5 text-[12px]">
            <Row label="Type" value={design.slab_type.replace('_', '-')} />
            <Row label="Lx" value={`${design.span_x_mm.toFixed(0)} mm`} />
            <Row label="Ly" value={`${design.span_y_mm.toFixed(0)} mm`} />
            <Row label="t" value={`${design.thickness_mm.toFixed(0)} mm`} />
            <Row label="cover" value={`${design.clear_cover_mm.toFixed(0)} mm`} />
            <Row label="f'c · fy" value={`${design.fc_mpa} · ${design.fy_mpa} MPa`} />
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>Rebar plan</span>
          </div>
          <div className="cb flex items-center justify-center">
            <SlabPlan
              Lx={design.span_x_mm}
              Ly={design.span_y_mm}
              shortSpacing={rebar?.spacing_short_mm ?? 200}
              longSpacing={rebar?.spacing_long_mm ?? 200}
              shortDia={rebar?.bar_dia_short_mm ?? 12}
              longDia={rebar?.bar_dia_long_mm ?? 12}
            />
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>Loads</span>
          </div>
          <div className="cb flex flex-col gap-1.5 text-[12px]">
            <Row label="DL (self)" value={`${design.dl_self_kpa.toFixed(2)} kPa`} />
            <Row label="SDL" value={`${design.sdl_kpa.toFixed(2)} kPa`} />
            <Row label="LL" value={`${design.ll_kpa.toFixed(2)} kPa`} />
            {checks ? (
              <Row label="wu" value={`${((1.2 * (design.dl_self_kpa + design.sdl_kpa) + 1.6 * design.ll_kpa)).toFixed(2)} kPa`} />
            ) : null}
          </div>
        </div>
      </section>

      {checks ? (
        <section className="card">
          <div className="ch">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text2)' }}>Checks</span>
          </div>
          <div className="cb">
            <table className="t">
              <tbody>
                <CheckRow
                  label="Flexure short span"
                  value={`${checks.phi_mn_x_knm_per_m.toFixed(1)} ≥ ${checks.mu_x_knm_per_m.toFixed(1)} kN·m/m`}
                  pass={checks.flexure_x_status === 'pass'}
                />
                {design.slab_type !== 'one_way' ? (
                  <CheckRow
                    label="Flexure long span"
                    value={`${checks.phi_mn_y_knm_per_m.toFixed(1)} ≥ ${checks.mu_y_knm_per_m.toFixed(1)} kN·m/m`}
                    pass={checks.flexure_y_status === 'pass'}
                  />
                ) : null}
                <CheckRow
                  label="Shear"
                  value={`${checks.phi_vn_kn_per_m.toFixed(1)} ≥ ${checks.vu_kn_per_m.toFixed(1)} kN/m`}
                  pass={checks.shear_status === 'pass'}
                />
                <CheckRow
                  label="Deflection (l/d vs code min thickness)"
                  value={checks.deflection_ok ? 'ok' : 'too thin'}
                  pass={checks.deflection_ok}
                />
                <CheckRow label="Code" value={checks.code_standard.replace(/_/g, ' ')} pass />
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="rounded px-3 py-2 text-[11.5px]"
             style={{ background: 'var(--color-amber-l)', color: 'var(--color-amber)' }}>
          No design results yet. Click <span className="font-semibold">Run design</span> to check flexure and shear per metre strip.
        </div>
      )}
    </div>
    </DesignErrorBoundary>
  )
}

function SlabPlan({
  Lx, Ly, shortSpacing, longSpacing, shortDia, longDia,
}: {
  Lx: number; Ly: number; shortSpacing: number; longSpacing: number
  shortDia: number; longDia: number
}) {
  const width = 420, height = 260
  const pad = 24
  const drawW = width - 2 * pad, drawH = height - 2 * pad
  const scale = Math.min(drawW / Lx, drawH / Ly)
  const w = Lx * scale, h = Ly * scale
  const x0 = (width - w) / 2, y0 = (height - h) / 2

  // Short-direction bars (amber, horizontal since short = x in spec).
  const shortCount = shortSpacing > 0 ? Math.floor(Ly / shortSpacing) + 1 : 0
  const longCount = longSpacing > 0 ? Math.floor(Lx / longSpacing) + 1 : 0
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
         role="img" aria-label="Slab rebar plan">
      <rect x={x0} y={y0} width={w} height={h}
            fill="#E8E4DC" stroke="#4A4038" strokeWidth={2} />
      {/* Short-direction bars (running along x) */}
      {Array.from({ length: shortCount }).map((_, i) => {
        const y = y0 + (h / Math.max(1, shortCount - 1)) * i
        return (
          <line key={`sh-${i}`} x1={x0} y1={y} x2={x0 + w} y2={y}
                stroke="#D4820F" strokeWidth={0.7} />
        )
      })}
      {/* Long-direction bars (running along y) — semi-transparent blue */}
      {Array.from({ length: longCount }).map((_, i) => {
        const x = x0 + (w / Math.max(1, longCount - 1)) * i
        return (
          <line key={`lo-${i}`} x1={x} y1={y0} x2={x} y2={y0 + h}
                stroke="#1755A0" strokeWidth={0.6} strokeOpacity={0.55} />
        )
      })}
      <g fontFamily="IBM Plex Mono" fontSize={9} fill="#6A6560">
        <text x={x0 + w / 2} y={y0 - 8} textAnchor="middle">
          Ø{shortDia}@{shortSpacing} (bot, short)
        </text>
        <text x={x0 + w + 8} y={y0 + h / 2} textAnchor="start">
          Ø{longDia}@{longSpacing}
        </text>
        <text x={x0 + w / 2} y={y0 + h + 16} textAnchor="middle">
          Lx = {Lx.toFixed(0)} mm
        </text>
        <text x={x0 - 8} y={y0 + h / 2} textAnchor="end">
          Ly = {Ly.toFixed(0)} mm
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
      <span className="uppercase tracking-wider" style={{ color: 'var(--color-text2)' }}>
        {label}
      </span>
      <span className="mono">{value}</span>
    </div>
  )
}

function CheckRow({ label, value, pass }: {
  label: string; value: string; pass: boolean
}) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num mono" style={{ textAlign: 'right' }}>{value}</td>
      <td style={{ textAlign: 'right', color: pass ? 'var(--color-green)' : 'var(--color-red)', fontWeight: 600 }}>
        {pass ? '✓' : '✗'}
      </td>
    </tr>
  )
}
