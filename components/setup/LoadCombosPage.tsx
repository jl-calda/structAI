'use client'

import { useState, useTransition } from 'react'

import {
  generateCombinationsAction,
  recomputeEnvelopeAction,
} from '@/app/actions/loads'
import { Icon } from '@/components/ui/Icon'
import type { CodeStandard } from '@/lib/supabase/types'

type EnvelopeAxis = { value: number; member: number | null; combo: number | null }
type Envelope = { mpos: EnvelopeAxis; mneg: EnvelopeAxis; vu: EnvelopeAxis }
type TemplateOption = { id: string; name: string; combinations: number }

const STANDARD_COMBOS = [
  { label: '1.4D', factors: '1.4(Dsw + SDL)', code: '§9.2.1(a)' },
  { label: '1.2D + 1.6L + 0.5Lr', factors: '1.2(Dsw + SDL) + 1.6L + 0.5Lr', code: '§9.2.1(b)' },
  { label: '1.2D + 1.6Lr + (1.0L or 0.5W)', factors: '1.2(Dsw + SDL) + 1.6Lr + f₁L + f₂W', code: '§9.2.1(c)' },
  { label: '1.2D + 1.0W + 1.0L + 0.5Lr', factors: '1.2(Dsw + SDL) + 1.0W + 1.0L + 0.5Lr', code: '§9.2.1(d)' },
  { label: '1.2D + 1.0E + 1.0L', factors: '1.2(Dsw + SDL) + 1.0E + 1.0L', code: '§9.2.1(e)' },
  { label: '0.9D + 1.0W', factors: '0.9(Dsw + SDL) + 1.0W', code: '§9.2.1(f)' },
  { label: '0.9D + 1.0E', factors: '0.9(Dsw + SDL) + 1.0E', code: '§9.2.1(g)' },
]

export function LoadCombosPage({
  projectId,
  codeStandard,
  templates,
  loadCaseCount,
  comboCount,
  envelopeSummary,
}: {
  projectId: string
  codeStandard: CodeStandard
  templates: TemplateOption[]
  loadCaseCount: number
  comboCount: number
  envelopeSummary: Envelope
}) {
  const codeRef = codeStandard.replace(/_/g, ' ')
  const [generating, startGen] = useTransition()
  const [recomputing, startRecomp] = useTransition()
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]?.id ?? '')
  const [toast, setToast] = useState<string | null>(null)
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row" style={{ gap: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Load Combinations</span>
        <span className="mono" style={{ color: 'var(--color-ink-3)', fontSize: 11.5 }}>
          {codeRef} LRFD strength combinations · basic loads combined per code
        </span>
      </div>

      {/* Card 1 — Standard combinations */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">1</span>
          <span className="label">Standard LRFD Combinations · {codeRef}</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            Dsw = self-weight · SDL = superimposed dead · L = live · Lr = roof live · W = wind · E = seismic
          </span>
        </div>
        <div className="card-b" style={{ padding: 0 }}>
          <table className="t" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th style={{ width: 220 }}>Combination</th>
                <th>Factored expression</th>
                <th style={{ width: 100 }}>Code ref</th>
              </tr>
            </thead>
            <tbody>
              {STANDARD_COMBOS.map((c, i) => (
                <tr key={i}>
                  <td className="num">{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{c.label}</td>
                  <td className="mono" style={{ color: 'var(--color-ink-2)' }}>{c.factors}</td>
                  <td className="mono" style={{ color: 'var(--color-ink-3)' }}>{c.code}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '6px 12px', borderTop: '1px solid var(--color-line-2)', background: 'var(--color-bg)', fontSize: 10, color: 'var(--color-ink-4)' }} className="mono">
            D = Dsw + SDL (combined as a single dead load case) · factors per {codeRef} §9.2.1 / ASCE 7-16 §2.3.1
          </div>
        </div>
      </div>

      {/* Card 2 — Generate */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">2</span>
          <span className="label">Generate from Template</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            {loadCaseCount} load cases · {comboCount} combinations generated
          </span>
        </div>
        <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select className="select" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} style={{ width: 280, height: 24 }}>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.combinations} combos)</option>)}
            </select>
            <button type="button" className="btn sm primary" disabled={generating || !selectedTemplate}
              onClick={() => startGen(async () => {
                const r = await generateCombinationsAction({ projectId, templateId: selectedTemplate })
                flash(r.ok ? `${r.written} combinations generated.` : r.error)
              })}>
              <Icon name="play" size={12} /> {generating ? 'Generating…' : 'Generate'}
            </button>
            <button type="button" className="btn sm" disabled={recomputing || comboCount === 0}
              onClick={() => startRecomp(async () => {
                const r = await recomputeEnvelopeAction(projectId)
                flash(r.ok ? 'Envelope recomputed.' : r.error)
              })}>
              Recompute envelope
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>
            Templates map basic load cases (Dsw, SDL, L, Lr, W, E) from the Basic Loads page to the standard {codeRef} LRFD combinations above.
          </div>
        </div>
      </div>

      {/* Card 3 — Envelope */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">3</span>
          <span className="label">Envelope Summary</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">governing forces across all members &amp; combinations</span>
        </div>
        <div className="card-b">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <EnvCell label="Design M⁺" value={envelopeSummary.mpos.value.toFixed(1)} unit="kN·m" member={envelopeSummary.mpos.member} combo={envelopeSummary.mpos.combo} />
            <EnvCell label="Design M⁻" value={envelopeSummary.mneg.value.toFixed(1)} unit="kN·m" member={envelopeSummary.mneg.member} combo={envelopeSummary.mneg.combo} />
            <EnvCell label="Design Vu" value={envelopeSummary.vu.value.toFixed(1)} unit="kN" member={envelopeSummary.vu.member} combo={envelopeSummary.vu.combo} />
          </div>
        </div>
      </div>

      {toast && (
        <div className="sync" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 60, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', maxWidth: 360 }}>
          <span className="led" /><span style={{ fontSize: 11.5 }}>{toast}</span>
        </div>
      )}
    </div>
  )
}

function EnvCell({ label, value, unit, member, combo }: {
  label: string; value: string; unit: string; member: number | null; combo: number | null
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="sub-label">{label}</span>
      <span className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{value} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-ink-3)' }}>{unit}</span></span>
      <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>member {member ?? '—'} · combo {combo ?? '—'}</span>
    </div>
  )
}
