/**
 * React-PDF design report.
 *
 * Sections follow docs/10-ui-layouts.md § Reports — cover, sync stamp,
 * scoped element pages, MTO. The cover always shows the STAAD file
 * name + 8-char hash + sync date (docs/02-architecture.md § Reports
 * Without STAAD), and a red "OUT OF SYNC" banner if mismatch_detected
 * was true at generation time.
 *
 * Server-only — uses `renderToBuffer()` from the API route to produce
 * a Buffer that gets uploaded to Supabase Storage.
 */
import 'server-only'

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'
import React from 'react'

import type {
  ElementSummary,
  FootingSummary,
  ProjectSnapshot,
  SlabSummary,
} from './context'

export type ReportScope =
  | 'full' | 'beams' | 'columns' | 'slabs' | 'footings' | 'mto'

export type ReportProps = {
  snapshot: ProjectSnapshot
  scope: ReportScope
  title: string
  engineerOfRecord: string | null
}

const COLORS = {
  amber: '#D4820F',
  blue: '#1755A0',
  green: '#256830',
  red: '#A02020',
  text: '#1A1816',
  text2: '#6A6560',
  border: '#DDD8CE',
  surf2: '#F6F4EF',
  surf3: '#F0EDE8',
  amberL: '#FEF3E0',
  redL: '#FDE8E8',
  greenL: '#E4F2E6',
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: COLORS.text,
  },
  h1: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  h2: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 16, marginBottom: 6 },
  h3: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 8, marginBottom: 4 },
  small: { fontSize: 8, color: COLORS.text2 },
  metaRow: { flexDirection: 'row', gap: 4, marginBottom: 2 },
  metaLabel: { fontSize: 8, color: COLORS.text2, width: 90, textTransform: 'uppercase' },
  metaValue: { fontSize: 10, fontFamily: 'Courier' },
  bannerOk: {
    marginTop: 8, padding: 8, fontSize: 9, color: COLORS.green,
    backgroundColor: COLORS.greenL, borderLeft: `3pt solid ${COLORS.green}`,
  },
  bannerWarn: {
    marginTop: 8, padding: 8, fontSize: 9, color: COLORS.red,
    backgroundColor: COLORS.redL, borderLeft: `3pt solid ${COLORS.red}`,
  },
  table: { marginTop: 4, border: `0.5pt solid ${COLORS.border}` },
  thead: {
    flexDirection: 'row', backgroundColor: COLORS.surf3,
    borderBottom: `0.5pt solid ${COLORS.border}`,
  },
  th: {
    padding: 4, fontSize: 8, fontFamily: 'Helvetica-Bold',
    color: COLORS.text2, textTransform: 'uppercase',
  },
  tr: { flexDirection: 'row', borderBottom: `0.25pt solid ${COLORS.border}` },
  td: { padding: 4, fontSize: 9 },
  monoTd: { padding: 4, fontSize: 9, fontFamily: 'Courier' },
  pageNum: {
    position: 'absolute', bottom: 18, left: 36, right: 36,
    fontSize: 8, color: COLORS.text2,
    flexDirection: 'row', justifyContent: 'space-between',
  },
})

