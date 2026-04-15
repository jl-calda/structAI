'use client'

import { useState, useTransition } from 'react'

import {
  generateCombinationsAction,
  recomputeEnvelopeAction,
  requestResyncAction,
} from '@/app/actions/loads'
import { shortHash } from '@/lib/format'
import type { CodeStandard } from '@/lib/supabase/types'

type EnvelopeAxis = { value: number; member: number | null; combo: number | null }
type Envelope = { mpos: EnvelopeAxis; mneg: EnvelopeAxis; vu: EnvelopeAxis }

type LatestSync = {
  fileName: string
  hash: string
  syncedAt: string
  nodes: number
  members: number
  status: string
  mismatch: boolean
} | null

type TemplateOption = {
  id: string
  name: string
  combinations: number
}

export function SetupTabs({
  projectId,
  codeStandard,
  latestSync,
  templates,
  loadCaseCount,
  comboCount,
  envelopeSummary,
}: {
  projectId: string
  codeStandard: CodeStandard
  latestSync: LatestSync
  templates: TemplateOption[]
  loadCaseCount: number
  comboCount: number
  envelopeSummary: Envelope
}) {
  const [tab, setTab] = useState<'import' | 'combos'>('import')

  return (
    <div className="flex flex-col gap-4">
      <nav
        className="flex items-center gap-1 text-[12px]"
        role="tablist"
        aria-label="Setup tabs"
      >
        <TabButton active={tab === 'import'} onClick={() => setTab('import')}>
          STAAD Import
        </TabButton>
        <TabButton active={tab === 'combos'} onClick={() => setTab('combos')}>
          Load Combinations
        </TabButton>
      </nav>

      {tab === 'import' ? (
        <ImportTab projectId={projectId} latestSync={latestSync} />
      ) : (
        <CombosTab
          projectId={projectId}
          codeStandard={codeStandard}
          templates={templates}
          loadCaseCount={loadCaseCount}
          comboCount={comboCount}
          envelope={envelopeSummary}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className="rounded-t px-3 py-1.5 font-medium transition-colors"
      style={{
        background: active ? 'var(--color-surface)' : 'transparent',
        color: active ? 'var(--color-text)' : 'var(--color-text2)',
        borderBottom: active
          ? '2px solid var(--color-amber)'
          : '2px solid transparent',
      }}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Tab 1 — STAAD Import
// ---------------------------------------------------------------------------

function ImportTab({
  projectId,
  latestSync,
}: {
  projectId: string
  latestSync: LatestSync
}) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{
    tone: 'ok' | 'warn' | 'err'
    text: string
  } | null>(null)

  const onResync = () => {
    setMessage(null)
    startTransition(async () => {
      const result = await requestResyncAction(projectId)
      if (result.ok) {
        setMessage({ tone: 'ok', text: 'Bridge re-sync requested.' })
      } else if (result.offline) {
        setMessage({
          tone: 'warn',
          text: 'Bridge offline — Windows bridge process is not reachable. Cached STAAD data still available.',
        })
      } else {
        setMessage({ tone: 'err', text: result.error })
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card">
        <div className="ch">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text2)' }}>
            STAAD Input File
          </span>
        </div>
        <div className="cb">
          <div
            className="rounded border px-3 py-4 text-[13px]"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-surf2)',
            }}
          >
            {latestSync ? (
              <div className="flex items-baseline gap-3">
                <span className="mono font-semibold">{latestSync.fileName}</span>
                <span
                  className="mono text-[11px]"
                  style={{ color: 'var(--color-text2)' }}
                >
                  last synced {latestSync.syncedAt.slice(0, 19).replace('T', ' ')}
                </span>
              </div>
            ) : (
              <span style={{ color: 'var(--color-text2)' }}>
                No sync on record. Start the Python bridge to populate this project.
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3">
        <InfoCell label="Hash" value={latestSync ? shortHash(latestSync.hash) : '—'} />
        <InfoCell label="Status" value={latestSync?.status ?? '—'} />
        <InfoCell label="Members" value={latestSync ? String(latestSync.members) : '—'} />
        <InfoCell label="Sections" value={'—'} sub="updated after sync" />
        <InfoCell label="Nodes" value={latestSync ? String(latestSync.nodes) : '—'} />
        <InfoCell
          label="Mismatch"
          value={latestSync?.mismatch ? 'YES' : latestSync ? 'no' : '—'}
          tone={latestSync?.mismatch ? 'err' : undefined}
        />
      </div>

      <button
        type="button"
        onClick={onResync}
        disabled={pending}
        className="rounded px-3 py-2 text-[12.5px] font-semibold disabled:opacity-60"
        style={{ background: 'var(--color-green)', color: '#fff' }}
      >
        {pending ? 'Requesting re-sync…' : 'Request re-sync from bridge'}
      </button>

      {message ? (
        <MessageBanner tone={message.tone}>{message.text}</MessageBanner>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 2 — Load Combinations
// ---------------------------------------------------------------------------

function CombosTab({
  projectId,
  codeStandard,
  templates,
  loadCaseCount,
  comboCount,
  envelope,
}: {
  projectId: string
  codeStandard: CodeStandard
  templates: TemplateOption[]
  loadCaseCount: number
  comboCount: number
  envelope: Envelope
}) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{
    tone: 'ok' | 'warn' | 'err'
    text: string
  } | null>(null)
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')

  const onGenerate = () => {
    if (!templateId) return
    setMessage(null)
    startTransition(async () => {
      const result = await generateCombinationsAction({
        projectId,
        templateId,
      })
      if (!result.ok) {
        setMessage({ tone: 'err', text: result.error })
        return
      }
      const bridgeNote =
        result.bridge === 'pushed'
          ? 'Combinations pushed to STAAD.'
          : result.bridge === 'offline'
            ? 'Combinations saved — bridge offline, push later.'
            : 'Combinations saved — bridge push failed.'
      const warnNote =
        result.warnings.length > 0
          ? ` ${result.warnings.length} skipped (missing load cases).`
          : ''
      setMessage({
        tone: result.bridge === 'pushed' ? 'ok' : 'warn',
        text: `${result.written} combinations written. ${bridgeNote}${warnNote}`,
      })
    })
  }

  const onRecompute = () => {
    setMessage(null)
    startTransition(async () => {
      const result = await recomputeEnvelopeAction(projectId)
      if (result.ok) {
        setMessage({
          tone: 'ok',
          text: `Envelope recomputed across ${result.members} member${result.members === 1 ? '' : 's'}.`,
        })
      } else {
        setMessage({ tone: 'err', text: result.error })
      }
    })
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(280px,420px)] gap-3">
      {/* Left column — generator */}
      <div className="card">
        <div className="ch">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text2)' }}>
            Generate from template
          </span>
        </div>
        <div className="cb flex flex-col gap-3 text-[12.5px]">
          <Field label="Code standard">
            <input
              value={codeStandard.replace(/_/g, ' ')}
              readOnly
              className="mono border rounded px-2 py-1 text-[12px]"
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-surf3)',
              }}
            />
          </Field>
          <Field label="Template">
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="border rounded px-2 py-1 text-[12px]"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {templates.length === 0 ? (
                <option value="">No templates for this code</option>
              ) : (
                templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.combinations} combos
                  </option>
                ))
              )}
            </select>
          </Field>

          <div
            className="rounded border px-2 py-2 text-[11.5px]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text2)' }}
          >
            STAAD sync has{' '}
            <span className="mono">{loadCaseCount}</span> load case{loadCaseCount === 1 ? '' : 's'} and{' '}
            <span className="mono">{comboCount}</span> stored combination{comboCount === 1 ? '' : 's'}.
            Generation skips any template combo whose load_type is not in the STAAD model.
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onGenerate}
              disabled={pending || !templateId || loadCaseCount === 0}
              className="rounded px-3 py-2 text-[12.5px] font-semibold disabled:opacity-60"
              style={{ background: 'var(--color-amber)', color: '#fff' }}
            >
              {pending ? 'Working…' : 'Generate combinations'}
            </button>
            <button
              type="button"
              onClick={onRecompute}
              disabled={pending}
              className="rounded px-3 py-2 text-[12.5px] font-semibold disabled:opacity-60"
              style={{
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              Recompute envelope
            </button>
          </div>

          {message ? (
            <MessageBanner tone={message.tone}>{message.text}</MessageBanner>
          ) : null}
        </div>
      </div>

      {/* Right column — envelope summary */}
      <div className="card">
        <div className="ch">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text2)' }}>
            Envelope Summary
          </span>
        </div>
        <div className="cb flex flex-col gap-2">
          <EnvelopeBox
            label="Design M+"
            unit="kN·m"
            axis={envelope.mpos}
            tone="amber"
          />
          <EnvelopeBox
            label="Design M−"
            unit="kN·m"
            axis={envelope.mneg}
            tone="blue"
          />
          <EnvelopeBox
            label="Design Vu"
            unit="kN"
            axis={envelope.vu}
            tone="red"
          />
        </div>
      </div>
    </div>
  )
}

