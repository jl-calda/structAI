/**
 * Slab Design page — rich 7-step interactive layout per Claude Design bundle.
 *
 * Steps:
 *   1. Member Properties (via SlabDesignClient)
 *   1b. Edge Conditions & Panel Type
 *   2. Reinforcement Design (plan + rebar controls + capacity)
 *   3. Design Forces (coefficient method + moment field)
 *   4. Plan & Section (full bay + cuts)
 *   4b. Development & Splicing
 *   5. Calculation Breakdown (6 tabs)
 *   6. Material Take-Off
 */
import { notFound } from 'next/navigation'

import { SlabDesignClient } from '@/components/slabs/SlabDesignClient'
import { RunSlabButton } from '@/components/slabs/RunSlabButton'
import { DesignErrorBoundary } from '@/components/ui/DesignErrorBoundary'
import { PrintButton } from '@/components/ui/PrintButton'
import { PrintHeader } from '@/components/ui/PrintHeader'
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
  const { design, checks } = result

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
          <span className="tag">{design.slab_type.replace('_', '-').toUpperCase()}</span>
          <span className={'tag ' + (status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'warn')}>
            {status.toUpperCase()}
          </span>
          <span style={{ color: 'var(--color-ink-3)', fontSize: 11.5 }}>
            {design.span_x_mm.toFixed(0)} × {design.span_y_mm.toFixed(0)} mm · t = {design.thickness_mm.toFixed(0)} mm
          </span>
          <div className="spacer" />
          {checks && (
            <div className={'result-bar ' + (checks.overall_status === 'pass' ? 'pass' : 'fail')} style={{ margin: 0, padding: '4px 10px' }}>
              <span className="label">wu</span>
              <span>{wu.toFixed(1)}</span>
              <span style={{ color: 'var(--color-ink-3)' }}>kPa</span>
              <span>{checks.overall_status === 'pass' ? '✓' : '✗'}</span>
            </div>
          )}
          <PrintButton />
          <RunSlabButton projectId={projectId} slabId={slabId} />
        </div>

        {/* All interactive steps */}
        <SlabDesignClient
          initial={{
            label: design.label,
            spanX: design.span_x_mm,
            spanY: design.span_y_mm,
            thickness: design.thickness_mm,
            cover: design.clear_cover_mm,
            fc: design.fc_mpa,
            fy: design.fy_mpa,
            dlSelf: design.dl_self_kpa,
            sdl: design.sdl_kpa,
            ll: design.ll_kpa,
            slabType: design.slab_type as 'one_way' | 'two_way' | 'flat_plate' | 'flat_slab',
          }}
          code_standard={project.code_standard}
          checks={checks ?? null}
        />
      </div>
    </DesignErrorBoundary>
  )
}
