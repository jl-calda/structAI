-- 0009 — Standalone design mode
--
-- Adds manual load/demand columns to beam_designs, column_designs, and
-- footing_designs so designs can be created and run without a STAAD sync.
-- All new columns are nullable: when NULL the design is STAAD-linked
-- (member_ids drive diagram/envelope lookup); when set the API uses
-- these values directly.

-- ─── beam_designs ────────────────────────────────────────────────────────────

ALTER TABLE public.beam_designs
  ADD COLUMN IF NOT EXISTS manual_wu_kn_m      double precision,
  ADD COLUMN IF NOT EXISTS manual_pu_mid_kn    double precision,
  ADD COLUMN IF NOT EXISTS support_condition    text NOT NULL DEFAULT 'simply_supported'
    CHECK (support_condition IN (
      'simply_supported','fixed_fixed','fixed_pinned','cantilever','continuous'
    ));

-- ─── column_designs ──────────────────────────────────────────────────────────

ALTER TABLE public.column_designs
  ADD COLUMN IF NOT EXISTS manual_pu_kn          double precision,
  ADD COLUMN IF NOT EXISTS manual_mu_major_knm   double precision,
  ADD COLUMN IF NOT EXISTS manual_mu_minor_knm   double precision,
  ADD COLUMN IF NOT EXISTS manual_vu_kn          double precision;

-- ─── footing_designs ─────────────────────────────────────────────────────────

ALTER TABLE public.footing_designs
  ADD COLUMN IF NOT EXISTS manual_pu_kn    double precision,
  ADD COLUMN IF NOT EXISTS manual_mu_knm   double precision,
  ADD COLUMN IF NOT EXISTS col_b_mm        double precision,
  ADD COLUMN IF NOT EXISTS col_h_mm        double precision;
