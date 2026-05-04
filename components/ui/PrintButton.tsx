'use client'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print-hide rounded px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
      style={{
        background: 'var(--color-surf3)',
        color: 'var(--color-text2)',
        border: '0.5px solid var(--color-border)',
      }}
    >
      Print
    </button>
  )
}
