/**
 * Bend-point computation — the beam-specific x where additional tension
 * bars (the ones bent down at supports) are no longer required.
 *
 * Definition (docs/05-beam-engine.md): the earliest point along a beam's
 * own M(x) curve where |M(x)| falls at or below phi·Mn(perimeter only).
 * That's the section where the 4 continuous corner bars by themselves
 * are enough.
 *
 * Per the spec, bend points are always beam-specific — do not average
 * across beams sharing the same rebar. The DB stores one beam_checks
 * row per beam, each with its own bend_point_left_mm / bend_point_right_mm.
 */
export type DiagramSample = {
  x_mm: number
  /** Moment in kN·m. Signed — positive = sagging, negative = hogging. */
  M_kNm: number
}

export type BendPoints = {
  /** Distance from the LEFT support (mm) where bars can be curtailed. */
  bend_point_left_mm: number
  /** Distance from the LEFT support (mm) where bars can be curtailed
   *  on the right-hand side. (Still measured from the left origin.) */
  bend_point_right_mm: number
}

/**
 * Find the bend points for one beam.
 *
 * @param diagram      Full M(x) for this beam, already stitched across
 *                     its member group.
 * @param totalSpan_mm Total beam length (sum of member lengths).
 * @param phiMnPerimeter_kNm Design moment capacity with ONLY the 4
 *                     corner bars. The algorithm scans inward from the
 *                     left support until |M(x)| ≤ this value, and
 *                     inward from the right support likewise.
 *
 * Walks the diagram linearly (samples are sorted by x). When the
 * moment magnitude crosses the threshold between two adjacent samples,
 * the crossing is linearly interpolated to give a smoother x.
 */
export function find_bend_points(
  diagram: DiagramSample[],
  totalSpan_mm: number,
  phiMnPerimeter_kNm: number,
): BendPoints {
  if (diagram.length === 0) {
    return { bend_point_left_mm: 0, bend_point_right_mm: totalSpan_mm }
  }

  const sorted = [...diagram].sort((a, b) => a.x_mm - b.x_mm)
  const threshold = Math.max(0, phiMnPerimeter_kNm)
  const absM = sorted.map((s) => Math.abs(s.M_kNm))

  // Left scan — find the first index where |M| <= threshold, coming
  // from the support end where |M| is typically highest (at supports
  // for a fixed beam; at midspan for a simply supported beam).
  let bend_left = 0
  for (let i = 0; i < sorted.length; i++) {
    if (absM[i] <= threshold) {
      if (i === 0) {
        bend_left = sorted[0].x_mm
      } else {
        // Interpolate between samples i-1 (above) and i (below).
        const x0 = sorted[i - 1].x_mm
        const x1 = sorted[i].x_mm
        const M0 = absM[i - 1]
        const M1 = absM[i]
        // Prevent a divide by zero in the rare flat case.
        const t = M0 === M1 ? 0 : (M0 - threshold) / (M0 - M1)
        bend_left = x0 + t * (x1 - x0)
      }
      break
    }
    // If we exit the loop without ever falling below threshold, leave
    // bend_left at 0 — bars are required all the way to mid-span.
  }

  // Right scan — same idea from the right.
  let bend_right = totalSpan_mm
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (absM[i] <= threshold) {
      if (i === sorted.length - 1) {
        bend_right = sorted[i].x_mm
      } else {
        const x0 = sorted[i].x_mm
        const x1 = sorted[i + 1].x_mm
        const M0 = absM[i]
        const M1 = absM[i + 1]
        const t = M0 === M1 ? 0 : (M0 - threshold) / (M0 - M1)
        bend_right = x0 + t * (x1 - x0)
      }
      break
    }
  }

  return {
    bend_point_left_mm: Math.max(0, Math.min(bend_left, totalSpan_mm)),
    bend_point_right_mm: Math.max(0, Math.min(bend_right, totalSpan_mm)),
  }
}
