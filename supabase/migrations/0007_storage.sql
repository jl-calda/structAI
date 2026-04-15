-- ============================================================================
-- Migration 0007 — Storage bucket for design reports.
-- Run AFTER 0006. Idempotent.
--
-- The Phase 5 `/api/reports/generate` route auto-creates this bucket on
-- first call via the Supabase JS client, but provisioning it here makes
-- the state of the world visible in the Supabase dashboard from day one
-- and removes a startup-time side effect. The bucket is private; reports
-- are served via signed URLs (see app/api/reports/generate/route.ts).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;
