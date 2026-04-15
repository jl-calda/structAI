'use client'

import type { Database } from '@/lib/supabase/types'

type MtoRow = Database['public']['Tables']['material_takeoff_items']['Row']

const CSV_HEADERS = [
  'Mark',
  'Ø (mm)',
  'Shape',
  'Element type',
  'Element',
  'Length per bar (mm)',
  'Quantity',
  'Total length (m)',
  'Unit weight (kg/m)',
  'Weight (kg)',
] as const

/**
 * CSV export + print button for the rebar schedule. Keeps everything
 * client-side — no server action needed — so the download is instant
 * and doesn't touch the DB.
 */
export function MtoExportBar({
  rows,
  filename = 'mto.csv',
}: {
  rows: MtoRow[]
  filename?: string
}) {
  const handleDownload = () => {
    const lines: string[] = [CSV_HEADERS.join(',')]
    for (const r of rows) {
      lines.push(
        [
          r.bar_mark,
          r.bar_dia_mm.toString(),
          r.bar_shape,
          r.element_type,
          r.element_label,
          r.length_mm.toFixed(0),
          r.quantity.toString(),
          r.total_length_m.toFixed(3),
          r.unit_weight_kg_m.toFixed(3),
          r.weight_kg.toFixed(3),
        ]
          .map(csvEscape)
          .join(','),
      )
    }
    // Grand total row so the CSV matches what's on screen.
    const total = rows.reduce((s, r) => s + r.weight_kg, 0)
    lines.push(
      [
        '', '', '', '', '', '', '', '', 'GRAND TOTAL',
        total.toFixed(3),
      ].map(csvEscape).join(','),
    )

    const blob = new Blob([lines.join('\n') + '\n'], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleDownload}
        disabled={rows.length === 0}
        className="rounded px-2 py-1 text-[11.5px] font-semibold disabled:opacity-60"
        style={{
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
        }}
      >
        Export CSV
      </button>
      <button
        type="button"
        onClick={handlePrint}
        disabled={rows.length === 0}
        className="rounded px-2 py-1 text-[11.5px] font-semibold disabled:opacity-60"
        style={{
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
        }}
      >
        Print
      </button>
    </div>
  )
}

function csvEscape(value: string): string {
  // Wrap in quotes if the value contains a comma, quote, or newline;
  // double any embedded quote per RFC 4180.
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