export function ReportDocument({ snapshot, scope, title, engineerOfRecord }: ReportProps) {
  const { project, staad } = snapshot
  const showBeams = scope === 'full' || scope === 'beams'
  const showColumns = scope === 'full' || scope === 'columns'
  const showSlabs = scope === 'full' || scope === 'slabs'
  const showFootings = scope === 'full' || scope === 'footings'
  const showMto = scope === 'full' || scope === 'mto'

  return (
    <Document title={title} author={engineerOfRecord ?? 'StructAI'}>
      {/* ── Cover page ─────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.small}>STRUCTAI · DESIGN REPORT</Text>
        <Text style={styles.h1}>{title}</Text>
        <Text style={styles.small}>{project.name}</Text>

        <View style={{ marginTop: 24 }}>
          <Meta label="Project" value={project.name} />
          {project.client ? <Meta label="Client" value={project.client} /> : null}
          {project.location ? <Meta label="Location" value={project.location} /> : null}
          <Meta label="Code" value={project.code_standard.replace(/_/g, ' ')} />
          {engineerOfRecord ? <Meta label="EOR" value={engineerOfRecord} /> : null}
          <Meta label="Generated" value={new Date().toISOString().slice(0, 19).replace('T', ' ')} />
        </View>

        <Text style={styles.h2}>STAAD source</Text>
        {staad ? (
          <>
            <Meta label="File" value={staad.file_name ?? '—'} />
            <Meta label="Hash" value={(staad.file_hash ?? '').slice(0, 8).toUpperCase() || '—'} />
            <Meta label="Synced" value={staad.synced_at?.slice(0, 19).replace('T', ' ') ?? '—'} />
            <Meta label="Counts" value={`${staad.node_count} nodes · ${staad.member_count} members`} />
            {staad.mismatch_detected ? (
              <View style={styles.bannerWarn}>
                <Text>
                  ⚠ STAAD model mismatch — {staad.mismatch_members.length} member(s)
                  changed since the last verified sync. Designs flagged as unverified
                  must be re-run before this report can be acted upon.
                </Text>
              </View>
            ) : (
              <View style={styles.bannerOk}>
                <Text>● Report is in sync with the STAAD model captured above.</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.bannerWarn}>
            <Text>
              ⚠ No STAAD sync on record for this project. The report uses
              user-defined element data only.
            </Text>
          </View>
        )}

        <Text style={styles.h2}>Scope</Text>
        <Text>
          {scope === 'full' ? 'Beams · Columns · Slabs · Footings · Material takeoff' : scope}
        </Text>

        <Text style={styles.h2}>Element summary</Text>
        <Counts snapshot={snapshot} />

        <PageFooter pageLabel="Cover" />
      </Page>

      {showBeams && snapshot.beams.length > 0 ? (
        <ElementPage title="Beams" headers={ELEMENT_HEADERS} rows={snapshot.beams.map(rowFromElement)} />
      ) : null}
      {showColumns && snapshot.columns.length > 0 ? (
        <ElementPage title="Columns" headers={ELEMENT_HEADERS} rows={snapshot.columns.map(rowFromElement)} />
      ) : null}
      {showSlabs && snapshot.slabs.length > 0 ? (
        <ElementPage title="Slabs" headers={SLAB_HEADERS} rows={snapshot.slabs.map(rowFromSlab)} />
      ) : null}
      {showFootings && snapshot.footings.length > 0 ? (
        <ElementPage title="Footings" headers={FOOTING_HEADERS} rows={snapshot.footings.map(rowFromFooting)} />
      ) : null}
      {showMto && snapshot.mto.rows.length > 0 ? <MtoPage snapshot={snapshot} /> : null}
    </Document>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )
}

function Counts({ snapshot }: { snapshot: ProjectSnapshot }) {
  const summarise = (xs: { status: string }[]) => ({
    total: xs.length,
    pass: xs.filter((x) => x.status === 'pass').length,
    fail: xs.filter((x) => x.status === 'fail').length,
  })
  const b = summarise(snapshot.beams)
  const c = summarise(snapshot.columns)
  const s = summarise(snapshot.slabs)
  const f = summarise(snapshot.footings)
  return (
    <View style={styles.table}>
      <View style={styles.thead}>
        <Text style={[styles.th, { width: 100 }]}>Element</Text>
        <Text style={[styles.th, { width: 60, textAlign: 'right' }]}>Total</Text>
        <Text style={[styles.th, { width: 60, textAlign: 'right' }]}>Pass</Text>
        <Text style={[styles.th, { width: 60, textAlign: 'right' }]}>Fail</Text>
      </View>
      {[
        ['Beams', b],
        ['Columns', c],
        ['Slabs', s],
        ['Footings', f],
      ].map(([label, v]) => {
        const stats = v as { total: number; pass: number; fail: number }
        return (
          <View key={String(label)} style={styles.tr}>
            <Text style={[styles.td, { width: 100 }]}>{String(label)}</Text>
            <Text style={[styles.monoTd, { width: 60, textAlign: 'right' }]}>{stats.total}</Text>
            <Text style={[styles.monoTd, { width: 60, textAlign: 'right', color: COLORS.green }]}>{stats.pass}</Text>
            <Text style={[styles.monoTd, { width: 60, textAlign: 'right', color: COLORS.red }]}>{stats.fail}</Text>
          </View>
        )
      })}
    </View>
  )
}

const ELEMENT_HEADERS = ['Label', 'Section', 'Members', 'Demand', 'Capacity', 'Verdict']
const SLAB_HEADERS = ['Label', 'Type', 'Lx × Ly', 't (mm)', 'Verdict', '']
const FOOTING_HEADERS = ['Label', 'Type', 'Lx×Ly×d (mm)', 'Verdict', '', '']

function rowFromElement(e: ElementSummary): string[] {
  return [
    e.label,
    e.section_name,
    `[${e.member_ids.join(', ')}]`,
    e.demand ?? '—',
    e.capacity ?? '—',
    e.verdict ?? e.status,
  ]
}
function rowFromSlab(s: SlabSummary): string[] {
  return [
    s.label,
    s.type.replace('_', '-'),
    `${s.span_x_mm}×${s.span_y_mm}`,
    String(s.thickness_mm),
    s.verdict ?? s.status,
    '',
  ]
}
function rowFromFooting(f: FootingSummary): string[] {
  return [f.label, f.type, f.size_mm, f.verdict ?? f.status, '', '']
}

function ElementPage({
  title, headers, rows,
}: {
  title: string
  headers: string[]
  rows: string[][]
}) {
  // Auto-size columns: equal widths.
  const colW = (515 - 2) / headers.length // A4 minus padding ≈ 515pt
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.h2}>{title}</Text>
      <View style={styles.table}>
        <View style={styles.thead}>
          {headers.map((h, i) => (
            <Text key={i} style={[styles.th, { width: colW }]}>{h}</Text>
          ))}
        </View>
        {rows.map((row, ri) => (
          <View key={ri} style={[styles.tr, verdictRowStyle(row[row.length - 2] ?? row[row.length - 1])]}>
            {row.map((cell, ci) => (
              <Text
                key={ci}
                style={[
                  ci === 0 ? styles.monoTd : styles.td,
                  { width: colW },
                ]}
              >
                {cell}
              </Text>
            ))}
          </View>
        ))}
      </View>
      <PageFooter pageLabel={title} />
    </Page>
  )
}

function verdictRowStyle(verdict: string | undefined) {
  if (verdict === 'fail') return { backgroundColor: COLORS.redL }
  return {}
}

function MtoPage({ snapshot }: { snapshot: ProjectSnapshot }) {
  const colW = [60, 50, 80, 100, 70, 70, 70]
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.h2}>Material takeoff</Text>
      <View style={{ flexDirection: 'row', gap: 20, marginBottom: 8 }}>
        <Meta label="Total weight" value={`${snapshot.mto.total_weight_kg.toFixed(1)} kg`} />
        <Meta label="Largest Ø" value={`Ø${snapshot.mto.largest_dia_mm}`} />
      </View>
      <View style={styles.table}>
        <View style={styles.thead}>
          {['Mark', 'Ø', 'Element', 'Description', 'L tot (m)', 'kg/m', 'kg'].map((h, i) => (
            <Text key={i} style={[styles.th, { width: colW[i], textAlign: i >= 4 ? 'right' : 'left' }]}>{h}</Text>
          ))}
        </View>
        {snapshot.mto.rows.map((r, ri) => {
          const kgPerM = r.total_length_m > 0 ? r.weight_kg / r.total_length_m : 0
          return (
            <View key={ri} style={styles.tr}>
              <Text style={[styles.monoTd, { width: colW[0] }]}>{r.bar_mark}</Text>
              <Text style={[styles.monoTd, { width: colW[1] }]}>Ø{r.bar_dia_mm}</Text>
              <Text style={[styles.monoTd, { width: colW[2] }]}>{r.element_label}</Text>
              <Text style={[styles.td, { width: colW[3] }]}>—</Text>
              <Text style={[styles.monoTd, { width: colW[4], textAlign: 'right' }]}>{r.total_length_m.toFixed(2)}</Text>
              <Text style={[styles.monoTd, { width: colW[5], textAlign: 'right' }]}>{kgPerM.toFixed(3)}</Text>
              <Text style={[styles.monoTd, { width: colW[6], textAlign: 'right' }]}>{r.weight_kg.toFixed(2)}</Text>
            </View>
          )
        })}
        <View style={[styles.tr, { backgroundColor: '#121008' }]}>
          <Text style={[styles.td, { width: colW[0] + colW[1] + colW[2] + colW[3] + colW[4] + colW[5], textAlign: 'right', color: COLORS.amber, fontFamily: 'Helvetica-Bold' }]}>
            GRAND TOTAL
          </Text>
          <Text style={[styles.monoTd, { width: colW[6], textAlign: 'right', color: COLORS.amber, fontFamily: 'Courier-Bold' }]}>
            {snapshot.mto.total_weight_kg.toFixed(2)}
          </Text>
        </View>
      </View>
      <PageFooter pageLabel="MTO" />
    </Page>
  )
}

function PageFooter({ pageLabel }: { pageLabel: string }) {
  return (
    <View style={styles.pageNum} fixed>
      <Text>{pageLabel}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  )
}
