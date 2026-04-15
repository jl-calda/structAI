/**
 * Centralised environment access. Every `process.env.*` read in the app
 * should go through here so misnamed / missing variables fail loudly at
 * first use rather than silently becoming `undefined` deep in a request.
 *
 * Values are looked up lazily because route handlers, server components,
 * and the Supabase server client may each run in slightly different
 * environments during build vs. runtime.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in .env.local (see docs/12-conventions.md).`,
    )
  }
  return value
}

function optional(name: string): string | undefined {
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}

export const env = {
  get SUPABASE_URL() {
    return required('NEXT_PUBLIC_SUPABASE_URL')
  },
  get SUPABASE_ANON_KEY() {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return required('SUPABASE_SERVICE_ROLE_KEY')
  },
  get ANTHROPIC_API_KEY() {
    return required('ANTHROPIC_API_KEY')
  },
  get BRIDGE_URL() {
    return optional('BRIDGE_URL') ?? 'http://localhost:8765'
  },
  get BRIDGE_SECRET() {
    return required('BRIDGE_SECRET')
  },
}
