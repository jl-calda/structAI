/**
 * Tag — 9px bold chip. Variants align with the colour tokens in
 * docs/07-design-system.md.
 *
 *   amber   → beams, pending, doubly reinforced
 *   blue    → columns, info, combos
 *   green   → pass, synced, complete
 *   red     → fail, mismatch
 *   purple  → reports, AI
 *   teal    → compression steel, slabs
 */
type Variant = 'amber' | 'blue' | 'green' | 'red' | 'purple' | 'teal'

const variantClass: Record<Variant, string> = {
  amber: 'ta',
  blue: 'tb',
  green: 'tg',
  red: 'tr',
  purple: 'tp',
  teal: 'tt',
}

export function Tag({
  children,
  variant = 'blue',
}: {
  children: React.ReactNode
  variant?: Variant
}) {
  return <span className={`tag ${variantClass[variant]}`}>{children}</span>
}
