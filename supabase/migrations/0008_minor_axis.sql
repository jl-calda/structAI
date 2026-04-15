-- ============================================================================
-- Migration 0008 — minor-axis moment + axial in staad_diagram_points and
-- staad_envelope so the column engine's biaxial Bresler path actually
-- activates (see lib/engineering/concrete/column/index.ts § biaxial).
--
-- Run AFTER 0007.
--
-- Columns added (all nullable / default 0 so existing rows don't need a
-- backfill; the bridge will start populating them from the next sync):
--
--   staad_diagram_points.my_knm       — minor-axis moment at this sample
--   staad_diagram_points.vz_kn        — minor-axis shear
--   staad_envelope.mpos_max_minor_knm + mpos_combo_minor — minor-axis M+
--   staad_envelope.mneg_max_minor_knm + mneg_combo_minor — minor-axis M−
-- ============================================================================

alter table public.staad_diagram_points
  add column if not exists my_knm double precision not null default 0,
  add column if not exists vz_kn  double precision not null default 0;

alter table public.staad_envelope
  add column if not exists mpos_max_minor_knm double precision not null default 0,
  add column if not exists mpos_combo_minor   int,
  add column if not exists mneg_max_minor_knm double precision not null default 0,
  add column if not exists mneg_combo_minor   int;