function EnvelopeBox({
  label,
  unit,
  axis,
  tone,
}: {
  label: string
  unit: string
  axis: EnvelopeAxis
  tone: 'amber' | 'blue' | 'red'
}) {
  const borderColor =
    tone === 'amber' ? 'var(--color-amber)' :
    tone === 'blue' ? 'var(--color-blue)' :
    'var(--color-red)'
  return (
    <div
      className="rounded border px-3 py-2"
      style={{ borderLeft: `3px solid ${borderColor}`, borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10.5px] uppercase tracking-wider"
              style={{ color: 'var(--color-text2)' }}>
          {label}
        </span>
        <span className="mono text-[10.5px]"
              style={{ color: 'var(--color-text2)' }}>
          {axis.combo !== null ? `combo ${axis.combo}` : 'no envelope yet'}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="mono text-[20px] font-semibold">
          {axis.value ? axis.value.toFixed(1) : '—'}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--color-text2)' }}>
          {unit}
        </span>
        {axis.member !== null ? (
          <span className="mono ml-auto text-[10.5px]"
                style={{ color: 'var(--color-text2)' }}>
            member {axis.member}
          </span>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function InfoCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'err'
}) {
  return (
    <div className="card">
      <div className="cb">
        <div className="text-[9.5px] uppercase tracking-wider"
             style={{ color: 'var(--color-text2)' }}>
          {label}
        </div>
        <div
          className="mono text-[14px] font-semibold"
          style={{ color: tone === 'err' ? 'var(--color-red)' : 'var(--color-text)' }}
        >
          {value}
        </div>
        {sub ? (
          <div className="text-[10px]" style={{ color: 'var(--color-text2)' }}>
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text2)' }}>
      {label}
      <div className="normal-case">{children}</div>
    </label>
  )
}

function MessageBanner({
  tone,
  children,
}: {
  tone: 'ok' | 'warn' | 'err'
  children: React.ReactNode
}) {
  const style =
    tone === 'ok' ? { bg: 'var(--color-green-l)', fg: 'var(--color-green)' } :
    tone === 'warn' ? { bg: 'var(--color-amber-l)', fg: 'var(--color-amber)' } :
    { bg: 'var(--color-red-l)', fg: 'var(--color-red)' }
  return (
    <div
      className="rounded px-2 py-1.5 text-[11.5px]"
      style={{ background: style.bg, color: style.fg }}
    >
      {children}
    </div>
  )
}
