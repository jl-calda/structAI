/**
 * React-PDF design report.
 *
 * Produces a comprehensive structural engineering design report with:
 * Cover, TOC, Design Basis, Load Cases, Load Combinations,
 * Element Design pages, Material Take-Off, and STAAD Model Appendix.
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
  selectedElements?: {
    beamIds?: string[]
    columnIds?: string[]
    slabIds?: string[]
    footingIds?: string[]
  }
}

// ─────────────────────────────────────────────────────────────────────
// Theme
// ─────────────────────────────────────────────────────────────────────

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
  // New styles
  tocItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 2, fontSize: 10,
  },
  tocDots: {
    flex: 1, borderBottom: '0.5pt dotted #999',
    marginLeft: 4, marginRight: 4, marginBottom: 3,
  },
  sectionTitle: {
    fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 8,
    borderBottom: '1pt solid #1A1816', paddingBottom: 4,
  },
  passTag: {
    backgroundColor: '#E4F2E6', color: '#256830',
    padding: '2 6', fontSize: 8, borderRadius: 2,
  },
  failTag: {
    backgroundColor: '#FDE8E8', color: '#A02020',
    padding: '2 6', fontSize: 8, borderRadius: 2,
  },
  kvRow: {
    flexDirection: 'row', borderBottom: '0.25pt solid #DDD8CE',
    paddingVertical: 3,
  },
  kvKey: { width: 140, fontSize: 9, color: '#6A6560' },
  kvVal: { fontSize: 9, fontFamily: 'Courier' },
  // Cover header bar
  headerBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderBottom: '2pt solid #1A1816', paddingBottom: 6, marginBottom: 16,
  },
  headerTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', letterSpacing: 2 },
  headerSub: { fontSize: 8, color: COLORS.text2, textAlign: 'right' },
})

// ─────────────────────────────────────────────────────────────────────
// Helper: compute Ec from fc (ACI 318)
// ─────────────────────────────────────────────────────────────────────

function computeEc(fc_mpa: number): number {
  return 4700 * Math.sqrt(fc_mpa)
}

function computeBeta1(fc_mpa: number): number {
  if (fc_mpa <= 28) return 0.85
  if (fc_mpa >= 56) return 0.65
  return 0.85 - 0.05 * (fc_mpa - 28) / 7
}

// ─────────────────────────────────────────────────────────────────────
// Scope helpers
// ─────────────────────────────────────────────────────────────────────

function filterElements<T extends { id: string }>(
  list: T[],
  selectedIds: string[] | undefined,
): T[] {
  if (!selectedIds || selectedIds.length === 0) return list
  const set = new Set(selectedIds)
  return list.filter((e) => set.has(e.id))
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────

export function ReportDocument({
  snapshot, scope, title, engineerOfRecord, selectedElements,
}: ReportProps) {
  const { project, staad } = snapshot

  const showBeams = scope === 'full' || scope === 'beams'
  const showColumns = scope === 'full' || scope === 'columns'
  const showSlabs = scope === 'full' || scope === 'slabs'
  const showFootings = scope === 'full' || scope === 'footings'
  const showMto = scope === 'full' || scope === 'mto'

  // Filter by selectedElements when provided
  const beams = showBeams
    ? filterElements(snapshot.beams, selectedElements?.beamIds)
    : []
  const columns = showColumns
    ? filterElements(snapshot.columns, selectedElements?.columnIds)
    : []
  const slabs = showSlabs
    ? filterElements(snapshot.slabs, selectedElements?.slabIds)
    : []
  const footings = showFootings
    ? filterElements(snapshot.footings, selectedElements?.footingIds)
    : []

  const hasDesignBasis = !!snapshot.designBasis
  const hasLoadCases = !!(snapshot.loadCases && snapshot.loadCases.length > 0)
  const hasCombinations = !!(snapshot.combinations && snapshot.combinations.length > 0)
  const hasStaadAppendix = !!(
    snapshot.staadNodes && snapshot.staadNodes.length > 0
  )

  // Build TOC entries
  const tocEntries: { label: string; page: string }[] = []
  let pageNum = 3 // cover = 1, TOC = 2, design basis starts at 3
  if (hasDesignBasis) {
    tocEntries.push({ label: '1. Design Basis', page: String(pageNum) })
    pageNum++
  }
  if (hasLoadCases || hasCombinations) {
    tocEntries.push({ label: '2. Load Cases & Combinations', page: String(pageNum) })
    pageNum++
  }
  if (beams.length > 0) {
    tocEntries.push({ label: '3. Beam Design', page: String(pageNum) })
    pageNum += Math.ceil(beams.length / 4) // rough estimate
  }
  if (columns.length > 0) {
    tocEntries.push({ label: '4. Column Design', page: String(pageNum) })
    pageNum += Math.ceil(columns.length / 4)
  }
  if (slabs.length > 0) {
    tocEntries.push({ label: '5. Slab Design', page: String(pageNum) })
    pageNum += Math.ceil(slabs.length / 6)
  }
  if (footings.length > 0) {
    tocEntries.push({ label: '6. Footing Design', page: String(pageNum) })
    pageNum += Math.ceil(footings.length / 6)
  }
  if (showMto && snapshot.mto.rows.length > 0) {
    tocEntries.push({ label: '7. Material Take-Off', page: String(pageNum) })
    pageNum++
  }
  if (hasStaadAppendix) {
    tocEntries.push({ label: 'A. STAAD Model Data', page: String(pageNum) })
  }

  return (
    <Document title={title} author={engineerOfRecord ?? 'StructAI'}>

      {/* ────────────────────── 1. COVER PAGE ────────────────────── */}
      <CoverPage
        title={title}
        project={project}
        staad={staad}
        scope={scope}
        engineerOfRecord={engineerOfRecord}
        snapshot={snapshot}
      />

      {/* ────────────────────── 2. TABLE OF CONTENTS ──────────────── */}
      <TocPage entries={tocEntries} />

      {/* ────────────────────── 3. DESIGN BASIS ───────────────────── */}
      {hasDesignBasis ? (
        <DesignBasisPage
          designBasis={snapshot.designBasis!}
          codeStandard={project.code_standard}
        />
      ) : null}

      {/* ────────────────────── 4/5. LOAD CASES & COMBINATIONS ──── */}
      {hasLoadCases || hasCombinations ? (
        <LoadCasesPage
          loadCases={snapshot.loadCases ?? []}
          combinations={snapshot.combinations ?? []}
        />
      ) : null}

      {/* ────────────────────── 6. ELEMENT DESIGN ─────────────────── */}
      {beams.length > 0 ? (
        <ElementDesignPages
          sectionLabel="Beam Design"
          elements={beams}
          renderProperties={renderBeamProps}
        />
      ) : null}

      {columns.length > 0 ? (
        <ElementDesignPages
          sectionLabel="Column Design"
          elements={columns}
          renderProperties={renderColumnProps}
        />
      ) : null}

      {slabs.length > 0 ? (
        <SlabDesignPages slabs={slabs} />
      ) : null}

      {footings.length > 0 ? (
        <FootingDesignPages footings={footings} />
      ) : null}

      {/* ────────────────────── 7. MATERIAL TAKE-OFF ──────────────── */}
      {showMto && snapshot.mto.rows.length > 0 ? (
        <MtoPages snapshot={snapshot} />
      ) : null}

      {/* ────────────────────── A. APPENDIX: STAAD MODEL ──────────── */}
      {hasStaadAppendix ? <StaadAppendixPages snapshot={snapshot} /> : null}

    </Document>
  )
}

