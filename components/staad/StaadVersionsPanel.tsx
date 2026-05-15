'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { StaadVersionRow } from '@/lib/data/projects'

export function StaadVersionsPanel({
  projectId,
  rows,
  mismatchIncoming,
}: {
  projectId: string
  rows: StaadVersionRow[]
  mismatchIncoming: { file_name: string; file_hash: string } | null
}) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onConfirmSwitch() {
    if (!mismatchIncoming) return
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch(`/api/projects/${projectId}/switch-staad`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          incoming_file_hash: mismatchIncoming.file_hash,
          incoming_file_name: mismatchIncoming.file_name,
        }),
      })
      const body = await r.json()
      if (!r.ok || !body.ok) {
        setError(body.error ?? `HTTP ${r.status}`)
        setSubmitting(false)
        return
      }
      setDialogOpen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  return (
    <div className="card">
      <div className="ch">
        <span
          className="text-[11.5px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text2)' }}
        >
          STAAD Versions
        </span>
        <span
          className="ml-auto mono text-[10.5px]"
          style={{ color: 'var(--color-text2)' }}
        >
          {rows.length} version{rows.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="cb" style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <div
            className="text-[11.5px] px-3 py-2"
            style={{ color: 'var(--color-text2)' }}
          >
            No STAAD synced yet. Open a model in STAAD and run the bridge to
            pin the project's active file.
          </div>
        ) : (
          <table
            className="t"
            style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}
          >
            <thead style={{ background: 'var(--color-panel)' }}>
              <tr>
                <th style={{ width: 90 }}>State</th>
                <th>File</th>
                <th style={{ width: 100 }}>Hash</th>
                <th style={{ width: 140 }}>First synced</th>
                <th style={{ width: 140 }}>Last synced</th>
                <th className="num" style={{ textAlign: 'right', width: 60 }}>
                  Syncs
                </th>
                <th style={{ width: 160 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <VersionRow
                  key={`${r.kind}:${r.archive_project_id ?? r.project_id}:${r.file_hash}`}
                  row={r}
                  onChangeStaad={() => setDialogOpen(true)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialogOpen && mismatchIncoming && (
        <ChangeStaadDialog
          incoming={mismatchIncoming}
          submitting={submitting}
          error={error}
          onCancel={() => {
            setDialogOpen(false)
            setError(null)
          }}
          onConfirm={onConfirmSwitch}
        />
      )}
    </div>
  )
}

function VersionRow({
  row,
  onChangeStaad,
}: {
  row: StaadVersionRow
  onChangeStaad: () => void
}) {
  const stateChip =
    row.kind === 'active'
      ? { label: 'Active', color: 'var(--color-green)' }
      : row.kind === 'archived'
        ? { label: 'Archived', color: 'var(--color-text2)' }
        : { label: 'Mismatch', color: '#dc2626' }

  return (
    <tr>
      <td>
        <span
          style={{
            display: 'inline-block',
            padding: '1px 6px',
            border: `1px solid ${stateChip.color}`,
            color: stateChip.color,
            borderRadius: 2,
            fontSize: 9.5,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}
        >
          {stateChip.label}
        </span>
      </td>
      <td style={{ wordBreak: 'break-all' }}>{row.file_name}</td>
      <td className="mono">{row.file_hash.slice(0, 8)}</td>
      <td className="mono">{formatTs(row.first_synced_at)}</td>
      <td className="mono">{formatTs(row.last_synced_at)}</td>
      <td className="num" style={{ textAlign: 'right' }}>
        {row.sync_count || '—'}
      </td>
      <td>
        {row.kind === 'mismatch' && (
          <button
            type="button"
            onClick={onChangeStaad}
            style={{
              padding: '2px 8px',
              fontSize: 10.5,
              fontWeight: 600,
              color: '#fff',
              background: '#dc2626',
              border: '1px solid #b91c1c',
              borderRadius: 2,
              cursor: 'pointer',
            }}
          >
            Change STAAD →
          </button>
        )}
        {row.kind === 'archived' && row.archive_project_id && (
          <Link
            href={`/projects/${row.archive_project_id}`}
            style={{
              fontSize: 10.5,
              color: 'var(--color-blue)',
              textDecoration: 'underline',
            }}
          >
            Open archive →
          </Link>
        )}
      </td>
    </tr>
  )
}

function ChangeStaadDialog({
  incoming,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  incoming: { file_name: string; file_hash: string }
  submitting: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onCancel}
    >
      <div
        className="card"
        style={{
          maxWidth: 480,
          width: '90vw',
          background: 'var(--color-panel)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ch">
          <span
            className="text-[11.5px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--color-text2)' }}
          >
            Change STAAD
          </span>
        </div>
        <div className="cb" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 11.5, margin: 0, lineHeight: 1.5 }}>
            The current STAAD will be archived as a read-only copy.
            The current project will adopt:
          </p>
          <div
            className="mono"
            style={{
              fontSize: 11,
              padding: '6px 8px',
              background: 'var(--color-panel-2, rgba(0,0,0,0.04))',
              border: '1px solid var(--color-border)',
              borderRadius: 2,
            }}
          >
            <div style={{ wordBreak: 'break-all' }}>{incoming.file_name}</div>
            <div style={{ color: 'var(--color-text2)' }}>
              {incoming.file_hash.slice(0, 16)}…
            </div>
          </div>
          <p style={{ fontSize: 11, margin: 0, color: 'var(--color-text2)', lineHeight: 1.5 }}>
            All element designs are preserved but flagged{' '}
            <strong>unverified</strong> — member numbering may differ in the
            new file, so each design needs review before re-running.
          </p>
          {error && (
            <div
              style={{
                fontSize: 11,
                padding: '6px 8px',
                color: '#b91c1c',
                background: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: 2,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                border: '1px solid var(--color-border)',
                background: 'transparent',
                borderRadius: 2,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={submitting}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: '#fff',
                background: '#dc2626',
                border: '1px solid #b91c1c',
                borderRadius: 2,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Archiving…' : 'Archive & Switch'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatTs(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}
