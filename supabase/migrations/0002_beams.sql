-- ============================================================================
-- Migration 0002 — Beam design tables (Object 2 slice).
-- See docs/03-schema.md and docs/06-elements.md.
--
-- Shape notes:
-- * beam_designs.member_ids is an int[] — a physical beam can span multiple
--   STAAD members (docs/05-beam-engine.md). The engine stitches their M(x)
--   curves end-to-end.
-- * geometry_changed is set by the re-sync flow when any member in
--   member_ids changed between staad_syncs (Phase 2+).
-- * One beam_reinforcement row per beam_design (the shared rebar config).
-- * One beam_checks row per beam_design (bend points are per beam).
-- ============================================================================

create table if not exists public.beam_designs (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  label              text not null,
  member_ids         int[] not null default '{}',
  section_name       text not null,
  b_mm               double precision not null,
  h_mm               double precision not null,
  total_span_mm      double precision not null,
  fc_mpa             double precision not null,
  fy_mpa             double precision not null,
  fys_mpa            double precision not null,
  clear_cover_mm     double precision not null default 40,
  design_status      text not null default 'pending'
    check (design_status in ('pending','pass','fail','unverified')),
  geometry_changed   boolean not null default false,
  last_designed_at   timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint beam_designs_project_label_key unique (project_id, label)
);
create index if not exists beam_designs_project_idx
  on public.beam_designs(project_id);

create table if not exists public.beam_reinforcement (
  id                   uuid primary key default gen_random_uuid(),
  beam_design_id       uuid not null unique references public.beam_designs(id) on delete cascade,
  perimeter_dia_mm     int not null default 20,
  -- tension_layers: [{ layer, dia_mm, count, bent_down,
  --                    bend_point_left_mm, bend_point_right_mm }]
  tension_layers       jsonb not null default '[]'::jsonb,
  compression_dia_mm   int not null default 0,
  compression_count    int not null default 0,
  stirrup_dia_mm       int not null default 10,
  stirrup_legs         int not null default 2,
  -- stirrup_zones: [{ zone, start_mm, end_mm, spacing_mm }]
  stirrup_zones        jsonb not null default '[]'::jsonb
);

create table if not exists public.beam_checks (
  id                          uuid primary key default gen_random_uuid(),
  beam_design_id              uuid not null unique references public.beam_designs(id) on delete cascade,

  Mu_pos_kNm                  double precision not null default 0,
  Mu_pos_combo                int,
  Mu_neg_kNm                  double precision not null default 0,
  Mu_neg_combo                int,
  Vu_max_kN                   double precision not null default 0,
  Vu_combo                    int,

  d_mm                        double precision not null default 0,
  centroid_bot_mm             double precision not null default 0,
  centroid_top_mm             double precision not null default 0,
  As_required_mm2             double precision not null default 0,
  As_provided_mm2             double precision not null default 0,
  phi_Mn_pos_kNm              double precision not null default 0,
  flexure_pos_status          text not null default 'pending'
    check (flexure_pos_status in ('pass','fail','pending')),
  phi_Mn_neg_kNm              double precision not null default 0,
  flexure_neg_status          text not null default 'pending'
    check (flexure_neg_status in ('pass','fail','pending')),
  is_doubly_reinforced        boolean not null default false,
  phi_Mn_max_singly_kNm       double precision not null default 0,
  fsp_mpa                     double precision,

  Vc_kN                       double precision not null default 0,
  phi_Vn_kN                   double precision not null default 0,
  shear_status                text not null default 'pending'
    check (shear_status in ('pass','fail','pending')),

  bend_point_left_mm          double precision not null default 0,
  bend_point_right_mm         double precision not null default 0,
  perimeter_only_phi_Mn_kNm   double precision not null default 0,
  Ld_bottom_mm                double precision,
  Ld_top_mm                   double precision,
  lap_splice_mm               double precision,

  code_standard               text not null
    check (code_standard in (
      'NSCP_2015','ACI_318_19','EC2_2004','AS_3600_2018','CSA_A23_3_19'
    )),
  checked_at                  timestamptz not null default now(),
  overall_status              text not null default 'pending'
    check (overall_status in ('pass','fail','pending'))
);

-- updated_at trigger on beam_designs (uses the existing touch_updated_at()
-- function installed by migration 0001).
drop trigger if exists beam_designs_touch_updated_at on public.beam_designs;
create trigger beam_designs_touch_updated_at
  before update on public.beam_designs
  for each row execute function public.touch_updated_at();
