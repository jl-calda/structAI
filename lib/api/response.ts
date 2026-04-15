/**
 * Unified API response envelope.
 * See docs/12-conventions.md `Error handling`.
 */
import { NextResponse } from 'next/server'

export type ApiSuccess<T> = { ok: true; data: T }
export type ApiFailure = { ok: false; error: string }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, init)
}

export function fail(
  error: string,
  status: 400 | 401 | 403 | 404 | 500 = 400,
): NextResponse<ApiFailure> {
  return NextResponse.json({ ok: false, error }, { status })
}
