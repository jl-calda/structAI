-- ============================================================================
-- Migration 0006 — design_reports.
-- Run AFTER 0005.
-- See docs/03-schema.md `design_reports` and docs/02-architecture.md
-- § Reports Without STAAD.
--
-- The generated PDF is uploaded to Supabase Storage (bucket: `reports`,
-- path: `{project_id}/{id}.pdf`). storage_url caches the public (or signed)
-- URL so report history doesn't require a second round-trip.
--
-- is_in_sync captures whether the STAAD hash at generation time matched
-- the project's most recent sync. Out-of-sync reports show a dimmed icon
-- in the history list (docs/10-ui-layouts.md § Reports).
-- ============================================================================

create table if not exists public.design_reports (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  title             text not null default 'Design Report',
  engineer_of_record text,
  scope             text not null default 'full'
    check (scope in ('full','beams','columns','slabs','footings','mto')),
  generated_at      timestamptz not null default now(),
  staad_file_name   text,
  staad_file_hash   text,
  synced_at         timestamptz,
  is_in_sync        boolean not null default false,
  storage_path      text,
  storage_url       text,
  page_count        int
);
create index if not exists design_reports_project_idx
  on public.design_reports(project_id, generated_at desc);
