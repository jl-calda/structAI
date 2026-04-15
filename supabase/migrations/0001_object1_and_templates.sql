-- ============================================================================
-- Migration 0001 — Object 1 (STAAD mirror) + load_templates
-- See docs/03-schema.md for the authoritative shape.
-- Units: mm · kN · kN·m · MPa. No exceptions.
--
-- Upsert contract (docs/12-conventions.md + docs/08-routes.md:51):
-- every Object 1 table except `staad_syncs` (which is an append-only log)
-- carries a UNIQUE constraint on its natural STAAD key so the bridge can
-- `INSERT ... ON CONFLICT (...) DO UPDATE` without a prior lookup.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  client          text,
  location        text,
  code_standard   text not null default 'NSCP_2015'
    check (code_standard in (
      'NSCP_2015','ACI_318_19','EC2_2004','AS_3600_2018','CSA_A23_3_19'
    )),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- staad_syncs — append-only log of every bridge sync event
-- ---------------------------------------------------------------------------
create table if not exists public.staad_syncs (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  file_name           text not null,
  file_hash           text not null,
  synced_at           timestamptz not null default now(),
  status              text not null default 'ok'
    check (status in ('ok','error','mismatch')),
  node_count          int  not null default 0,
  member_count        int  not null default 0,
  mismatch_detected   boolean not null default false,
  mismatch_members    int[] not null default '{}'
);
create index if not exists staad_syncs_project_idx
  on public.staad_syncs(project_id, synced_at desc);

-- ---------------------------------------------------------------------------
-- staad_nodes
-- ---------------------------------------------------------------------------
create table if not exists public.staad_nodes (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  node_id       int  not null,
  x_mm          double precision not null,
  y_mm          double precision not null,
  z_mm          double precision not null,
  support_type  text
    check (support_type in ('fixed','pinned','roller_x','roller_z') or support_type is null),
  constraint staad_nodes_project_node_key unique (project_id, node_id)
);

-- ---------------------------------------------------------------------------
-- staad_members
-- ---------------------------------------------------------------------------
create table if not exists public.staad_members (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  member_id       int  not null,
  start_node_id   int  not null,
  end_node_id     int  not null,
  section_name    text not null,
  material_name   text,
  length_mm       double precision not null,
  beta_angle_deg  double precision not null default 0,
  member_type     text not null default 'other'
    check (member_type in ('beam','column','brace','other')),
  constraint staad_members_project_member_key unique (project_id, member_id)
);

-- ---------------------------------------------------------------------------
-- staad_sections
-- ---------------------------------------------------------------------------
create table if not exists public.staad_sections (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  section_name  text not null,
  section_type  text not null
    check (section_type in ('rectangular','i_section','circular')),
  b_mm          double precision,
  h_mm          double precision,
  area_mm2      double precision,
  i_major_mm4   double precision,
  i_minor_mm4   double precision,
  constraint staad_sections_project_name_key unique (project_id, section_name)
);

-- ---------------------------------------------------------------------------
-- staad_materials
-- ---------------------------------------------------------------------------
create table if not exists public.staad_materials (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  name            text not null,
  e_mpa           double precision not null,
  density_kn_m3   double precision not null,
  fc_mpa          double precision,
  fy_mpa          double precision,
  constraint staad_materials_project_name_key unique (project_id, name)
);

-- ---------------------------------------------------------------------------
-- staad_load_cases
-- ---------------------------------------------------------------------------
create table if not exists public.staad_load_cases (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  case_number  int  not null,
  title        text not null,
  load_type    text not null default 'other'
    check (load_type in (
      'dead','live','roof_live','wind_x','wind_z','seismic_x','seismic_z','other'
    )),
  constraint staad_load_cases_project_case_key unique (project_id, case_number)
);

-- ---------------------------------------------------------------------------
-- staad_combinations
-- factors: jsonb array of { case_number, load_type, factor }
-- ---------------------------------------------------------------------------
create table if not exists public.staad_combinations (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  combo_number  int  not null,
  title         text not null,
  factors       jsonb not null default '[]'::jsonb,
  source        text not null default 'imported'
    check (source in ('imported','app_generated')),
  constraint staad_combinations_project_combo_key unique (project_id, combo_number)
);

-- ---------------------------------------------------------------------------
-- staad_diagram_points — full M(x), V(x) at 11 ratios per member per combo.
-- docs/05-beam-engine.md and docs/13-bridge.md explain why this table is
-- non-negotiable: the beam engine reads the curve shape, not just peaks.
-- ---------------------------------------------------------------------------
create table if not exists public.staad_diagram_points (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  member_id     int  not null,
  combo_number  int  not null,
  x_ratio       double precision not null check (x_ratio >= 0 and x_ratio <= 1),
  x_mm          double precision not null,
  mz_knm        double precision not null,
  vy_kn         double precision not null,
  n_kn          double precision not null default 0,
  constraint staad_diagram_points_key
    unique (project_id, member_id, combo_number, x_ratio)
);
create index if not exists staad_diagram_points_member_idx
  on public.staad_diagram_points(project_id, member_id);

-- ---------------------------------------------------------------------------
-- staad_envelope — pre-computed per-member envelope, refreshed after sync
-- ---------------------------------------------------------------------------
create table if not exists public.staad_envelope (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references public.projects(id) on delete cascade,
  member_id               int  not null,
  mpos_max_knm            double precision not null default 0,
  mpos_combo              int,
  mneg_max_knm            double precision not null default 0,
  mneg_combo              int,
  vu_max_kn               double precision not null default 0,
  vu_combo                int,
  nu_tension_max_kn       double precision not null default 0,
  nu_compression_max_kn   double precision not null default 0,
  updated_at              timestamptz not null default now(),
  constraint staad_envelope_project_member_key unique (project_id, member_id)
);

-- ---------------------------------------------------------------------------
-- staad_reactions — support reactions per node per combo
-- ---------------------------------------------------------------------------
create table if not exists public.staad_reactions (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  node_id       int  not null,
  combo_number  int  not null,
  rx_kn         double precision not null default 0,
  ry_kn         double precision not null default 0,
  rz_kn         double precision not null default 0,
  mx_knm        double precision not null default 0,
  my_knm        double precision not null default 0,
  mz_knm        double precision not null default 0,
  constraint staad_reactions_key unique (project_id, node_id, combo_number)
);

-- ---------------------------------------------------------------------------
-- load_templates — system-provided combination templates keyed by code
-- ---------------------------------------------------------------------------
create table if not exists public.load_templates (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  code_standard  text not null
    check (code_standard in (
      'NSCP_2015','ACI_318_19','EC2_2004','AS_3600_2018','CSA_A23_3_19'
    )),
  is_system      boolean not null default false,
  combinations   jsonb not null default '[]'::jsonb
);
create unique index if not exists load_templates_system_unique
  on public.load_templates(code_standard, name) where is_system;

-- ---------------------------------------------------------------------------
-- updated_at trigger for projects
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();
