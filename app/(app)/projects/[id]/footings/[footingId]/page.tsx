/**
 * Footing Design page — modern monochrome layout per Claude Design bundle.
 */
import { notFound } from 'next/navigation'

import { DesignErrorBoundary } from '@/components/ui/DesignErrorBoundary'
import { Icon } from '@/components/ui/Icon'
import { PrintButton } from '@/components/ui/PrintButton'
import { PrintHeader } from '@/components/ui/PrintHeader'
import { RunFootingButton } from '@/components/footings/RunFootingButton'
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
          <span className="tag tg">{design.footing_type.toUpperCase()}</span>
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

        {/* STEP 1 — Geometry & soil */}
        <div className="card">
          <div className="card-h">
            <span className="num-badge">1</span>
            <span className="label">Geometry &amp; Soil</span>
            <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
              dimensions · soil bearing capacity · column dims
            </span>
          </div>
          <div className="card-b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <KvBlock title="Footing">
              <Kv k="Lx" v={`${design.length_x_mm.toFixed(0)} mm`} />
              <Kv k="Ly" v={`${design.width_y_mm.toFixed(0)} mm`} />
              <Kv k="depth" v={`${design.depth_mm.toFixed(0)} mm`} />
              <Kv k="cover" v={`${design.clear_cover_mm.toFixed(0)} mm`} />
              <Kv k="f'c · fy" v={`${design.fc_mpa} · ${design.fy_mpa} MPa`} />
            </KvBlock>
            <KvBlock title="Soil &amp; bearing">
              <Kv k="qa allow" v={`${design.bearing_capacity_kpa.toFixed(1)} kPa`} />
              <Kv k="depth" v={`${design.soil_depth_mm.toFixed(0)} mm`} />
            </KvBlock>
            <KvBlock title="Column">
              <Kv k="b × h" v={`${(col?.design?.b_mm ?? design.col_b_mm ?? 400).toFixed(0)} × ${(col?.design?.h_mm ?? design.col_h_mm ?? 400).toFixed(0)} mm`} />
              {checks && (
                <>
                  <Kv k="Pu" v={`${checks.pu_kn.toFixed(1)} kN`} accent />
                  <Kv k="Mu" v={`${checks.mu_knm.toFixed(1)} kN·m`} accent />
                  <Kv k="combo" v={checks.governing_combo?.toString() ?? '—'} />
                </>
              )}
            </KvBlock>
          </div>
        </div>

        {/* STEP 2 — Footing plan */}
        <div className="card">
          <div className="card-h">
            <span className="num-badge">2</span>
            <span className="label">Footing Plan</span>
            <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
              column · d/2 punching perimeter · one-way shear critical sections
            </span>
          </div>
          <div className="card-b" style={{ display: 'flex', justifyContent: 'center' }}>
            <FootingPlan
              Lx={design.length_x_mm}
              Ly={design.width_y_mm}
              col_b={col?.design?.b_mm ?? design.col_b_mm ?? 400}
              col_h={col?.design?.h_mm ?? design.col_h_mm ?? 400}
              depth={design.depth_mm}
              cover={design.clear_cover_mm}
            />
          </div>
        </div>

        {/* STEP 3 — Checks */}
        <div className="card">
          <div className="card-h">
            <span className="num-badge">3</span>
            <span className="label">Check Results</span>
            <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
              soil pressure · one-way shear · punching · flexure · column bearing
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
                  <CheckRow label="Soil pressure" value={`${checks.q_net_kpa.toFixed(1)} ≤ ${design.bearing_capacity_kpa.toFixed(1)} kPa`} pass={checks.bearing_status === 'pass'} />
                  <CheckRow label="One-way shear" value={`φVc = ${checks.phi_vn_oneway_kn.toFixed(1)} kN`} pass={checks.shear_oneway_status === 'pass'} />
                  <CheckRow label="Punching shear" value={`φVc = ${checks.phi_vn_twoway_kn.toFixed(1)} kN`} pass={checks.shear_twoway_status === 'pass'} />
                  <CheckRow label="Flexure" value={`${checks.phi_mn_knm.toFixed(1)} ≥ ${checks.mu_face_knm.toFixed(1)} kN·m`} pass={checks.flexure_status === 'pass'} />
                  <CheckRow label="Column bearing" value={`${checks.phi_bn_kn.toFixed(1)} ≥ ${checks.pu_kn.toFixed(1)} kN`} pass={checks.bearing_col_status === 'pass'} />
                </tbody>
              </table>
            ) : (
              <p style={{ fontSize: 11.5, color: 'var(--color-ink-3)' }}>
                No design results yet. Run design to evaluate bearing, shear, flexure, and column bearing.
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

function FootingPlan({
  Lx, Ly, col_b, col_h, depth, cover,
}: {
  Lx: number
  Ly: number
  col_b: number
  col_h: number
  depth: number
  cover: number
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
  const cx = x0 + w / 2
  const cy = y0 + h / 2
  const cw = col_b * scale
  const ch = col_h * scale
  const dEff = (depth - cover - 8) * scale
  const punchInset = dEff * 0.5

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x={x0} y={y0} width={w} height={h} fill="#ECEAE4" stroke="#4A4038" strokeWidth={2} />
      {Array.from({ length: 7 }).map((_, i) => {
        const y = y0 + (h / 6) * i
        return <line key={i} x1={x0 + 4} y1={y} x2={x0 + w - 4} y2={y} stroke="#D4820F" strokeWidth={0.6} />
      })}
      <rect x={cx - cw / 2} y={cy - ch / 2} width={cw} height={ch} fill="#9A9490" stroke="#4A4038" strokeWidth={1.5} />
      <rect
        x={cx - cw / 2 - punchInset} y={cy - ch / 2 - punchInset}
        width={cw + 2 * punchInset} height={ch + 2 * punchInset}
        fill="none" stroke="#1755A0" strokeDasharray="4 3" strokeWidth={1}
      />
      <line x1={cx - cw / 2 - dEff} y1={y0 + 2} x2={cx - cw / 2 - dEff} y2={y0 + h - 2} stroke="#A02020" strokeDasharray="4 3" strokeWidth={1} />
      <line x1={cx + cw / 2 + dEff} y1={y0 + 2} x2={cx + cw / 2 + dEff} y2={y0 + h - 2} stroke="#A02020" strokeDasharray="4 3" strokeWidth={1} />
      <g fontFamily="JetBrains Mono" fontSize={9} fill="#6B7079">
        <text x={x0 + w / 2} y={y0 + h + 18} textAnchor="middle">Lx = {Lx.toFixed(0)} mm</text>
        <text x={x0 - 8} y={y0 + h / 2} textAnchor="end" dominantBaseline="middle">Ly = {Ly.toFixed(0)} mm</text>
        <text x={cx} y={cy - ch / 2 - 4} textAnchor="middle" fill="#1755A0">punching d/2</text>
      </g>
    </svg>
  )
}
