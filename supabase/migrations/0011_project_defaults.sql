-- 0011 — Project-wide defaults for materials, cover, exposure, and seismic
--
-- The Setup page lets the user configure project defaults that propagate
-- to every new beam/column/slab/footing design form. Existing designs
-- keep their own fc/fy/cover (stored on the design row itself).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS default_fc_mpa          double precision NOT NULL DEFAULT 28,
  ADD COLUMN IF NOT EXISTS default_fy_mpa          double precision NOT NULL DEFAULT 420,
  ADD COLUMN IF NOT EXISTS default_fys_mpa         double precision NOT NULL DEFAULT 420,
  ADD COLUMN IF NOT EXISTS default_clear_cover_mm  double precision NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS default_density_kn_m3   double precision NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS seismic_zone            text NOT NULL DEFAULT 'Zone_4',
  ADD COLUMN IF NOT EXISTS exposure_class          text NOT NULL DEFAULT 'Interior',
  ADD COLUMN IF NOT EXISTS aggregate_type          text NOT NULL DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS lightweight_lambda      double precision NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS engineer_name           text NOT NULL DEFAULT '';
