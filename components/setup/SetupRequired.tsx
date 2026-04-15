/**
 * Fallback UI when the Supabase env vars aren't set. Keeps the preview
 * deployment reachable (no 500) and tells the operator exactly what to
 * do. See docs/12-conventions.md § Environment variables.
 */
export function SetupRequired() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-[18px] font-semibold tracking-tight">StructAI</h1>
        <span
          className="mono text-[11.5px]"
          style={{ color: 'var(--color-text2)' }}
        >
          not configured
        </span>
      </header>

      <div
        className="rounded px-4 py-3 text-[12px]"
        style={{
          background: 'var(--color-amber-l)',
          color: 'var(--color-amber)',
          border: '0.5px solid var(--color-amber)',
        }}
      >
        <div className="font-semibold mb-1">Supabase not configured</div>
        <p style={{ color: 'var(--color-text)' }}>
          This deployment doesn&rsquo;t have database credentials set. The app is
          otherwise working — set the three env vars below on your host (or in
          <span className="mono"> .env.local</span> for local dev) and redeploy.
        </p>
      </div>

      <section className="card">
        <div className="ch">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text2)' }}>
            Required environment variables
          </span>
        </div>
        <div className="cb flex flex-col gap-1.5 text-[12px] mono">
          <EnvLine name="NEXT_PUBLIC_SUPABASE_URL" />
          <EnvLine name="NEXT_PUBLIC_SUPABASE_ANON_KEY" />
          <EnvLine name="SUPABASE_SERVICE_ROLE_KEY" />
          <EnvLine name="BRIDGE_SECRET" />
          <EnvLine name="ANTHROPIC_API_KEY" optional />
        </div>
      </section>

      <section className="card">
        <div className="ch">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text2)' }}>
            Next steps
          </span>
        </div>
        <div className="cb flex flex-col gap-2 text-[12.5px]"
             style={{ color: 'var(--color-text)' }}>
          <Step n={1}>
            Run <span className="mono">supabase/migrations/0001_object1_and_templates.sql</span>,{' '}
            <span className="mono">0002_beams.sql</span>, and{' '}
            <span className="mono">0003_mto.sql</span> against your Supabase
            project (SQL Editor or the CLI).
          </Step>
          <Step n={2}>
            Run <span className="mono">supabase/seed/load_templates.sql</span> to
            seed the NSCP 2015 and ACI 318-19 LRFD templates.
          </Step>
          <Step n={3}>
            Copy the Project URL + anon key + service-role key from your
            Supabase dashboard (Settings → API) into the env vars above.
          </Step>
          <Step n={4}>
            Redeploy. The dashboard lights up as soon as the three Supabase
            vars are present.
          </Step>
        </div>
      </section>
    </div>
  )
}

function EnvLine({ name, optional }: { name: string; optional?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span>{name}</span>
      <span style={{ color: 'var(--color-text2)' }}>
        {optional ? 'optional' : 'required'}
      </span>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span
        className="mono inline-flex items-center justify-center rounded text-[10px] font-semibold shrink-0"
        style={{
          background: 'var(--color-blue-l)',
          color: 'var(--color-blue)',
          width: 18,
          height: 18,
        }}
      >
        {n}
      </span>
      <div>{children}</div>
    </div>
  )
}
