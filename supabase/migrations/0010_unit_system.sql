-- 0010 — Track STAAD unit system per sync
--
-- The bridge now detects STAAD's input unit system (e.g. kN-m, kip-ft)
-- and sends it in the payload. The sync route rejects payloads whose
-- unit system is not compatible with the app's internal units (kN, mm, kN·m, MPa).
-- Storing it on staad_syncs provides an audit trail.

ALTER TABLE public.staad_syncs
  ADD COLUMN IF NOT EXISTS unit_system text NOT NULL DEFAULT 'unknown';
