-- ============================================================================
-- Seed: system load combination templates
-- Idempotent: uses ON CONFLICT on the partial unique index for is_system rows.
-- Run after migration 0001.
--
-- Combinations are stored as JSONB arrays of:
--   { title: string, factors: [{ load_type, factor }, ...] }
--
-- Only positive directions of W and E are seeded. The Phase 2 combo builder
-- is responsible for expanding to ± and for injecting STAAD case_numbers
-- into staad_combinations when generating the final project combos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ACI 318-19 LRFD (basic, without snow)
-- Reference: ACI 318-19 §5.3.1
-- ---------------------------------------------------------------------------
insert into public.load_templates (name, code_standard, is_system, combinations)
values (
  'ACI 318-19 LRFD (basic)',
  'ACI_318_19',
  true,
  $json$
  [
    { "title": "1.4D",
      "factors": [{ "load_type": "dead", "factor": 1.4 }] },
    { "title": "1.2D + 1.6L + 0.5Lr",
      "factors": [
        { "load_type": "dead", "factor": 1.2 },
        { "load_type": "live", "factor": 1.6 },
        { "load_type": "roof_live", "factor": 0.5 }
      ] },
    { "title": "1.2D + 1.6Lr + 1.0L",
      "factors": [
        { "load_type": "dead", "factor": 1.2 },
        { "load_type": "roof_live", "factor": 1.6 },
        { "load_type": "live", "factor": 1.0 }
      ] },
    { "title": "1.2D + 1.0Wx + 1.0L + 0.5Lr",
      "factors": [
        { "load_type": "dead", "factor": 1.2 },
        { "load_type": "wind_x", "factor": 1.0 },
        { "load_type": "live", "factor": 1.0 },
        { "load_type": "roof_live", "factor": 0.5 }
      ] },
    { "title": "1.2D + 1.0Wz + 1.0L + 0.5Lr",
      "factors": [
        { "load_type": "dead", "factor": 1.2 },
        { "load_type": "wind_z", "factor": 1.0 },
        { "load_type": "live", "factor": 1.0 },
        { "load_type": "roof_live", "factor": 0.5 }
      ] },
    { "title": "1.2D + 1.0Ex + 1.0L",
      "factors": [
        { "load_type": "dead", "factor": 1.2 },
        { "load_type": "seismic_x", "factor": 1.0 },
        { "load_type": "live", "factor": 1.0 }
      ] },
    { "title": "1.2D + 1.0Ez + 1.0L",
      "factors": [
        { "load_type": "dead", "factor": 1.2 },
        { "load_type": "seismic_z", "factor": 1.0 },
        { "load_type": "live", "factor": 1.0 }
      ] },
    { "title": "0.9D + 1.0Wx",
      "factors": [
        { "load_type": "dead", "factor": 0.9 },
        { "load_type": "wind_x", "factor": 1.0 }
      ] },
    { "title": "0.9D + 1.0Wz",
      "factors": [
        { "load_type": "dead", "factor": 0.9 },
        { "load_type": "wind_z", "factor": 1.0 }
      ] },
    { "title": "0.9D + 1.0Ex",
      "factors": [
        { "load_type": "dead", "factor": 0.9 },
        { "load_type": "seismic_x", "factor": 1.0 }
      ] },
    { "title": "0.9D + 1.0Ez",
      "factors": [
        { "load_type": "dead", "factor": 0.9 },
        { "load_type": "seismic_z", "factor": 1.0 }
      ] }
  ]
  $json$::jsonb
)
on conflict (code_standard, name) where is_system
do update set combinations = excluded.combinations;

-- ---------------------------------------------------------------------------
-- NSCP 2015 LRFD — ACI 318-11 lineage, identical combo set for the basic case.
-- Philippine seismic amplification (ρ, 0.2·SDS·D) is absorbed into the STAAD
-- seismic_x / seismic_z load cases, so factors remain 1.0 here.
-- Reference: NSCP 2015 §203.3.1
-- ---------------------------------------------------------------------------
insert into public.load_templates (name, code_standard, is_system, combinations)
values (
  'NSCP 2015 LRFD (basic)',
  'NSCP_2015',
  true,
  $json$
  [
    { "title": "1.4D",
      "factors": [{ "load_type": "dead", "factor": 1.4 }] },
    { "title": "1.2D + 1.6L + 0.5Lr",
      "factors": [
        { "load_type": "dead", "factor": 1.2 },
        { "load_type": "live", "factor": 1.6 },
        { "load_type": "roof_live", "factor": 0.5 }
      ] },
    { "title": "1.2D + 1.6Lr + 1.0L",
      "factors": [
        { "load_type": "dead", "factor": 1.2 },
        { "load_type": "roof_live", "factor": 1.6 },
        { "load_type": "live", "factor": 1.0 }
      ] },
    { "title": "1.2D + 1.0Wx + 1.0L + 0.5Lr",
      "factors": [
        { "load_type": "dead", "factor": 1.2 },
        { "load_type": "wind_x", "factor": 1.0 },
        { "load_type": "live", "factor": 1.0 },
        { "load_type": "roof_live", "factor": 0.5 }
      ] },
    { "title": "1.2D + 1.0Wz + 1.0L + 0.5Lr",
      "factors": [
        { "load_type": "dead", "factor": 1.2 },
        { "load_type": "wind_z", "factor": 1.0 },
        { "load_type": "live", "factor": 1.0 },
        { "load_type": "roof_live", "factor": 0.5 }
      ] },
    { "title": "1.2D + 1.0Ex + 1.0L",
      "factors": [
        { "load_type": "dead", "factor": 1.2 },
        { "load_type": "seismic_x", "factor": 1.0 },
        { "load_type": "live", "factor": 1.0 }
      ] },
    { "title": "1.2D + 1.0Ez + 1.0L",
      "factors": [
        { "load_type": "dead", "factor": 1.2 },
        { "load_type": "seismic_z", "factor": 1.0 },
        { "load_type": "live", "factor": 1.0 }
      ] },
    { "title": "0.9D + 1.0Wx",
      "factors": [
        { "load_type": "dead", "factor": 0.9 },
        { "load_type": "wind_x", "factor": 1.0 }
      ] },
    { "title": "0.9D + 1.0Wz",
      "factors": [
        { "load_type": "dead", "factor": 0.9 },
        { "load_type": "wind_z", "factor": 1.0 }
      ] },
    { "title": "0.9D + 1.0Ex",
      "factors": [
        { "load_type": "dead", "factor": 0.9 },
        { "load_type": "seismic_x", "factor": 1.0 }
      ] },
    { "title": "0.9D + 1.0Ez",
      "factors": [
        { "load_type": "dead", "factor": 0.9 },
        { "load_type": "seismic_z", "factor": 1.0 }
      ] }
  ]
  $json$::jsonb
)
on conflict (code_standard, name) where is_system
do update set combinations = excluded.combinations;
