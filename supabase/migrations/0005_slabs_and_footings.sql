-- ============================================================================
-- Migration 0005 — Slab + footing design tables.
-- Run AFTER 0004.
-- See docs/03-schema.md and docs/06-elements.md.
--
-- Slabs have NO member_ids — they are user-defined (docs/06 § Slab). Footings
-- link to a STAAD support node_id and, optionally, to the column_design that
-- sits above them (so column reactions inform footing geometry when the
-- column has already been designed).
-- ============================================================================

-- ─── Slab tables ────────────────────────────────────────────────────────────
create table if not exists public.slab_designs (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  label            text not null,
  slab_type        text not null default 'two_way'
    check (slab_type in ('one_way','two_way','flat_plate','flat_slab')),
  span_x_mm        double precision not null,
  span_y_mm        double precision not null,
  thickness_mm     double precision not null,
  DL_self_kPa      double precision not null default 0,
  SDL_kPa          double precision not null default 0,
  LL_kPa           double precision not null default 0,
  fc_mpa           double precision not null,
  fy_mpa           double precision not null,
  clear_cover_mm   double precision not null default 20,
  design_status    text not null default 'pending'
    check (design_status in ('pending','pass','fail','unverified')),
  last_designed_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint slab_designs_project_label_key unique (project_id, label)
);
create index if not exists slab_designs_project_idx on public.slab_designs(project_id);

create table if not exists public.slab_reinforcement (
  id                   uuid primary key default gen_random_uuid(),
  slab_design_id       uuid not null unique references public.slab_designs(id) on delete cascade,
  bar_dia_short_mm     int not null default 12,
  spacing_short_mm     int not null default 200,
  bar_dia_long_mm      int not null default 12,
  spacing_long_mm      int not null default 200,
  top_bar_dia_mm       int not null default 0,
  top_bar_spacing_mm   int not null default 0,
  top_bar_length_mm    int not null default 0,
  temp_bar_dia_mm      int not null default 10,
  temp_bar_spacing_mm  int not null default 300
);

create table if not exists public.slab_checks (
  id                   uuid primary key default gen_random_uuid(),
  slab_design_id       uuid not null unique references public.slab_designs(id) on delete cascade,

  Mu_x_kNm_per_m       double precision not null default 0,
  phi_Mn_x_kNm_per_m   double precision not null default 0,
  flexure_x_status     text not null default 'pending' check (flexure_x_status in ('pass','fail','pending')),

  Mu_y_kNm_per_m       double precision not null default 0,
  phi_Mn_y_kNm_per_m   double precision not null default 0,
  flexure_y_status     text not null default 'pending' check (flexure_y_status in ('pass','fail','pending')),

  Vu_kN_per_m          double precision not null default 0,
  phi_Vn_kN_per_m      double precision not null default 0,
  shear_status         text not null default 'pending' check (shear_status in ('pass','fail','pending')),

  deflection_ok        boolean not null default false,

  code_standard        text not null
    check (code_standard in ('NSCP_2015','ACI_318_19','EC2_2004','AS_3600_2018','CSA_A23_3_19')),
  checked_at           timestamptz not null default now(),
  overall_status       text not null default 'pending' check (overall_status in ('pass','fail','pending'))
);

drop trigger if exists slab_designs_touch_updated_at on public.slab_designs;
create trigger slab_designs_touch_updated_at
  before update on public.slab_designs
  for each row execute function public.touch_updated_at();

-- ─── Footing tables ─────────────────────────────────────────────────────────
create table if not exists public.footing_designs (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references public.projects(id) on delete cascade,
  label                 text not null,
  footing_type          text not null default 'isolated'
    check (footing_type in ('isolated','combined','strip')),
  node_id               int,
  column_design_id      uuid references public.column_designs(id) on delete set null,
  length_x_mm           double precision not null,
  width_y_mm            double precision not null,
  depth_mm              double precision not null,
  bearing_capacity_kPa  double precision not null,
  soil_depth_mm         double precision not null default 1500,
  fc_mpa                double precision not null,
  fy_mpa                double precision not null,
  clear_cover_mm        double precision not null default 75,
  design_status         text not null default 'pending'
    check (design_status in ('pending','pass','fail','unverified')),
  last_designed_at      timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint footing_designs_project_label_key unique (project_id, label)
);
create index if not exists footing_designs_project_idx on public.footing_designs(project_id);
create index if not exists footing_designs_column_idx on public.footing_designs(column_design_id);

create table if not exists public.footing_checks (
  id                      uuid primary key default gen_random_uuid(),
  footing_design_id       uuid not null unique references public.footing_designs(id) on delete cascade,

  Pu_kN                   double precision not null default 0,
  Mu_kNm                  double precision not null default 0,
  governing_combo         int,

  q_net_kPa               double precision not null default 0,
  bearing_status          text not null default 'pending' check (bearing_status in ('pass','fail','pending')),

  phi_Vn_oneway_kN        double precision not null default 0,
  shear_oneway_status     text not null default 'pending' check (shear_oneway_status in ('pass','fail','pending')),

  phi_Vn_twoway_kN        double precision not null default 0,
  shear_twoway_status     text not null default 'pending' check (shear_twoway_status in ('pass','fail','pending')),

  Mu_face_kNm             double precision not null default 0,
  phi_Mn_kNm              double precision not null default 0,
  flexure_status          text not null default 'pending' check (flexure_status in ('pass','fail','pending')),

  phi_Bn_kN               double precision not null default 0,
  bearing_col_status      text not null default 'pending' check (bearing_col_status in ('pass','fail','pending')),

  code_standard           text not null
    check (code_standard in ('NSCP_2015','ACI_318_19','EC2_2004','AS_3600_2018','CSA_A23_3_19')),
  checked_at              timestamptz not null default now(),
  overall_status          text not null default 'pending' check (overall_status in ('pass','fail','pending'))
);

drop trigger if exists footing_designs_touch_updated_at on public.footing_designs;
create trigger footing_designs_touch_updated_at
  before update on public.footing_designs
  for each row execute function public.touch_updated_at();
