'use client'

import { useMemo, useState, useTransition } from 'react'

import {
  generateCombinationsAction,
  recomputeEnvelopeAction,
} from '@/app/actions/loads'
import { Icon } from '@/components/ui/Icon'
import {
  buildNSCPAllowableCombos,
  buildNSCPUltimateCombos,
  generateAllCombinations,
  type ComboInput,
} from '@/lib/staad/syntax'
import type { CodeStandard } from '@/lib/supabase/types'

type EnvelopeAxis = { value: number; member: number | null; combo: number | null }
type Envelope = { mpos: EnvelopeAxis; mneg: EnvelopeAxis; vu: EnvelopeAxis }
type TemplateOption = { id: string; name: string; combinations: number }
type LoadCaseLite = { case_number: number; title: string; load_type: string }

const LOAD_CASE_COLS = ['Eqx', 'Eqz', 'DL', 'LL', 'LR', 'Wx_1', 'Wx_2', 'Wz_1', 'Wz_2']
const NSCP_EQ_REFS: Record<number, string> = {
  100: '203-1', 101: '203-2', 102: '203-3', 103: '203-3', 104: '203-3',
  105: '203-3', 106: '203-3', 107: '203-4', 108: '203-4', 109: '203-4',
  110: '203-4', 111: '203-5', 112: '203-5', 113: '203-5', 114: '203-5',
  115: '203-6', 116: '203-6', 117: '203-6', 118: '203-6',
  119: '203-7', 120: '203-7', 121: '203-7', 122: '203-7', 123: '203-7', 124: '203-7',
  200: '203-1', 201: '203-2', 202: '203-3', 203: '203-3',
  204: '203-3', 205: '203-3', 206: '203-3', 207: '203-4',
  208: '203-5', 209: '203-5', 210: '203-5', 211: '203-5',
}