// ═════════════════════════════════════════════════════════════════════
// Sub-components
// ═════════════════════════════════════════════════════════════════════

// ─── Shared helpers ──────────────────────────────────────────────────

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvKey}>{label}</Text>
      <Text style={styles.kvVal}>{value}</Text>
    </View>
  )
}

function StatusTag({ status }: { status: string }) {
  const isPassing = status === 'pass' || status === 'ok'
  return (
    <Text style={isPassing ? styles.passTag : styles.failTag}>
      {status.toUpperCase()}
    </Text>
  )
}

function SectionHeading({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>
}

function PageFooter({ pageLabel }: { pageLabel: string }) {
  return (
    <View style={styles.pageNum} fixed>
      <Text>{pageLabel}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  )
}

function CompanyHeader() {
  return (
    <View style={styles.headerBar} fixed>
      <Text style={styles.headerTitle}>STRUCTAI</Text>
      <Text style={styles.headerSub}>STRUCTURAL DESIGN REPORT</Text>
    </View>
  )
}

function TableHeader({ headers, widths }: { headers: string[]; widths: number[] }) {
  return (
    <View style={styles.thead}>
      {headers.map((h, i) => (
        <Text key={i} style={[styles.th, { width: widths[i] }]}>{h}</Text>
      ))}
    </View>
  )
}

function verdictRowStyle(verdict: string | undefined) {
  if (verdict === 'fail') return { backgroundColor: COLORS.redL }
  return {}
}

// ─── COVER PAGE ──────────────────────────────────────────────────────

function CoverPage({
  title, project, staad, scope, engineerOfRecord, snapshot,
}: {
  title: string
  project: ProjectSnapshot['project']
  staad: ProjectSnapshot['staad']
  scope: ReportScope
  engineerOfRecord: string | null
  snapshot: ProjectSnapshot
}) {
  return (
    <Page size="A4" style={styles.page}>
      <CompanyHeader />

      <View style={{ marginTop: 40 }}>
        <Text style={styles.h1}>{title}</Text>
        <Text style={[styles.small, { marginTop: 2 }]}>{project.name}</Text>
      </View>

      <View style={{ marginTop: 32 }}>
        <Meta label="Project" value={project.name} />
        {project.client ? <Meta label="Client" value={project.client} /> : null}
        {project.location ? <Meta label="Location" value={project.location} /> : null}
        <Meta label="Code" value={project.code_standard.replace(/_/g, ' ')} />
        {engineerOfRecord ? <Meta label="Engineer of Record" value={engineerOfRecord} /> : null}
        <Meta label="Generated" value={new Date().toISOString().slice(0, 19).replace('T', ' ')} />
      </View>

      <Text style={styles.h2}>STAAD Source</Text>
      {staad ? (
        <>
          <Meta label="File" value={staad.file_name ?? '—'} />
          <Meta label="Hash" value={(staad.file_hash ?? '').slice(0, 8).toUpperCase() || '—'} />
          <Meta label="Synced" value={staad.synced_at?.slice(0, 19).replace('T', ' ') ?? '—'} />
          <Meta label="Counts" value={`${staad.node_count} nodes · ${staad.member_count} members`} />
          {staad.mismatch_detected ? (
            <View style={styles.bannerWarn}>
              <Text>
                WARNING: STAAD model mismatch — {staad.mismatch_members.length} member(s)
                changed since the last verified sync. Designs flagged as unverified
                must be re-run before this report can be acted upon.
              </Text>
            </View>
          ) : (
            <View style={styles.bannerOk}>
              <Text>Report is in sync with the STAAD model captured above.</Text>
            </View>
          )}
        </>
      ) : (
        <View style={styles.bannerWarn}>
          <Text>
            No STAAD sync on record for this project. The report uses
            user-defined element data only.
          </Text>
        </View>
      )}

      <Text style={styles.h2}>Scope</Text>
      <Text>
        {scope === 'full'
          ? 'Beams · Columns · Slabs · Footings · Material Take-Off'
          : scope.charAt(0).toUpperCase() + scope.slice(1)}
      </Text>

      <Text style={styles.h2}>Element Summary</Text>
      <Counts snapshot={snapshot} />

      <PageFooter pageLabel="Cover" />
    </Page>
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
  const colW = [100, 60, 60, 60]
  return (
    <View style={styles.table}>
      <View style={styles.thead}>
        <Text style={[styles.th, { width: colW[0] }]}>Element</Text>
        <Text style={[styles.th, { width: colW[1], textAlign: 'right' }]}>Total</Text>
        <Text style={[styles.th, { width: colW[2], textAlign: 'right' }]}>Pass</Text>
        <Text style={[styles.th, { width: colW[3], textAlign: 'right' }]}>Fail</Text>
      </View>
      {(
        [
          ['Beams', b],
          ['Columns', c],
          ['Slabs', s],
          ['Footings', f],
        ] as [string, { total: number; pass: number; fail: number }][]
      ).map(([label, stats]) => (
        <View key={label} style={styles.tr}>
          <Text style={[styles.td, { width: colW[0] }]}>{label}</Text>
          <Text style={[styles.monoTd, { width: colW[1], textAlign: 'right' }]}>
            {stats.total}
          </Text>
          <Text style={[styles.monoTd, { width: colW[2], textAlign: 'right', color: COLORS.green }]}>
            {stats.pass}
          </Text>
          <Text style={[styles.monoTd, { width: colW[3], textAlign: 'right', color: COLORS.red }]}>
            {stats.fail}
          </Text>
        </View>
      ))}
    </View>
  )
}

// ─── TABLE OF CONTENTS ───────────────────────────────────────────────

function TocPage({ entries }: { entries: { label: string; page: string }[] }) {
  return (
    <Page size="A4" style={styles.page}>
      <CompanyHeader />
      <SectionHeading>Table of Contents</SectionHeading>
      <View style={{ marginTop: 12 }}>
        {entries.map((e) => (
          <View key={e.label} style={styles.tocItem}>
            <Text>{e.label}</Text>
            <View style={styles.tocDots} />
            <Text>{e.page}</Text>
          </View>
        ))}
      </View>
      <PageFooter pageLabel="TOC" />
    </Page>
  )
}

// ─── DESIGN BASIS PAGE ──────────────────────────────────────────────

function DesignBasisPage({
  designBasis,
  codeStandard,
}: {
  designBasis: NonNullable<ProjectSnapshot['designBasis']>
  codeStandard: string
}) {
  const ec = computeEc(designBasis.fc_mpa)
  const beta1 = computeBeta1(designBasis.fc_mpa)

  return (
    <Page size="A4" style={styles.page}>
      <CompanyHeader />
      <SectionHeading>1. Design Basis</SectionHeading>

      {/* Material properties */}
      <Text style={styles.h3}>Material Properties</Text>
      <View style={{ marginTop: 4 }}>
        <KvRow label="Concrete strength, f'c" value={`${designBasis.fc_mpa} MPa`} />
        <KvRow label="Rebar yield strength, fy" value={`${designBasis.fy_mpa} MPa`} />
        <KvRow label="Stirrup yield strength, fys" value={`${designBasis.fys_mpa} MPa`} />
        <KvRow label="Modulus of elasticity, Ec" value={`${ec.toFixed(0)} MPa`} />
        <KvRow label="Whitney block factor, β1" value={beta1.toFixed(3)} />
        <KvRow label="Clear cover" value={`${designBasis.cover_mm} mm`} />
        <KvRow label="Concrete density" value={`${designBasis.density_kn_m3} kN/m³`} />
      </View>

      {/* Seismic parameters */}
      {designBasis.seismicZone ? (
        <>
          <Text style={styles.h3}>Seismic Parameters</Text>
          <View style={{ marginTop: 4 }}>
            <KvRow label="Seismic Zone" value={designBasis.seismicZone} />
            {designBasis.soilProfile ? (
              <KvRow label="Soil Profile" value={designBasis.soilProfile} />
            ) : null}
            {designBasis.importance != null ? (
              <KvRow label="Importance Factor, I" value={String(designBasis.importance)} />
            ) : null}
            {designBasis.rFactor != null ? (
              <KvRow label="Response Modification, R" value={String(designBasis.rFactor)} />
            ) : null}
          </View>
        </>
      ) : null}

      {/* Wind parameters */}
      {designBasis.windSpeed != null ? (
        <>
          <Text style={styles.h3}>Wind Parameters</Text>
          <View style={{ marginTop: 4 }}>
            <KvRow label="Basic wind speed, V" value={`${designBasis.windSpeed} m/s`} />
          </View>
        </>
      ) : null}

      {/* Code references */}
      <Text style={styles.h3}>Code References</Text>
      <View style={{ marginTop: 4 }}>
        <KvRow label="Design code" value={codeStandard.replace(/_/g, ' ')} />
        <KvRow label="Concrete design" value="NSCP 2015 / ACI 318-14" />
        <KvRow label="Load combinations" value="NSCP 2015 §203 / ASCE 7-16" />
        <KvRow label="Seismic provisions" value="NSCP 2015 §208 / UBC 97" />
      </View>

      <PageFooter pageLabel="Design Basis" />
    </Page>
  )
}

// ─── LOAD CASES & COMBINATIONS PAGE ──────────────────────────────────

function LoadCasesPage({
  loadCases,
  combinations,
}: {
  loadCases: NonNullable<ProjectSnapshot['loadCases']>
  combinations: NonNullable<ProjectSnapshot['combinations']>
}) {
  const lcWidths = [60, 280, 140]
  const comboWidths = [80, 400]

  return (
    <Page size="A4" style={styles.page}>
      <CompanyHeader />
      <SectionHeading>2. Load Cases & Combinations</SectionHeading>

      {/* Primary load cases */}
      {loadCases.length > 0 ? (
        <>
          <Text style={styles.h3}>Primary Load Cases</Text>
          <View style={styles.table}>
            <TableHeader headers={['LC #', 'Title', 'Type']} widths={lcWidths} />
            {loadCases.map((lc) => (
              <View key={lc.case_number} style={styles.tr}>
                <Text style={[styles.monoTd, { width: lcWidths[0] }]}>
                  {lc.case_number}
                </Text>
                <Text style={[styles.td, { width: lcWidths[1] }]}>{lc.title}</Text>
                <Text style={[styles.td, { width: lcWidths[2] }]}>{lc.load_type}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* Load combinations */}
      {combinations.length > 0 ? (
        <>
          <Text style={styles.h3}>Load Combinations</Text>
          <View style={styles.table}>
            <TableHeader headers={['Combo #', 'Title']} widths={comboWidths} />
            {combinations.map((c) => (
              <View key={c.combo_number} style={styles.tr}>
                <Text style={[styles.monoTd, { width: comboWidths[0] }]}>
                  {c.combo_number}
                </Text>
                <Text style={[styles.td, { width: comboWidths[1] }]}>{c.title}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <PageFooter pageLabel="Load Cases" />
    </Page>
  )
}

// ─── ELEMENT DESIGN PAGES ────────────────────────────────────────────

function renderBeamProps(e: ElementSummary): { label: string; value: string }[] {
  return [
    { label: 'Label', value: e.label },
    { label: 'Section', value: e.section_name },
    { label: 'Member IDs', value: e.member_ids.join(', ') },
  ]
}

function renderColumnProps(e: ElementSummary): { label: string; value: string }[] {
  return [
    { label: 'Label', value: e.label },
    { label: 'Section', value: e.section_name },
    { label: 'Member IDs', value: e.member_ids.join(', ') },
  ]
}

function ElementDesignPages({
  sectionLabel,
  elements,
  renderProperties,
}: {
  sectionLabel: string
  elements: ElementSummary[]
  renderProperties: (e: ElementSummary) => { label: string; value: string }[]
}) {
  // Group elements into pages — roughly 4 elements per page
  const perPage = 4
  const pages: ElementSummary[][] = []
  for (let i = 0; i < elements.length; i += perPage) {
    pages.push(elements.slice(i, i + perPage))
  }

  return (
    <>
      {pages.map((pageElems, pageIdx) => (
        <Page key={`${sectionLabel}-${pageIdx}`} size="A4" style={styles.page}>
          <CompanyHeader />
          {pageIdx === 0 ? <SectionHeading>{sectionLabel}</SectionHeading> : null}
          {pageIdx > 0 ? (
            <Text style={[styles.h2, { marginTop: 0 }]}>
              {sectionLabel} (continued)
            </Text>
          ) : null}

          {pageElems.map((elem) => (
            <ElementCard
              key={elem.id}
              element={elem}
              properties={renderProperties(elem)}
            />
          ))}

          <PageFooter pageLabel={sectionLabel} />
        </Page>
      ))}
    </>
  )
}

function ElementCard({
  element,
  properties,
}: {
  element: ElementSummary
  properties: { label: string; value: string }[]
}) {
  return (
    <View style={{ marginBottom: 16 }} wrap={false}>
      {/* Header row */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        borderBottom: `0.5pt solid ${COLORS.border}`, paddingBottom: 4,
        marginBottom: 6,
      }}>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold' }}>
          {element.label}
        </Text>
        <Text style={{ fontSize: 9, color: COLORS.text2 }}>
          {element.section_name}
        </Text>
        <View style={{ flex: 1 }} />
        <StatusTag status={element.verdict ?? element.status} />
      </View>

      {/* Properties (2-column key-value) */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {properties.map((p) => (
          <View key={p.label} style={[styles.kvRow, { width: '50%' }]}>
            <Text style={styles.kvKey}>{p.label}</Text>
            <Text style={styles.kvVal}>{p.value}</Text>
          </View>
        ))}
      </View>

      {/* Forces summary */}
      {element.demand || element.capacity ? (
        <View style={{ marginTop: 4 }}>
          {element.demand ? (
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Demand</Text>
              <Text style={styles.kvVal}>{element.demand}</Text>
            </View>
          ) : null}
          {element.capacity ? (
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Capacity</Text>
              <Text style={styles.kvVal}>{element.capacity}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Verdict */}
      <View style={[styles.kvRow, { marginTop: 2 }]}>
        <Text style={styles.kvKey}>Overall check</Text>
        <Text style={[
          styles.kvVal,
          { color: (element.verdict ?? element.status) === 'pass' ? COLORS.green : COLORS.red },
        ]}>
          {(element.verdict ?? element.status).toUpperCase()}
        </Text>
      </View>
    </View>
  )
}

// ─── SLAB DESIGN PAGES ──────────────────────────────────────────────

function SlabDesignPages({ slabs }: { slabs: SlabSummary[] }) {
  const perPage = 6
  const pages: SlabSummary[][] = []
  for (let i = 0; i < slabs.length; i += perPage) {
    pages.push(slabs.slice(i, i + perPage))
  }

  return (
    <>
      {pages.map((pageSlabs, pageIdx) => (
        <Page key={`slabs-${pageIdx}`} size="A4" style={styles.page}>
          <CompanyHeader />
          {pageIdx === 0 ? <SectionHeading>Slab Design</SectionHeading> : null}
          {pageIdx > 0 ? (
            <Text style={[styles.h2, { marginTop: 0 }]}>Slab Design (continued)</Text>
          ) : null}

          {pageSlabs.map((slab) => (
            <View key={slab.id} style={{ marginBottom: 12 }} wrap={false}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                borderBottom: `0.5pt solid ${COLORS.border}`, paddingBottom: 4,
                marginBottom: 4,
              }}>
                <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold' }}>
                  {slab.label}
                </Text>
                <Text style={{ fontSize: 9, color: COLORS.text2 }}>
                  {slab.type.replace('_', '-')}
                </Text>
                <View style={{ flex: 1 }} />
                <StatusTag status={slab.verdict ?? slab.status} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <View style={[styles.kvRow, { width: '50%' }]}>
                  <Text style={styles.kvKey}>Spans (Lx x Ly)</Text>
                  <Text style={styles.kvVal}>{slab.span_x_mm} x {slab.span_y_mm} mm</Text>
                </View>
                <View style={[styles.kvRow, { width: '50%' }]}>
                  <Text style={styles.kvKey}>Thickness</Text>
                  <Text style={styles.kvVal}>{slab.thickness_mm} mm</Text>
                </View>
                <View style={[styles.kvRow, { width: '50%' }]}>
                  <Text style={styles.kvKey}>Type</Text>
                  <Text style={styles.kvVal}>{slab.type.replace('_', '-')}</Text>
                </View>
                <View style={[styles.kvRow, { width: '50%' }]}>
                  <Text style={styles.kvKey}>Status</Text>
                  <Text style={[
                    styles.kvVal,
                    { color: (slab.verdict ?? slab.status) === 'pass' ? COLORS.green : COLORS.red },
                  ]}>
                    {(slab.verdict ?? slab.status).toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
          ))}

          <PageFooter pageLabel="Slab Design" />
        </Page>
      ))}
    </>
  )
}

// ─── FOOTING DESIGN PAGES ────────────────────────────────────────────

function FootingDesignPages({ footings }: { footings: FootingSummary[] }) {
  const perPage = 6
  const pages: FootingSummary[][] = []
  for (let i = 0; i < footings.length; i += perPage) {
    pages.push(footings.slice(i, i + perPage))
  }

  return (
    <>
      {pages.map((pageFootings, pageIdx) => (
        <Page key={`footings-${pageIdx}`} size="A4" style={styles.page}>
          <CompanyHeader />
          {pageIdx === 0 ? <SectionHeading>Footing Design</SectionHeading> : null}
          {pageIdx > 0 ? (
            <Text style={[styles.h2, { marginTop: 0 }]}>Footing Design (continued)</Text>
          ) : null}

          {pageFootings.map((ftg) => (
            <View key={ftg.id} style={{ marginBottom: 12 }} wrap={false}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                borderBottom: `0.5pt solid ${COLORS.border}`, paddingBottom: 4,
                marginBottom: 4,
              }}>
                <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold' }}>
                  {ftg.label}
                </Text>
                <Text style={{ fontSize: 9, color: COLORS.text2 }}>
                  {ftg.type}
                </Text>
                <View style={{ flex: 1 }} />
                <StatusTag status={ftg.verdict ?? ftg.status} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <View style={[styles.kvRow, { width: '50%' }]}>
                  <Text style={styles.kvKey}>Size (Lx x Ly x d)</Text>
                  <Text style={styles.kvVal}>{ftg.size_mm} mm</Text>
                </View>
                <View style={[styles.kvRow, { width: '50%' }]}>
                  <Text style={styles.kvKey}>Type</Text>
                  <Text style={styles.kvVal}>{ftg.type}</Text>
                </View>
                <View style={[styles.kvRow, { width: '50%' }]}>
                  <Text style={styles.kvKey}>Status</Text>
                  <Text style={[
                    styles.kvVal,
                    { color: (ftg.verdict ?? ftg.status) === 'pass' ? COLORS.green : COLORS.red },
                  ]}>
                    {(ftg.verdict ?? ftg.status).toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
          ))}

          <PageFooter pageLabel="Footing Design" />
        </Page>
      ))}
    </>
  )
}

// ─── MATERIAL TAKE-OFF PAGES ─────────────────────────────────────────

function MtoPages({ snapshot }: { snapshot: ProjectSnapshot }) {
  const mtoColW = [60, 50, 80, 100, 70, 70, 70]
  const mtoRows = snapshot.mto.rows

  // Group MTO rows by element type prefix (B- = beam, C- = column, etc.)
  const groupedByType = new Map<string, typeof mtoRows>()
  for (const row of mtoRows) {
    const prefix = row.element_label.split('-')[0] ?? 'Other'
    const typeName = prefix === 'B' ? 'Beams'
      : prefix === 'C' ? 'Columns'
      : prefix === 'S' ? 'Slabs'
      : prefix === 'F' ? 'Footings'
      : 'Other'
    if (!groupedByType.has(typeName)) groupedByType.set(typeName, [])
    groupedByType.get(typeName)!.push(row)
  }

  // Diameter summary
  const diaMap = new Map<number, { count: number; totalKg: number; totalM: number }>()
  for (const row of mtoRows) {
    const existing = diaMap.get(row.bar_dia_mm) ?? { count: 0, totalKg: 0, totalM: 0 }
    existing.count++
    existing.totalKg += row.weight_kg
    existing.totalM += row.total_length_m
    diaMap.set(row.bar_dia_mm, existing)
  }
  const diaSummary = Array.from(diaMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([dia, d]) => ({ dia, ...d }))

  const diaColW = [80, 80, 120, 120]

  return (
    <>
      {/* Main MTO page */}
      <Page size="A4" style={styles.page}>
        <CompanyHeader />
        <SectionHeading>Material Take-Off</SectionHeading>

        <View style={{ flexDirection: 'row', gap: 20, marginBottom: 8 }}>
          <Meta label="Total weight" value={`${snapshot.mto.total_weight_kg.toFixed(1)} kg`} />
          <Meta label="Largest dia" value={`${snapshot.mto.largest_dia_mm} mm`} />
        </View>

        {/* Grouped tables */}
        {Array.from(groupedByType.entries()).map(([typeName, rows]) => {
          const typeWeight = rows.reduce((s, r) => s + r.weight_kg, 0)
          return (
            <View key={typeName} style={{ marginBottom: 12 }}>
              <Text style={styles.h3}>
                {typeName} — {typeWeight.toFixed(1)} kg
              </Text>
              <View style={styles.table}>
                <TableHeader
                  headers={['Mark', 'Dia', 'Element', 'Description', 'L tot (m)', 'kg/m', 'kg']}
                  widths={mtoColW}
                />
                {rows.map((r, ri) => {
                  const kgPerM = r.total_length_m > 0 ? r.weight_kg / r.total_length_m : 0
                  return (
                    <View key={ri} style={styles.tr}>
                      <Text style={[styles.monoTd, { width: mtoColW[0] }]}>{r.bar_mark}</Text>
                      <Text style={[styles.monoTd, { width: mtoColW[1] }]}>{r.bar_dia_mm}</Text>
                      <Text style={[styles.monoTd, { width: mtoColW[2] }]}>{r.element_label}</Text>
                      <Text style={[styles.td, { width: mtoColW[3] }]}>—</Text>
                      <Text style={[styles.monoTd, { width: mtoColW[4], textAlign: 'right' }]}>
                        {r.total_length_m.toFixed(2)}
                      </Text>
                      <Text style={[styles.monoTd, { width: mtoColW[5], textAlign: 'right' }]}>
                        {kgPerM.toFixed(3)}
                      </Text>
                      <Text style={[styles.monoTd, { width: mtoColW[6], textAlign: 'right' }]}>
                        {r.weight_kg.toFixed(2)}
                      </Text>
                    </View>
                  )
                })}
              </View>
            </View>
          )
        })}

        {/* Grand total row */}
        <View style={[styles.table, { marginTop: 8 }]}>
          <View style={[styles.tr, { backgroundColor: '#121008' }]}>
            <Text style={[styles.td, {
              width: mtoColW[0] + mtoColW[1] + mtoColW[2] + mtoColW[3] + mtoColW[4] + mtoColW[5],
              textAlign: 'right', color: COLORS.amber, fontFamily: 'Helvetica-Bold',
            }]}>
              GRAND TOTAL
            </Text>
            <Text style={[styles.monoTd, {
              width: mtoColW[6], textAlign: 'right',
              color: COLORS.amber, fontFamily: 'Courier-Bold',
            }]}>
              {snapshot.mto.total_weight_kg.toFixed(2)}
            </Text>
          </View>
        </View>

        <PageFooter pageLabel="MTO" />
      </Page>

      {/* Diameter summary + concrete/formwork page */}
      <Page size="A4" style={styles.page}>
        <CompanyHeader />
        <Text style={[styles.h2, { marginTop: 0 }]}>Material Take-Off — Summary</Text>

        {/* Diameter summary table */}
        <Text style={styles.h3}>Rebar Diameter Summary</Text>
        <View style={styles.table}>
          <TableHeader
            headers={['Diameter (mm)', 'Marks', 'Total Length (m)', 'Weight (kg)']}
            widths={diaColW}
          />
          {diaSummary.map((d) => (
            <View key={d.dia} style={styles.tr}>
              <Text style={[styles.monoTd, { width: diaColW[0] }]}>{d.dia}</Text>
              <Text style={[styles.monoTd, { width: diaColW[1], textAlign: 'right' }]}>
                {d.count}
              </Text>
              <Text style={[styles.monoTd, { width: diaColW[2], textAlign: 'right' }]}>
                {d.totalM.toFixed(2)}
              </Text>
              <Text style={[styles.monoTd, { width: diaColW[3], textAlign: 'right' }]}>
                {d.totalKg.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>

        {/* Concrete volume table */}
        {snapshot.concreteSummary && snapshot.concreteSummary.length > 0 ? (
          <>
            <Text style={styles.h3}>Concrete Volume Summary</Text>
            <View style={styles.table}>
              <TableHeader
                headers={['Element Type', 'Label', 'Volume (m³)']}
                widths={[140, 200, 140]}
              />
              {snapshot.concreteSummary.map((cs, i) => (
                <View key={i} style={styles.tr}>
                  <Text style={[styles.td, { width: 140 }]}>{cs.element}</Text>
                  <Text style={[styles.td, { width: 200 }]}>{cs.label}</Text>
                  <Text style={[styles.monoTd, { width: 140, textAlign: 'right' }]}>
                    {cs.volume_m3.toFixed(3)}
                  </Text>
                </View>
              ))}
              <View style={[styles.tr, { backgroundColor: COLORS.surf3 }]}>
                <Text style={[styles.td, {
                  width: 340, textAlign: 'right', fontFamily: 'Helvetica-Bold',
                }]}>
                  Total
                </Text>
                <Text style={[styles.monoTd, {
                  width: 140, textAlign: 'right', fontFamily: 'Courier-Bold',
                }]}>
                  {snapshot.concreteSummary.reduce((s, c) => s + c.volume_m3, 0).toFixed(3)}
                </Text>
              </View>
            </View>
          </>
        ) : null}

        {/* Formwork area table */}
        {snapshot.formworkSummary && snapshot.formworkSummary.length > 0 ? (
          <>
            <Text style={styles.h3}>Formwork Area Summary</Text>
            <View style={styles.table}>
              <TableHeader
                headers={['Element Type', 'Label', 'Area (m²)']}
                widths={[140, 200, 140]}
              />
              {snapshot.formworkSummary.map((fw, i) => (
                <View key={i} style={styles.tr}>
                  <Text style={[styles.td, { width: 140 }]}>{fw.element}</Text>
                  <Text style={[styles.td, { width: 200 }]}>{fw.label}</Text>
                  <Text style={[styles.monoTd, { width: 140, textAlign: 'right' }]}>
                    {fw.area_m2.toFixed(3)}
                  </Text>
                </View>
              ))}
              <View style={[styles.tr, { backgroundColor: COLORS.surf3 }]}>
                <Text style={[styles.td, {
                  width: 340, textAlign: 'right', fontFamily: 'Helvetica-Bold',
                }]}>
                  Total
                </Text>
                <Text style={[styles.monoTd, {
                  width: 140, textAlign: 'right', fontFamily: 'Courier-Bold',
                }]}>
                  {snapshot.formworkSummary.reduce((s, f) => s + f.area_m2, 0).toFixed(3)}
                </Text>
              </View>
            </View>
          </>
        ) : null}

        <PageFooter pageLabel="MTO Summary" />
      </Page>
    </>
  )
}

// ─── APPENDIX A: STAAD MODEL DATA ───────────────────────────────────

function StaadAppendixPages({ snapshot }: { snapshot: ProjectSnapshot }) {
  const nodes = snapshot.staadNodes ?? []
  const members = snapshot.staadMembers ?? []
  const envelope = snapshot.staadEnvelope ?? []

  const nodeColW = [60, 90, 90, 90, 100]
  const memberColW = [60, 70, 70, 120, 80, 80]
  const envColW = [70, 100, 100, 100]

  // Split long tables into pages (~35 rows per page)
  const ROWS_PER_PAGE = 35

  const nodePages: typeof nodes[] = []
  for (let i = 0; i < nodes.length; i += ROWS_PER_PAGE) {
    nodePages.push(nodes.slice(i, i + ROWS_PER_PAGE))
  }

  const memberPages: typeof members[] = []
  for (let i = 0; i < members.length; i += ROWS_PER_PAGE) {
    memberPages.push(members.slice(i, i + ROWS_PER_PAGE))
  }

  const envPages: typeof envelope[] = []
  for (let i = 0; i < envelope.length; i += ROWS_PER_PAGE) {
    envPages.push(envelope.slice(i, i + ROWS_PER_PAGE))
  }

  return (
    <>
      {/* Nodes */}
      {nodePages.map((pageNodes, pi) => (
        <Page key={`nodes-${pi}`} size="A4" style={styles.page}>
          <CompanyHeader />
          {pi === 0 ? (
            <SectionHeading>Appendix A: STAAD Model Data</SectionHeading>
          ) : null}
          <Text style={styles.h3}>
            Node Coordinates{pi > 0 ? ' (continued)' : ''} — {nodes.length} nodes
          </Text>
          <View style={styles.table}>
            <TableHeader
              headers={['Node', 'X (mm)', 'Y (mm)', 'Z (mm)', 'Support']}
              widths={nodeColW}
            />
            {pageNodes.map((n) => (
              <View key={n.node_id} style={styles.tr}>
                <Text style={[styles.monoTd, { width: nodeColW[0] }]}>{n.node_id}</Text>
                <Text style={[styles.monoTd, { width: nodeColW[1], textAlign: 'right' }]}>
                  {n.x_mm.toFixed(0)}
                </Text>
                <Text style={[styles.monoTd, { width: nodeColW[2], textAlign: 'right' }]}>
                  {n.y_mm.toFixed(0)}
                </Text>
                <Text style={[styles.monoTd, { width: nodeColW[3], textAlign: 'right' }]}>
                  {n.z_mm.toFixed(0)}
                </Text>
                <Text style={[styles.td, { width: nodeColW[4] }]}>
                  {n.support_type ?? '—'}
                </Text>
              </View>
            ))}
          </View>
          <PageFooter pageLabel="Appendix A — Nodes" />
        </Page>
      ))}

      {/* Members */}
      {memberPages.map((pageMembers, pi) => (
        <Page key={`members-${pi}`} size="A4" style={styles.page}>
          <CompanyHeader />
          <Text style={styles.h3}>
            Members{pi > 0 ? ' (continued)' : ''} — {members.length} members
          </Text>
          <View style={styles.table}>
            <TableHeader
              headers={['Member', 'Start', 'End', 'Section', 'Length (mm)', 'Type']}
              widths={memberColW}
            />
            {pageMembers.map((m) => (
              <View key={m.member_id} style={styles.tr}>
                <Text style={[styles.monoTd, { width: memberColW[0] }]}>{m.member_id}</Text>
                <Text style={[styles.monoTd, { width: memberColW[1], textAlign: 'right' }]}>
                  {m.start_node_id}
                </Text>
                <Text style={[styles.monoTd, { width: memberColW[2], textAlign: 'right' }]}>
                  {m.end_node_id}
                </Text>
                <Text style={[styles.td, { width: memberColW[3] }]}>{m.section_name}</Text>
                <Text style={[styles.monoTd, { width: memberColW[4], textAlign: 'right' }]}>
                  {m.length_mm.toFixed(0)}
                </Text>
                <Text style={[styles.td, { width: memberColW[5] }]}>{m.member_type}</Text>
              </View>
            ))}
          </View>
          <PageFooter pageLabel="Appendix A — Members" />
        </Page>
      ))}

      {/* Force Envelope */}
      {envPages.length > 0 ? (
        <>
          {envPages.map((pageEnv, pi) => (
            <Page key={`env-${pi}`} size="A4" style={styles.page}>
              <CompanyHeader />
              <Text style={styles.h3}>
                Force Envelope{pi > 0 ? ' (continued)' : ''} — {envelope.length} members
              </Text>
              <View style={styles.table}>
                <TableHeader
                  headers={['Member', 'M+ max (kN·m)', 'M- max (kN·m)', 'Vu max (kN)']}
                  widths={envColW}
                />
                {pageEnv.map((e) => (
                  <View key={e.member_id} style={styles.tr}>
                    <Text style={[styles.monoTd, { width: envColW[0] }]}>{e.member_id}</Text>
                    <Text style={[styles.monoTd, { width: envColW[1], textAlign: 'right' }]}>
                      {e.mpos_max_knm.toFixed(2)}
                    </Text>
                    <Text style={[styles.monoTd, { width: envColW[2], textAlign: 'right' }]}>
                      {e.mneg_max_knm.toFixed(2)}
                    </Text>
                    <Text style={[styles.monoTd, { width: envColW[3], textAlign: 'right' }]}>
                      {e.vu_max_kn.toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
              <PageFooter pageLabel="Appendix A — Envelope" />
            </Page>
          ))}
        </>
      ) : null}
    </>
  )
}
