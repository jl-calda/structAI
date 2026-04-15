-- ============================================================================
-- Migration 0004 — Column design tables.
-- Run AFTER 0003.
-- See docs/03-schema.md and docs/06-elements.md.
-- ============================================================================

create table if not exists public.column_designs (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  label            text not null,
  member_ids       int[] not null default '{}',
  section_name     text not null,
  b_mm             double precision not null,
  h_mm             double precision not null,
  height_mm        double precision not null,
  fc_mpa           double precision not null,
  fy_mpa           double precision not null,
  fys_mpa          double precision not null,
  clear_cover_mm   double precision not null default 40,
  design_status    text not null default 'pending'
    check (design_status in ('pending','pass','fail','unverified')),
  geometry_changed boolean not null default false,
  last_designed_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint column_designs_project_label_key unique (project_id, label)
);
create index if not exists column_designs_project_idx
  on public.column_designs(project_id);

create table if not exists public.column_reinforcement (
  id                      uuid primary key default gen_random_uuid(),
  column_design_id        uuid not null unique references public.column_designs(id) on delete cascade,
  bar_dia_mm              int not null default 20,
  bar_count               int not null default 4,
  tie_dia_mm              int not null default 10,
  tie_spacing_mm          int not null default 200,
  tie_spacing_end_mm      int not null default 100,
  tie_end_zone_length_mm  int not null default 500,
  is_seismic              boolean not null default false
);

create table if not exists public.column_checks (
  id                 uuid primary key default gen_random_uuid(),
  column_design_id   uuid not null unique references public.column_designs(id) on delete cascade,

  Pu_kN              double precision not null default 0,
  Mu_major_kNm       double precision not null default 0,
  Mu_minor_kNm       double precision not null default 0,
  governing_combo    int,

  phi_Pn_kN          double precision not null default 0,
  phi_Mn_kNm         double precision not null default 0,
  interaction_ratio  double precision not null default 0,
  axial_status       text not null default 'pending'
    check (axial_status in ('pass','fail','pending')),

  Vu_kN              double precision not null default 0,
  phi_Vn_kN          double precision not null default 0,
  shear_status       text not null default 'pending'
    check (shear_status in ('pass','fail','pending')),

  rho_percent        double precision not null default 0,
  rho_min_ok         boolean not null default false,
  rho_max_ok         boolean not null default true,

  klu_r              double precision not null default 0,
  slender            boolean not null default false,

  code_standard      text not null
    check (code_standard in (
      'NSCP_2015','ACI_318_19','EC2_2004','AS_3600_2018','CSA_A23_3_19'
    )),
  checked_at         timestamptz not null default now(),
  overall_status     text not null default 'pending'
    check (overall_status in ('pass','fail','pending'))
);

drop trigger if exists column_designs_touch_updated_at on public.column_designs;
create trigger column_designs_touch_updated_at
  before update on public.column_designs
  for each row execute function public.touch_updated_at();