export function LoadCombosPage({
  projectId,
  codeStandard,
  templates,
  loadCases,
  loadCaseCount,
  comboCount,
  envelopeSummary,
}: {
  projectId: string
  codeStandard: CodeStandard
  templates: TemplateOption[]
  loadCases: LoadCaseLite[]
  loadCaseCount: number
  comboCount: number
  envelopeSummary: Envelope
}) {
  const codeRef = codeStandard.replace(/_/g, ' ')
  const [generating, startGen] = useTransition()
  const [recomputing, startRecomp] = useTransition()
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]?.id ?? '')
  const [toast, setToast] = useState<string | null>(null)
  const [showCode, setShowCode] = useState(false)
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  // Build case map: load_type → case_number
  const caseMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of loadCases) {
      if (!m[c.load_type]) m[c.load_type] = c.case_number
    }
    return m
  }, [loadCases])

  // Build ordered case numbers matching LOAD_CASE_COLS
  const colCaseNumbers = useMemo(() => {
    const types = ['seismic_x', 'seismic_z', 'dead', 'live', 'roof_live', 'wind_x', 'wind_x', 'wind_z', 'wind_z']
    return types.map(t => caseMap[t] ?? 0)
  }, [caseMap])

  const ultimateCombos = useMemo(() => buildNSCPUltimateCombos(caseMap), [caseMap])
  const allowableCombos = useMemo(() => buildNSCPAllowableCombos(caseMap), [caseMap])
  const allCombos = useMemo(() => [...ultimateCombos, ...allowableCombos], [ultimateCombos, allowableCombos])
  const staadCode = useMemo(() => generateAllCombinations(allCombos), [allCombos])

  const factorForCol = (combo: ComboInput, colIdx: number): number => {
    const caseNum = colCaseNumbers[colIdx]
    if (!caseNum) return 0
    const ff = combo.factors.find(f => f.caseNumber === caseNum)
    return ff?.factor ?? 0
  }

  const copy = () => { navigator.clipboard.writeText(staadCode).catch(() => {}) }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Load Combinations</span>
        <span className="mono" style={{ color: 'var(--color-ink-3)', fontSize: 11.5 }}>
          {ultimateCombos.length} ultimate + {allowableCombos.length} allowable
        </span>
        <div className="spacer" />
        <button type="button" className="btn sm" onClick={() => setShowCode(!showCode)}>
          <Icon name="code" size={12} /> {showCode ? 'Hide' : 'Show'} STAAD Code
        </button>
        <button type="button" className="btn sm primary" onClick={copy}>
          <Icon name="download" size={12} /> Copy All
        </button>
      </div>

      {/* Case number reference */}
      {loadCases.length > 0 && (
        <div className="sync" style={{ gap: 12 }}>
          <span className="led" />
          <span style={{ fontWeight: 500 }}>Primary cases from STAAD:</span>
          {loadCases.map(c => (
            <span key={c.case_number} className="mono" style={{ color: 'var(--color-ink-2)' }}>
              {c.case_number}={c.title}
            </span>
          ))}
        </div>
      )}

      {/* STAAD Code panel */}
      {showCode && (
        <div className="card">
          <div className="card-h">
            <span className="label">STAAD REPEAT LOAD Syntax</span>
            <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
              {allCombos.length} combinations · copy and paste into .std file
            </span>
          </div>
          <div style={{ position: 'relative' }}>
            <pre
              style={{
                margin: 0, padding: '10px 12px',
                fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.4,
                color: 'var(--color-ink)', background: 'var(--color-panel)',
                whiteSpace: 'pre', overflow: 'auto', maxHeight: 400,
              }}
            >
              {'*****ULTIMATE LOAD COMBINATION*****\n'}
              {generateAllCombinations(ultimateCombos)}
              {'\n\n**ALLOWABLE LOAD COMBINATION**\n'}
              {generateAllCombinations(allowableCombos)}
            </pre>
          </div>
        </div>
      )}

      {/* Ultimate factor matrix */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">1</span>
          <span className="label">Ultimate Load Combinations (LRFD)</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            §203 · {ultimateCombos.length} combinations
          </span>
        </div>
        <div className="card-b" style={{ padding: 0, overflowX: 'auto' }}>
          <ComboMatrix combos={ultimateCombos} cols={LOAD_CASE_COLS} colCaseNumbers={colCaseNumbers} factorForCol={factorForCol} />
        </div>
      </div>

      {/* Allowable factor matrix */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">2</span>
          <span className="label">Allowable Load Combinations (ASD)</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            §203 · for soil bearing, deflection checks · {allowableCombos.length} combinations
          </span>
        </div>
        <div className="card-b" style={{ padding: 0, overflowX: 'auto' }}>
          <ComboMatrix combos={allowableCombos} cols={LOAD_CASE_COLS} colCaseNumbers={colCaseNumbers} factorForCol={factorForCol} />
        </div>
      </div>

      {/* Generate from template */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">3</span>
          <span className="label">Generate &amp; Push to STAAD</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            {loadCaseCount} load cases · {comboCount} in database
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
                flash(r.ok ? `${r.written} combinations generated & pushed.` : r.error)
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
        </div>
      </div>

      {/* Envelope */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">4</span>
          <span className="label">Envelope Summary</span>
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

function ComboMatrix({
  combos,
  cols,
  colCaseNumbers,
  factorForCol,
}: {
  combos: ComboInput[]
  cols: string[]
  colCaseNumbers: number[]
  factorForCol: (combo: ComboInput, colIdx: number) => number
}) {
  return (
    <table className="t" style={{ fontSize: 10.5, minWidth: 700 }}>
      <thead>
        <tr>
          <th style={{ width: 60 }}>NSCP eq</th>
          <th style={{ width: 50 }}>LC no.</th>
          <th style={{ width: 220 }}>Title</th>
          {cols.map((c, i) => (
            <th key={i} className="num" style={{ textAlign: 'center', width: 50 }}>
              {c}
              {colCaseNumbers[i] > 0 && (
                <div className="mono" style={{ fontSize: 8, fontWeight: 400, color: 'var(--color-ink-4)' }}>
                  ({colCaseNumbers[i]})
                </div>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {combos.map(c => (
          <tr key={c.comboNumber}>
            <td className="mono" style={{ color: 'var(--color-ink-3)' }}>{NSCP_EQ_REFS[c.comboNumber] ?? '—'}</td>
            <td className="num" style={{ fontWeight: 600 }}>{c.comboNumber}</td>
            <td style={{ fontWeight: 500, fontSize: 10 }}>{c.title}</td>
            {cols.map((_, i) => {
              const f = factorForCol(c, i)
              return (
                <td
                  key={i}
                  className="num"
                  style={{
                    textAlign: 'center',
                    background: f !== 0 ? (f < 0 ? 'var(--color-fail-bg)' : 'var(--color-sel-bg)') : undefined,
                    color: f !== 0 ? (f < 0 ? 'var(--color-fail)' : 'var(--color-ink)') : 'var(--color-ink-5)',
                    fontWeight: f !== 0 ? 600 : 400,
                  }}
                >
                  {f !== 0 ? f.toFixed(f === Math.round(f) ? 0 : 2) : ''}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
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
