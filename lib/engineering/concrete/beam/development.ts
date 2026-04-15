/**
 * Development length helpers. All numbers come from the CodeProvider.
 */
import type { CodeProvider } from '@/lib/engineering/codes'

export function development_length(
  bar_dia_mm: number,
  fc_mpa: number,
  fy_mpa: number,
  is_top: boolean,
  bar_spacing_mm: number,
  code: CodeProvider,
): number {
  return code.Ld(bar_dia_mm, fc_mpa, fy_mpa, is_top, bar_spacing_mm)
}

export function lap_splice_length(
  Ld_mm: number,
  class_: 'A' | 'B',
  code: CodeProvider,
): number {
  return code.lap_splice(Ld_mm, class_)
}
