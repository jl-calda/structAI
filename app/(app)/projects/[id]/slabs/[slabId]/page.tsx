/**
 * Slab Design page — modern monochrome layout per Claude Design bundle.
 * Slabs are standalone (no STAAD link).
 */
import { notFound } from 'next/navigation'

import { DesignErrorBoundary } from '@/components/ui/DesignErrorBoundary'
import { PrintButton } from '@/components/ui/PrintButton'
import { PrintHeader } from '@/components/ui/PrintHeader'
import { RunSlabButton } from '@/components/slabs/RunSlabButton'
import { getProject } from '@/lib/data/projects'
import { getSlabDesign } from '@/lib/data/slabs'

export const dynamic = 'force-dynamic'

export default async function SlabDesignPage({
  params,
}: {
  params: Promise<{ id: string; slabId: string }>
}) {
  const { id: projectId, slabId } = await params
  const [result, project] = await Promise.all([
    getSlabDesign(slabId),
    getProject(projectId),
  ])
  if (!result || !project) notFound()
  const { design, rebar, checks } = result

  const status: 'pass' | 'fail' | 'pending' =
    design.design_status === 'pass' || design.design_status === 'fail'
      ? design.design_status
      : 'pending'

  const wu = 1.2 * (design.dl_self_kpa + design.sdl_kpa) + 1.6 * design.ll_kpa

  return (
    <DesignErrorBoundary>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PrintHeader
          projectName={project.name}
          designLabel={design.label}
          designType="Slab Design"
          codeStandard={project.code_standard}
        />

        {/* Header */}
        <div className="row" style={{ padding: '2px 2px 4px', gap: 10, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>
            {design.label}
          </span>
          <span className="tag tt">{design.slab_type.replace('_', '-').toUpperCase()}</span>
          <span className="tag">STANDALONE</span>
          <span className={'tag ' + (status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'warn')}>
            {status.toUpperCase()}
          </span>
          <span style={{ color: 'var(--color-ink-3)', fontSize: 11.5 }}>
            {design.span_x_mm.toFixed(0)} × {design.span_y_mm.toFixed(0)} mm · t = {design.thickness_mm.toFixed(0)} mm
          </span>
          <div className="spacer" />
          <PrintButton />
          <RunSlabButton projectId={projectId} slabId={slabId} />
        </div>

        {/* STEP 1 — Geometry & loads */}
        <div className="card">
          <div className="card-h">
            <span className="num-badge">1</span>
            <span className="label">Geometry &amp; Loads</span>
            <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
              spans · thickness · DL · SDL · LL · wu
            </span>
          </div>
          <div className="card-b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <KvBlock title="Geometry">
              <Kv k="Type" v={design.slab_type.replace('_', '-')} />
              <Kv k="Lx" v={`${design.span_x_mm.toFixed(0)} mm`} />
              <Kv k="Ly" v={`${design.span_y_mm.toFixed(0)} mm`} />
              <Kv k="t" v={`${design.thickness_mm.toFixed(0)} mm`} />
              <Kv k="cover" v={`${design.clear_cover_mm.toFixed(0)} mm`} />
              <Kv k="f'c · fy" v={`${design.fc_mpa} · ${design.fy_mpa} MPa`} />
            </KvBlock>
            <KvBlock title="Loads (kPa)">
              <Kv k="DL (self)" v={design.dl_self_kpa.toFixed(2)} />
              <Kv k="SDL" v={design.sdl_kpa.toFixed(2)} />
              <Kv k="LL" v={design.ll_kpa.toFixed(2)} />
              <Kv k="wu = 1.2(D+SDL) + 1.6L" v={wu.toFixed(2)} accent />
            </KvBlock>
          </div>
        </div>

        {/* STEP 2 — Rebar plan */}
        <div className="card">
          <div className="card-h">
            <span className="num-badge">2</span>
            <span className="label">Reinforcement Plan</span>
            <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
              short-span amber · long-span blue
            </span>
          </div>
          <div className="card-b" style={{ display: 'flex', justifyContent: 'center' }}>
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

        {/* STEP 3 — Checks */}
        <div className="card">
          <div className="card-h">
            <span className="num-badge">3</span>
            <span className="label">Check Results</span>
            <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
              flexure both ways · shear · deflection
            </span>
          </div>
          <div className="card-b">
            {checks ? (
              <table className="t">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Demand vs capacity</th>
                    <th style={{ textAlign: 'right' }}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  <CheckRow
                    label="Flexure short span"
                    value={`${checks.phi_mn_x_knm_per_m.toFixed(1)} ≥ ${checks.mu_x_knm_per_m.toFixed(1)} kN·m/m`}
                    pass={checks.flexure_x_status === 'pass'}
                  />
                  {design.slab_type !== 'one_way' && (
                    <CheckRow
                      label="Flexure long span"
                      value={`${checks.phi_mn_y_knm_per_m.toFixed(1)} ≥ ${checks.mu_y_knm_per_m.toFixed(1)} kN·m/m`}
                      pass={checks.flexure_y_status === 'pass'}
                    />
                  )}
                  <CheckRow
                    label="Shear"
                    value={`${checks.phi_vn_kn_per_m.toFixed(1)} ≥ ${checks.vu_kn_per_m.toFixed(1)} kN/m`}
                    pass={checks.shear_status === 'pass'}
                  />
                  <CheckRow
                    label="Deflection (l/d vs code min)"
                    value={checks.deflection_ok ? 'ok' : 'too thin'}
                    pass={checks.deflection_ok}
                  />
                  <CheckRow label="Code" value={checks.code_standard.replace(/_/g, ' ')} pass />
                </tbody>
              </table>
            ) : (
              <p style={{ fontSize: 11.5, color: 'var(--color-ink-3)' }}>
                No design results yet. Run design to check flexure + shear per metre strip.
              </p>
            )}
          </div>
        </div>
      </div>
    </DesignErrorBoundary>
  )
}

function KvBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="sub-label" style={{ marginBottom: 4 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>
    </div>
  )
}

function Kv({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, padding: '2px 0' }}>
      <span style={{ color: 'var(--color-ink-3)' }}>{k}</span>
      <span className="mono" style={{ color: accent ? 'var(--color-sel)' : 'var(--color-ink)', fontWeight: accent ? 600 : 400 }}>{v}</span>
    </div>
  )
}

