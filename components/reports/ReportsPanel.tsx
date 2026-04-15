'use client'

import { useState, useTransition } from 'react'

import { generateReportAction } from '@/app/actions/reports'
import type { ReportScope } from '@/lib/reports/document'

type ReportListItem = {
  id: string
  title: string
  generated_at: string
  staad_file_name: string | null
  staad_file_hash: string | null
  is_in_sync: boolean
  storage_url: string | null
  scope: ReportScope
}

type SyncStatus = 'green' | 'amber' | 'red'

export function ReportsPanel({
  projectId,
  initialReports,
  syncStatus,
  defaultEngineer,
}: {
  projectId: string
  initialReports: ReportListItem[]
  syncStatus: SyncStatus
  defaultEngineer: string
}) {
  const [scope, setScope] = useState<ReportScope>('full')
  const [title, setTitle] = useState('')
  const [engineer, setEngineer] = useState(defaultEngineer)
  const [pending, startTransition] = useTransition()
  const [reports, setReports] = useState<ReportListItem[]>(initialReports)
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const onGenerate = () => {
    setMessage(null)
    startTransition(async () => {
      const result = await generateReportAction({
        projectId,
        scope,
        title: title.trim() || undefined,
        engineerOfRecord: engineer.trim() || undefined,
      })
      if (!result.ok) {
        setMessage({ tone: 'err', text: result.error })
        return
      }
      setMessage({
        tone: 'ok',
        text: result.in_sync
          ? `Report generated. ${result.url ? 'Download below.' : ''}`
          : `Report generated, but flagged out-of-sync with STAAD.`,
      })
      // Optimistic insert at the top of history.
      setReports((prev) => [
        {
          id: result.id,
          title: title.trim() || 'Design Report',
          generated_at: new Date().toISOString(),
          staad_file_name: null,
          staad_file_hash: null,
          is_in_sync: result.in_sync,
          storage_url: result.url,
          scope,
        },
        ...prev,
      ])
    })
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(320px,420px)] gap-3">
      {/* ── Generator ────────────────────────────────────────────── */}
      <section className="card">
        <div className="ch">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text2)' }}>
            Generate report
          </span>
        </div>
        <div className="cb flex flex-col gap-3">
          <div>
            <div className="text-[10.5px] uppercase tracking-wider mb-1"
                 style={{ color: 'var(--color-text2)' }}>
              Scope
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['full','beams','columns','slabs','footings','mto'] as ReportScope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className="rounded px-2.5 py-1 text-[11.5px] font-medium uppercase tracking-wider"
                  style={{
                    background: scope === s ? 'var(--color-amber-l)' : 'var(--color-surface)',
                    color: scope === s ? 'var(--color-amber)' : 'var(--color-text2)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <SyncStatusLine status={syncStatus} />

          <Field label="Title">
            <input
              type="text"
              value={title}
              placeholder="e.g. Final Design Submission"
              onChange={(e) => setTitle(e.target.value)}
              className="border rounded px-2 py-1 text-[12px] w-full"
              style={{ borderColor: 'var(--color-border)' }}
            />
          </Field>
          <Field label="Engineer of Record">
            <input
              type="text"
              value={engineer}
              onChange={(e) => setEngineer(e.target.value)}
              className="border rounded px-2 py-1 text-[12px] w-full"
              style={{ borderColor: 'var(--color-border)' }}
            />
          </Field>

          <button
            type="button"
            onClick={onGenerate}
            disabled={pending}
            className="rounded px-3 py-2 text-[12.5px] font-semibold disabled:opacity-60"
            style={{ background: 'var(--color-amber)', color: '#fff' }}
          >
            {pending ? 'Generating PDF…' : 'Generate PDF'}
          </button>
          {message ? (
            <p className="text-[11.5px]"
               style={{ color: message.tone === 'ok' ? 'var(--color-green)' : 'var(--color-red)' }}>
              {message.text}
            </p>
          ) : null}
        </div>
      </section>

      {/* ── History ──────────────────────────────────────────────── */}
      <section className="card">
        <div className="ch">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text2)' }}>
            Report history
          </span>
          <span className="ml-auto mono text-[11px]"
                style={{ color: 'var(--color-text2)' }}>
            {reports.length} report{reports.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="cb flex flex-col gap-2">
          {reports.length === 0 ? (
            <p className="text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
              No reports yet.
            </p>
          ) : reports.map((r) => (
            <ReportRow key={r.id} report={r} />
          ))}
        </div>
      </section>
    </div>
  )
}

function SyncStatusLine({ status }: { status: SyncStatus }) {
  const tone =
    status === 'green' ? { bg: 'var(--color-green-l)', fg: 'var(--color-green)', text: '● in sync with STAAD' } :
    status === 'red'   ? { bg: 'var(--color-red-l)',   fg: 'var(--color-red)',   text: '⚠ STAAD mismatch — report will be flagged out-of-sync' } :
                          { bg: 'var(--color-amber-l)', fg: 'var(--color-amber)', text: '○ STAAD offline — report will use cached data' }
  return (
    <div className="rounded px-2 py-1.5 text-[11px]"
         style={{ background: tone.bg, color: tone.fg }}>
      {tone.text}
    </div>
  )
}

function ReportRow({ report }: { report: ReportListItem }) {
  const dim = !report.is_in_sync
  return (
    <div
      className="card"
      style={{ opacity: dim ? 0.85 : 1 }}
    >
      <div className="cb flex items-center gap-3">
        <div
          className="w-7 h-9 rounded shrink-0"
          style={{
            background: report.is_in_sync ? 'var(--color-amber-l)' : 'var(--color-surf3)',
            border: '0.5px solid var(--color-border)',
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold truncate">{report.title}</div>
          <div className="mono text-[10.5px] truncate"
               style={{ color: 'var(--color-text2)' }}>
            {report.generated_at.slice(0, 19).replace('T', ' ')}
            {report.staad_file_hash ? ` · hash ${report.staad_file_hash.slice(0, 8).toUpperCase()}` : ''}
            {' · '}{report.scope}
          </div>
        </div>
        <span
          className="tag"
          style={{
            background: report.is_in_sync ? 'var(--color-green-l)' : 'var(--color-amber-l)',
            color:      report.is_in_sync ? 'var(--color-green)'   : 'var(--color-amber)',
          }}
        >
          {report.is_in_sync ? 'IN SYNC' : 'OUT OF SYNC'}
        </span>
        {report.storage_url ? (
          <a
            href={report.storage_url}
            target="_blank"
            rel="noreferrer"
            className="rounded px-2 py-1 text-[11.5px] font-semibold"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          >
            Download
          </a>
        ) : null}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text2)' }}>
      {label}
      <div className="normal-case">{children}</div>
    </label>
  )
}