function CheckRow({ label, value, pass }: { label: string; value: string; pass: boolean }) {
  return (
    <tr className={pass ? '' : 'fail'}>
      <td>{label}</td>
      <td className="num">{value}</td>
      <td style={{ textAlign: 'right', color: pass ? 'var(--color-pass)' : 'var(--color-fail)', fontWeight: 600 }}>
        {pass ? '✓ PASS' : '✗ FAIL'}
      </td>
    </tr>
  )
}

function SlabPlan({
  Lx, Ly, shortSpacing, longSpacing, shortDia, longDia,
}: {
  Lx: number
  Ly: number
  shortSpacing: number
  longSpacing: number
  shortDia: number
  longDia: number
}) {
  const width = 480
  const height = 280
  const pad = 30
  const drawW = width - 2 * pad
  const drawH = height - 2 * pad
  const scale = Math.min(drawW / Lx, drawH / Ly)
  const w = Lx * scale
  const h = Ly * scale
  const x0 = (width - w) / 2
  const y0 = (height - h) / 2

  const shortCount = shortSpacing > 0 ? Math.floor(Ly / shortSpacing) + 1 : 0
  const longCount = longSpacing > 0 ? Math.floor(Lx / longSpacing) + 1 : 0

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x={x0} y={y0} width={w} height={h} fill="#ECEAE4" stroke="#4A4038" strokeWidth={2} />
      {Array.from({ length: shortCount }).map((_, i) => {
        const y = y0 + (h / Math.max(1, shortCount - 1)) * i
        return <line key={`sh-${i}`} x1={x0} y1={y} x2={x0 + w} y2={y} stroke="#D4820F" strokeWidth={0.7} />
      })}
      {Array.from({ length: longCount }).map((_, i) => {
        const x = x0 + (w / Math.max(1, longCount - 1)) * i
        return <line key={`lo-${i}`} x1={x} y1={y0} x2={x} y2={y0 + h} stroke="#1755A0" strokeWidth={0.6} strokeOpacity={0.55} />
      })}
      <g fontFamily="JetBrains Mono" fontSize={9} fill="#6B7079">
        <text x={x0 + w / 2} y={y0 - 8} textAnchor="middle">Ø{shortDia}@{shortSpacing} (short)</text>
        <text x={x0 + w + 8} y={y0 + h / 2} dominantBaseline="middle">Ø{longDia}@{longSpacing}</text>
        <text x={x0 + w / 2} y={y0 + h + 16} textAnchor="middle">Lx = {Lx.toFixed(0)} mm</text>
        <text x={x0 - 8} y={y0 + h / 2} textAnchor="end" dominantBaseline="middle">Ly = {Ly.toFixed(0)} mm</text>
      </g>
    </svg>
  )
}
